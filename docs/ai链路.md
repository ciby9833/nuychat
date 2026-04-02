编译通过。现在给你**完整的架构过度设计诊断**。

---

## 🔍 NuyChat AI 架构 — 过度设计诊断

### 一条客户消息进来后的完整 LLM 调用链

```
消息到达
  │
  ├─ routing.worker.ts  →  判断是否走 AI
  │
  └─ orchestrator.run()
      │
      ├── [DB] listTenantSkillsForPlanning()     // 加载所有租户 skills
      ├── [DB] getConversationCapabilityState()   // 多轮状态
      ├── [DB] evaluatePreReplyPolicy()           // 预回复策略
      ├── [DB] getBoundRuntimePolicies()          // 运行时策略
      │
      ├── ⚡ LLM 调用 #1: suggestCapabilities()   // Planner: 选 skill
      │     输入: 所有 skill 的 {slug, name, description, triggerHints} + 对话历史
      │     输出: candidates[], requiresClarification
      │     Token 成本: ~900 output
      │
      ├── [DB] validateCapabilitySuggestions()    // 二次验证 planner 结果
      ├── [DB] recordSkillRun()                   // 写审计记录 #1
      ├── [DB] recordSkillExecutionTrace()        // 写审计记录 #2
      │
      ├── [DB+LLM] buildCustomerIntelligenceContext()  // 记忆上下文
      ├── [DB] buildFactSnapshot()                      // 事实层快照
      │
      ├── 构建 system prompt (base + persona + memory + facts + skill markdown)
      │
      ├── ⚡ LLM 调用 #2: callLLM() — 主循环 (最多 3 轮)
      │     │  输入: system prompt + 完整对话 + tool definitions
      │     │  如果 LLM 调了 tool:
      │     │    ├── evaluateSkillExecutionGate()           // 运行时策略检查
      │     │    ├── validateToolExecutionAgainstCandidates() // planner guard 检查
      │     │    ├── runCapabilityScriptExecution()          // 执行脚本
      │     │    ├── recordSkillInvocation()                 // 写审计记录 #3
      │     │    ├── recordSkillExecutionTrace()             // 写审计记录 #4
      │     │    ├── recordSkillExecutionAsTask()            // 写审计记录 #5
      │     │    └── 继续下一轮
      │     │
      │     ├── evaluatePointA() — 规则检查 (不调 LLM)
      │     └── revisePointA()  — 注入 hint (不调 LLM)
      │
      ├── ⚡ LLM 调用 #3: forcedFinal (如果最后一轮只有 tool 没有文本)
      │
      ├── evaluatePointB() — 规则检查 (不调 LLM)
      ├── ⚡ LLM 调用 #4: revisePointB() — 可能调 LLM 做 rewrite/clarify
      │
      ├── enforcePreReplyPolicy()     // 最终策略强制执行
      ├── [DB] upsertConversationCapabilityState()
      │
      ├── [async] appendWorkingMemory()
      ├── [async] upsertConversationInsight()
      ├── [async] scheduleConversationMemoryEncoding()  // → 异步 LLM 调用
      └── [async] scheduleExecutionArchive()            // → 写 long_task
```

### 最坏情况 Token 成本

| 调用 | 何时触发 | 估算 Token |
|------|----------|-----------|
| suggestCapabilities | 每次都调（除非 continuation/recent context） | ~2000 input + 900 output |
| callLLM 主循环 × 3 | tool 调用时 | ~4000 input + 2000 output × 3 |
| forcedFinal | 最后一轮有 tool 没文本 | ~4000 input + 1000 output |
| revisePointB (rewrite) | verifier 触发时 | ~3000 input + 1000 output |
| **总计最坏情况** | | **~25,000+ tokens** |

---

### 🔴 明确过度设计的部分

#### 1. `suggestCapabilities` — 独立 Planner LLM 调用（最大问题）

**问题**：这是一个独立的 LLM 调用，仅用于从 skill catalog 中选 1-5 个 candidate。然后 orchestrator 再把这些 skill 的**完整 markdown + inputSchema** 塞进 system prompt 给主 LLM 再看一遍。

**浪费**：
- Planner 看了 catalog 做选择 → ~3000 tokens
- 主 LLM 又看了选中 skill 的完整文档 → 重复理解
- 如果租户只有 1-3 个 skill，planner 完全是多余的

**建议**：
- **skill ≤ 5 个时**：直接把所有 skill 作为 tool definitions 给主 LLM，跳过 planner
- **skill > 5 个时**：用规则匹配（keyword/trigger hints）先过滤，只在候选 > 5 时才调 LLM planner
- 这一个改动就能**砍掉 30-50% 的 token 成本**

