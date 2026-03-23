# 统一 Routing Engine 重构设计稿

## 1. 背景

当前线上调度链路是两段式拼接：

1. [inbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
   先做人类 dispatch
2. [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
   再决定 AI 是否参与

这套链路能跑，但有 4 个结构性问题：

- 决策分裂：一条消息的最终去向不是一次决策得出，而是多段叠加
- 规则分裂：同一套 `routing_rules` 被人工 dispatch 和 AI routing 分开解释
- 可解释性差：运营很难稳定回答“为什么这条会话到了 AI / 人工 / 这个团队”
- 扩展受限：后续引入意图、事项、VIP、升级策略时会越来越难维护

本次重构目标不是继续补规则，而是把调度收口成单一决策核心。

## 2. 重构目标

新架构要满足：

1. 渠道消息进入后，只做一次核心调度决策
2. 一次决策同时产出人工、AI、回退、owner、状态计划
3. AI 和人工是平级执行资源，不再是“人工先定、AI 后插入”
4. handoff 不是重新猜一次，而是执行已有 fallback plan 或进入明确的二次决策
5. 调度轨迹、候选淘汰原因、转移链路都能完整追溯

## 3. 新模块边界

### 3.1 Conversation Intake

职责：

- 渠道消息标准化
- customer 识别
- thread 定位
- message 入库
- segment 补齐

保留模块：

- [channel-adapter.registry.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/channel-adapter.registry.ts)
- [conversation.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.service.ts)
- [conversation-segment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)
- [message.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

边界：

- 只负责“消息进入系统”
- 不再负责人工 dispatch 或 AI 选择

### 3.2 Routing Context Builder

新模块，职责是一次性收集决策上下文。

状态：✅ 已落地第一版，实现文件为
[routing-context.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-context.service.ts)

建议目录：

- `apps/api/src/modules/routing-context`

输出内容至少包括：

- channelType / channelId
- customer tier / language / tags
- thread status / current owner / current segment
- 当前事项标签或最近问题摘要
- module / skill group 偏好
- tenant operating mode
- active AI agents
- eligible teams / eligible agents
- presence / shift / break / load
- 最近 handoff / retransfer / SLA 历史

### 3.3 Unified Routing Engine

新模块，作为唯一调度核心。

状态：✅ 已落地第一版，实现文件为
[unified-routing-engine.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/unified-routing-engine.service.ts)

建议目录：

- `apps/api/src/modules/routing-engine`

职责：

- 匹配规则
- 计算执行模式
- 选 AI / human 候选
- 输出统一 `RoutingPlan`
- 产出完整 decision trace

它不负责真正发送消息，也不负责 orchestrator 推理。

### 3.4 Execution Orchestrator

新模块，负责执行 `RoutingPlan`。

状态：✅ 已落地 inbound 首段执行器，实现文件为
[routing-execution.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-execution.service.ts)

建议目录：

- `apps/api/src/modules/routing-execution`

职责：

- 更新 thread owner
- 更新 queue assignment
- 切换 segment
- 触发 AI 执行
- 触发人工待接单
- 执行 fallback plan

### 3.5 AI Runtime

保留 [orchestrator.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts)

状态：✅ 已完成“AI Runtime 不再负责选路由”的第一步。
[routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
现在只读取 `RoutingPlan.target.aiAgentId` 执行 AI，不再自行匹配 AI 路由规则。

新边界：

- 只负责 AI 执行
- 不负责选路由
- 不负责决定“是否应该先给 AI”
- 只返回：
  - response
  - confidence
  - shouldHandoff
  - handoffReason

### 3.6 Routing Audit

保留并继续增强当前调度审计域：

- [dispatch-audit.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/dispatch/dispatch-audit.service.ts)

后续建议重命名为：

- `routing-audit.service.ts`

因为它不再只服务人工 dispatch，而是统一记录整条 routing plan。

## 4. 新 RoutingPlan 模型

建议新增统一模型：

```ts
type RoutingPlan = {
  planId: string;
  tenantId: string;
  conversationId: string;
  segmentId: string | null;

  mode: "ai_first" | "human_first" | "ai_only" | "human_only" | "hybrid";
  triggerType:
    | "inbound_message"
    | "reopen"
    | "ai_handoff"
    | "manual_assign"
    | "manual_transfer"
    | "supervisor_transfer";

  currentOwner: {
    ownerType: "system" | "ai" | "agent";
    ownerId: string | null;
  };

  target: {
    moduleId: string | null;
    skillGroupId: string | null;
    departmentId: string | null;
    teamId: string | null;
    agentId: string | null;
    aiAgentId: string | null;
  };

  fallback: {
    departmentId: string | null;
    teamId: string | null;
    skillGroupId: string | null;
    strategy: "round_robin" | "least_busy" | "sticky" | null;
  } | null;

  statusPlan: {
    conversationStatus: "open" | "queued" | "bot_active" | "human_active" | "resolved";
    queueStatus: "pending" | "assigned" | "resolved";
    handoffRequired: boolean;
  };

  trace: {
    ruleId: string | null;
    ruleName: string | null;
    matchedConditions: Record<string, unknown>;
    candidates: Array<{
      candidateType: "department" | "team" | "agent" | "ai_agent";
      candidateId: string | null;
      candidateLabel: string;
      stage: string;
      accepted: boolean;
      rejectReason: string | null;
      details: Record<string, unknown>;
    }>;
    decisionReason: string;
  };
};
```

### 4.1 关键设计原则

- 一次入站只生成一个主 `RoutingPlan`
- 后续 AI handoff 可以生成新的 plan，但必须引用前一个 plan
- `RoutingPlan` 是唯一的“为什么这么调度”的主真相
- `queue_assignments` 和 thread owner 只是执行结果，不再承担决策语义

## 5. 新调度流程

### 5.1 Inbound 主流程

新的主链路应该是：

1. 渠道消息进入
2. Intake 完成 customer / thread / message / segment
3. Context Builder 构建 routing context
4. Unified Routing Engine 生成 `RoutingPlan`
5. Execution Orchestrator 执行 plan
6. 若目标是 AI，则异步调用 AI Runtime
7. AI 返回时：
   - 成功答复：按 plan 更新 owner/status
   - 触发 handoff：执行 fallback plan 或生成 handoff plan

### 5.2 Handoff 主流程

AI handoff 不应重新走旧式“再猜一次人工 dispatch”，而应遵循：

1. 优先使用主 `RoutingPlan.fallback`
2. fallback 无法执行时，再进入二次 routing
3. 二次 routing 也必须生成新的 `RoutingPlan`
4. plan 之间通过 `parent_plan_id` 关联

## 6. 当前代码迁移路径

### 阶段 1：引入新引擎，不动外围行为

目标：

- 先把两段逻辑合并到一个计划模型里
- 不改变当前 UI 与运营语义

动作：

1. ✅ 新建 `routing-context` 模块
2. ✅ 新建 `routing-engine` 模块
3. ✅ 新建 `routing-execution` 模块
4. ✅ 让 `inbound.worker` 不再直接调用 `dispatchService.decide`
5. ✅ 改为：
   - buildContext
   - createRoutingPlan
   - executeRoutingPlan

### 阶段 2：让 `routing.worker` 退出“选路由”职责

目标：

- `routing.worker` 只执行 AI

动作：

1. ✅ 删除 `routing.worker` 里的 `resolveActiveAIAgent()`
2. ✅ AI agent 改由 `RoutingPlan.target.aiAgentId` 提供
3. ✅ AI worker 只读取 plan，并执行 orchestrator

补充状态：✅ 统一引擎已不再直接依赖旧兼容层，人工分配逻辑已迁入
[human-dispatch.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/human-dispatch.service.ts)。

### 阶段 3：规则语义拆分

目标：

- 规则不再是一张“万能 actions JSON”

状态：部分完成

- ✅ 后端统一引擎已开始消费结构化规则语义：
  - `executionMode`
  - `humanTarget`
  - `aiTarget`
  - `fallbackTarget`
- ✅ 租户后台规则编辑器已支持显式配置上述结构
- ✅ 后端 `routing_rules` 读写已统一规范化存储为结构化 schema
- ✅ 历史 `routing_rules.actions` 已通过迁移统一回填为结构化 schema
- ✅ 统一引擎主链路已删除旧扁平字段兼容分支

动作：

1. 把规则拆成：
   - 匹配条件
   - 执行模式
   - 人工目标
   - AI 目标
   - fallback 目标
2. UI 上显式区分：
   - 哪些字段决定模式
   - 哪些字段决定人工
   - 哪些字段决定 AI
   - 哪些字段决定 fallback

### 阶段 4：引入事项级路由

目标：

- 让路由逐步从“thread 级”走向“issue/task 级”

当前状态：部分完成

- ✅ `RoutingContext` 已补入第一版事项摘要：
  - 最近消息预览
  - 最新会话摘要
  - 最近意图
  - 最近情绪
  - 客户标签
- ✅ 事项摘要已写入 `RoutingPlan.trace` 和调度审计 `inputSnapshot/decisionSummary`
- 未完成：独立 `conversation_cases / conversation_tasks`

动作：

1. ✅ 先在 routing context 中增加事项摘要
2. 后续再独立 `conversation_cases` 或 `conversation_tasks`

## 7. 哪些旧逻辑可以删

重构完成后，应删除以下旧逻辑。

### 7.1 直接删除

- [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
  中的：
  - `resolveActiveAIAgent()`
  - `matchesAIConditions()`
  - AI 规则匹配逻辑

- [dispatch.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/dispatch/dispatch.service.ts)
  中的：
  - 作为主决策入口的 `decide()`
  - 当前直接输出 `assignedAgentId` 的逻辑

当前状态：

- ✅ 统一引擎已经不再依赖该文件
- ✅ 外部模块已切到 `human-dispatch.service.ts`，旧兼容壳已删除

### 7.2 降级为兼容层

- [queue-assignment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing/queue-assignment.service.ts)

保留原因：

- 仍可作为执行结果快照表写入器

但不再承担：

- 主调度决策
- 主解释来源

### 7.3 文档层明确废弃

- 所有“人工 dispatch 后再 AI routing”的历史说明
- 所有把 `routing_rules` 解释为“统一已生效全链路规则”的文案

## 8. 哪些表需要重构

### 8.1 需要新增

#### `routing_plans`

存储每次统一调度计划。

状态：✅ 已新增表，迁移文件为
[20260418_059_unified_routing_engine.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260418_059_unified_routing_engine.ts)

建议字段：

- `plan_id`
- `tenant_id`
- `conversation_id`
- `segment_id`
- `parent_plan_id`
- `trigger_type`
- `mode`
- `target_snapshot`
- `fallback_snapshot`
- `status_plan`
- `decision_trace`
- `decision_reason`
- `created_at`

#### `routing_plan_steps`

存储 plan 执行过程。

状态：✅ 已新增表，并接入主链路步骤记录：
- [20260418_059_unified_routing_engine.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260418_059_unified_routing_engine.ts)
- [routing-plan-step.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-plan-step.service.ts)
- [inbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
- [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)

建议字段：

- `step_id`
- `plan_id`
- `step_type`
- `status`
- `payload`
- `created_at`

用途：

- 记录 AI 调用、fallback 执行、人工接管、失败重试

当前已记录：

- `plan_created`
- `inbound_plan_applied`
- `ai_runtime` 的 `started / skipped / completed / failed`

### 8.2 需要重构语义

#### `routing_rules`

当前问题：

- 一张表承载两段逻辑的不同语义

建议：

- 保留表名可以，但必须重构字段语义
- 最终至少要明确：
  - `conditions`
  - `execution_mode`
  - `human_target`
  - `ai_target`
  - `fallback_target`

当前状态：

- ✅ 引擎解析层已支持上述结构化语义
- ✅ 管理台编辑器已把这些字段拆开表达
- ✅ 后端保存时会统一规范化为结构化 schema
- ✅ 主链路与存量规则数据都已完成旧扁平字段兼容清理

#### `queue_assignments`

当前定位：

- 当前分配快照

新定位：

- 仍然只是执行层快照
- 不再作为调度判断真相

建议保留，但减少语义负担。

### 8.3 需要继续保留

- `conversations`
  作为 thread 主表
- `conversation_segments`
  作为接待段主表
- `messages`
  继续挂 thread + segment
- `dispatch_executions / dispatch_execution_candidates / dispatch_transitions`
  过渡期可保留，后续可迁移并并入 `routing_plans`

## 9. 路由规则未来应支持的条件

当前只稳定支持：

- `channelType`
- `customerLanguage`
- `customerTier`

统一引擎完成后，建议逐步扩到：

- customer tags
- recent handoff count
- latest issue type
- SLA urgency
- first-time vs returning customer
- recent unresolved case
- AI confidence threshold
- preferred team / historical owner

注意：

- 规则条件扩展必须以 `routing context` 为基础
- 不要再让 worker 直接自己查各类字段然后临时判断

## 10. 实施原则

1. 先统一决策，再扩策略
2. 先让 AI / human 在调度地位上平级，再谈更复杂智能化
3. 所有调度说明都以 `RoutingPlan.trace` 为准
4. `queue_assignments`、thread owner、conversation status 都是执行结果，不是决策来源
5. UI 配置必须显式表达字段语义，不能再让一套规则被两个引擎隐式分开解释

## 11. 推荐阅读顺序

1. [conversation-thread-segment-owner.md](/Users/ellis/Documents/nuychat/nuyess-chat/docs/conversation-thread-segment-owner.md)
2. [agent-presence-engine.md](/Users/ellis/Documents/nuychat/nuyess-chat/docs/agent-presence-engine.md)
3. 本文档

读完这三份文档后，新同学应能理解：

- 会话线程怎么组织
- 座席在线状态怎么计算
- 当前调度为什么需要重构
- 新统一 Routing Engine 应该如何落地