#### 2. `capability_state` — DB 驱动的多轮状态跟踪

**问题**：在 DB 里维护 `conversation_capability_states` 表追踪 "clarifying / active / completed" 状态，包括 `missingInputs`、`resolvedInputs`、`lastUserMessage` 等。

**浪费**：LLM 天然通过对话历史就能追踪多轮状态。你的对话历史已经 `LIMIT 20` 条消息了，这足够 LLM 自己记住 "上一轮我问了什么"。

**建议**：去掉 capability_state 表。如果需要 "continuation" 语义（客户还在同一个 skill 流程中），直接在 `checkRecentSkillContext` 基础上扩展即可。

#### 3. 审计记录过多 — 5 张表记同一次执行

一次 skill 执行会写入：
1. `skill_runs` — run 级别
2. `skill_execution_traces` — 每个 phase 一条
3. `skill_invocations` — 每次 tool call
4. `case_tasks` / `case_task_events` — AI task bridge
5. `ai_traces` — routing.worker 级别

**建议**：合并为 2 张表足够：
- `ai_traces` — 一次 orchestrator run 的完整记录（已有，加 JSONB 字段）
- `skill_invocations` — 每次 tool call 的审计（保留）
- 其余删除或合并进 `ai_traces.steps` JSONB

#### 4. `validateCapabilitySuggestions` + `validateToolExecutionAgainstCandidates` — 双重 Guard

**问题**：
- `validateCapabilitySuggestions`：检查 planner 推荐的 skill 是否在可用列表中
- `validateToolExecutionAgainstCandidates`：检查 LLM 调的 tool 是否在 candidate skills 中
- `evaluateSkillExecutionGate`：检查运行时策略（rate limit / permission）

三层检查中前两层其实是同一件事（skill 是否可用），因为 `buildRuntimeTools` 已经只暴露了 candidate skills 的 scripts。

**建议**：`buildRuntimeTools` 已经只给 LLM 合法的 tools → LLM 不可能调不存在的 tool → `validateToolExecutionAgainstCandidates` 冗余。只保留 `evaluateSkillExecutionGate`（rate limit / permission）。

#### 5. `pre-reply-policy` — 复杂度换来的价值有限

`evaluatePreReplyPolicy` + `enforcePreReplyPolicy` 在 LLM 调用前后各执行一次，主要检查 "某些 skill 是否必须执行"。但实际上：
- 如果 skill 是必须的，应该在 system prompt 里告诉 LLM
- policy enforcement 在 LLM 之后强制 handoff 会导致 token 浪费（LLM 白生成了回复）

---

### 🟡 可以保留但需简化的部分

#### 1. Verifier + Reviser（Point A / Point B）

当前实现是合理的架构思路，但规则太弱：
- `fact-conflict`：只做否定词检测（"not X" vs "X"）— 误报/漏报率高
- `insufficient-evidence`：只做关键词匹配 — 太粗糙

**建议**：保留框架，但如果规则不准，不如先关闭 reviser 的 LLM rewrite 功能（只保留 handoff 建议），避免白花 token。

#### 2. Fact Layer

`buildFactSnapshot` + `formatFactSnapshotForPrompt` 是好设计 — 把 tool 结果结构化后注入 prompt，让 LLM 有 ground truth。保留。

#### 3. Memory Layer

`buildCustomerIntelligenceContext` 合理 — 长期记忆 + 客户画像。保留。

---

### 🟢 设计合理的部分

- **主 agentic loop** (最多 3 轮) — 标准 tool-use 模式
- **skill 脚本执行** — 通过 `runCapabilityScriptExecution` 同步执行
- **Fact Layer** — tool 结果 → verified facts → prompt injection
- **Memory Layer** — 异步编码 + 长期检索
- **recent skill context guard** — 防重复调用

---

### 📊 推荐优先级

| 优先级 | 改动 | 预期收益 |
|--------|------|---------|
| **P0** | skill ≤ 5 时跳过 suggestCapabilities | 减少 30-50% token + 1 次 LLM 调用 |
| **P1** | 合并审计表（skill_runs + traces → ai_traces） | 减少 3-4 次 DB 写入 / 请求 |
| **P1** | 删除 `validateToolExecutionAgainstCandidates` | 减少无效检查 |
| **P2** | 简化 capability_state（去掉 DB 表，用 conversation context） | 减少 2 次 DB 查询 / 请求 |
| **P2** | pre-reply-policy 简化为 system prompt 指令 | 减少 2 次策略评估 |
| **P3** | Verifier 规则增强 或 暂时关闭 reviser LLM rewrite | 避免低质量 rewrite 浪费 token |

你想从哪个开始改？还是先讨论某个点的细节？