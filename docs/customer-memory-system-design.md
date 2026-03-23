# 客户记忆 / Encoder / 向量检索系统交接文档

## 1. 目的


1. 当前客户记忆系统的核心目标是什么
2. 记忆在运行时是如何被写入、压缩、检索、注入的
3. Encoder 现在如何工作，为什么这样设计
4. 向量库如何索引、重试、修复
5. 系统如何通过 trace / 评测 / 管理端形成持续优化闭环
6. 后续继续演进时，应该优先改哪里，避免踩什么坑

本文描述的是当前 `apps/api` 与 `apps/tenant-admin` 中已经落地的实现，不是纯方案稿。

## 2. 总体设计原则

当前实现遵循 4 条原则：

1. 记忆是系统层能力，不是 prompt 幻觉。
2. 不把客户全部历史会话一次性塞给模型。
3. Encoder 质量优先于向量库速度。
4. 记忆系统必须可观测、可评测、可修复。

因此，这套系统不是“一个 prompt + 一个模型 = 一个机器人”。

它的真实结构是：

- `Orchestrator`
  负责对话执行
- `Memory System`
  负责事件压缩、长期记忆、状态、画像
- `Encoder`
  负责把事件转成高质量可检索记忆
- `Vector Index Pipeline`
  负责嵌入、索引、失败重试、批量修复
- `Observability / Evaluation`
  负责 trace、召回观测、评测报告

## 3. 当前核心表结构

### 3.1 记忆主表

由 [20260424_072_customer_memory_v2.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260424_072_customer_memory_v2.ts) 建立：

- `conversation_memory_snapshots`
  会话级摘要、意图、情绪、关键实体
- `customer_memory_profiles`
  客户画像聚合结果
- `customer_memory_units`
  统一长期记忆单元
- `customer_memory_states`
  当前有效状态快照

### 3.2 可靠性与观测表

由 [20260424_073_customer_memory_reliability.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260424_073_customer_memory_reliability.ts) 建立：

- `memory_recall_traces`
  记录检索 query、lexical hit、vector hit、最终选中项
- `customer_memory_profiles.index_status / index_attempt_count / index_last_error / next_retry_at`
- `customer_memory_units.index_attempt_count / index_last_error / next_retry_at`

由 [20260424_074_memory_encoder_traces.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260424_074_memory_encoder_traces.ts) 建立：

- `memory_encoder_traces`
  记录 encoder 的 input、event frame、candidate、review、final

由 [20260424_075_memory_eval_reports.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260424_075_memory_eval_reports.ts) 建立：

- `memory_eval_datasets`
  租户级评测数据集
- `memory_eval_reports`
  评测运行结果

## 4. 运行时记忆链路

### 4.1 写入链路

#### 4.1.1 对话完成后的链路

入口在 [orchestrator.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts)：

1. AI 完成回复后，更新 Redis working memory
2. 调用 [upsertConversationInsight](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L454)
   写入 `conversation_memory_snapshots`
3. 同时写一条 `episodic_summary` 到 `customer_memory_units`
4. 触发 `memory_encode_conversation_event` 异步任务
5. 触发 `ai_execution_archive`

关键代码：

- [orchestrator.service.ts#L285](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L285)
- [orchestrator.service.ts#L429](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L429)

#### 4.1.2 任务完成后的链路

入口在 [task-engine.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts)：

1. 异步任务执行完成
2. 写任务产物、结果摘要
3. 写一条通用 `task_outcome` 记忆
4. 如果是订单/物流类任务，同步更新 `customer_memory_states`
5. 再异步触发 `memory_encode_task_event`

关键代码：

- [task-engine.service.ts#L248](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts#L248)
- [task-engine.service.ts#L403](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts#L403)

### 4.2 读取链路

运行时上下文组装在 [buildCustomerIntelligenceContext](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L901)：

注入顺序是：

1. Redis working memory
2. 当前会话 snapshot
3. 客户画像 `customer_memory_profiles.profile_summary`
4. 当前有效状态 `customer_memory_states`
5. 混合检索得到的相关长期记忆 `customer_memory_units`

注意：

- 不会把客户全部历史会话直接注入模型
- 只取当前 query 最相关的一小组长期记忆
- 同时记录 `memory_recall_traces`

关键代码：

- [customer-intelligence.service.ts#L743](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L743)
- [customer-intelligence.service.ts#L847](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L847)

## 5. Encoder 当前实现

### 5.1 为什么要单独做 Encoder

系统的目标不是“把原文向量化”，而是“把事件编码成可复用记忆”。

因此，Encoder 不直接等价于 embedding model。

它负责：

- 事件理解
- 结构化压缩
- 候选记忆生成
- 质量审查
- 去重与规范化

入口文件是 [memory-encoder.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts)。

### 5.2 三阶段编码

当前已经从“单次抽取”升级为三阶段编码：

#### 阶段 A：Event Framing

把一次对话或任务结果先转成事件框架：

- `stableFacts`
- `preferences`
- `unresolvedIssues`
- `commitments`
- `outcomes`
- `riskSignals`
- `profileTraits`

关键代码：

- [memory-encoder.service.ts#L120](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L120)

#### 阶段 B：Candidate Generation

基于事件框架生成候选长期记忆，类型严格限制在：

- `fact`
- `preference`
- `unresolved_issue`
- `commitment`
- `outcome`
- `risk_flag`
- `profile_trait`

关键代码：

- [memory-encoder.service.ts#L151](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L151)

#### 阶段 C：Quality Review

把候选记忆和已有长期记忆一起送入 reviewer 做严格审查：

- 去重
- 丢弃低质量候选
- canonical rewrite
- 调整 salience / confidence / expiry

关键代码：

- [memory-encoder.service.ts#L181](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L181)
- [memory-encoder.service.ts#L613](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L613)

### 5.3 为什么现在不再依赖硬编码偏好抽取

早期做法是从 summary 里用关键词猜 preference。

这个方案的问题：

- 跨语言不稳定
- 容易误判
- 难以维护
- 不能做高精度 review

现在已经删除旧的规则偏好抽取，统一交给结构化 encoder。

### 5.4 Preview 模式

为了离线评测，Encoder 同时支持只读预览：

- `persist !== false`
  生产写入
- `persist === false`
  只跑完整编码链路，不落正式记忆

关键代码：

- [memory-encoder.service.ts#L479](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L479)
- [memory-encoder.service.ts#L716](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L716)

这保证了离线评测与生产逻辑使用同一套编码器，而不是两套分叉逻辑。

## 6. 长期记忆与客户画像

### 6.1 `customer_memory_units`

这是长期记忆的主容器。

设计特征：

- 原子化 memory unit
- 统一指纹去重 `fingerprint`
- 有 `salience / confidence / expires_at`
- 有 `embedding_input`
- 有 `index_status`

批量写入在：

- [recordCustomerMemoryItems](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L578)

### 6.2 `customer_memory_profiles`

这是长期聚合画像，不是原始记忆表。

作用：

- 把近期 episode、长期偏好、当前状态压缩成一份 profile summary
- 作为模型高层背景
- 同时也进入向量索引

重建逻辑在：

- [rebuildCustomerProfile](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L177)

### 6.3 `customer_memory_states`

这是“当前生效状态”，例如：

- 订单状态
- 物流状态
- 退款进度

特点：

- 与长期事实分离
- 有 `expires_at`
- 会参与 profile 聚合

## 7. 检索与向量库

### 7.1 向量库定位

向量库不是“记忆系统本体”，只是检索加速与语义召回层。

当前使用 Qdrant，入口在：

- [vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/vector-memory.service.ts)

当前 collection：

- `customer_memory_profiles_v2`
- `customer_memory_units_v2`

### 7.2 为什么分 profile 和 memory unit 两个 collection

因为两者用途不同：

- profile vector
  适合做客户级相似召回
- memory unit vector
  适合做当前 query 的细粒度记忆召回

不能用一个 collection 混在一起，否则召回目标会混乱。

### 7.3 当前检索策略

长期记忆召回是混合检索，不是纯向量：

1. 先 lexical 检索
2. 不足时补 vector 检索
3. 最终按 `lexical + vector + salience + freshness` 混合排序

关键代码：

- [customer-intelligence.service.ts#L743](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L743)

这点很重要：

- 向量负责 semantic recall
- lexical 负责精确词项 / 编号 / 特殊名词
- salience / freshness 保证业务优先级

## 8. 向量索引修复链路

### 8.1 为什么要任务化

早期 best-effort 同步索引的问题是：

- OpenAI embedding 失败就直接丢
- Qdrant 抖动没有后续补偿
- 无法批量重建
- 无法观测失败率

现在 profile 与 memory unit 的向量同步都改为任务化。

### 8.2 Profile 索引任务

由 [task-vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts#L29) 调度与执行：

- `vector_customer_profile_reindex`

状态字段：

- `index_status`
- `index_attempt_count`
- `index_last_error`
- `next_retry_at`

### 8.3 Memory Unit 索引任务

同样由 [task-vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts#L53) 与 [task-vector-memory.service.ts#L260](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts#L260) 负责：

- `vector_memory_unit_reindex`

### 8.4 后台修复 worker

周期 worker 会扫描：

- dirty / pending / failed 的 profile
- pending / failed 的 memory unit

然后重新入队。

关键代码：

- [customer-profile-refresh.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/customer-profile-refresh.service.ts)
- [customer-profile-refresh.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/customer-profile-refresh.worker.ts)

### 8.5 批量重建

支持租户级批量重建：

- `vector_batch_reindex`

关键代码：

- [task-vector-memory.service.ts#L371](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts#L371)

## 9. 可观测性与持续修复

### 9.1 Recall Trace

每次上下文构建会记录：

- queryText
- lexical hits
- vector hits
- selected hits

落在：

- `memory_recall_traces`

作用：

- 看召回是否为空
- 看 lexical / vector 哪边在起作用
- 看最终选中项质量

### 9.2 Encoder Trace

每次编码会记录：

- 输入上下文
- event frame
- candidate items
- reviewed items
- final items
- metrics

落在：

- `memory_encoder_traces`

作用：

- 看 encoder 是否产出太多噪音
- 看 reviewer 是否过严或过松
- 做人工抽检

### 9.3 Eval Dataset / Report

系统支持租户级离线评测闭环：

- `memory_eval_datasets`
- `memory_eval_reports`

当前主要指标：

- `precision`
- `duplicateRate`
- `staleMemoryRate`

注意：

- 当前 precision 是“预测命中 gold active / 总预测”
- duplicate rate 是“重复预测数 / 总预测”
- stale rate 是“预测命中 gold stale / 总预测”

这是第一版指标，不是最终版。

## 10. 管理端可视化

当前租户管理端已经接入 `Memory QA` 页面。

前端入口：

- [DashboardPage.tsx](/Users/ellis/Documents/nuychat/nuyess-chat/apps/tenant-admin/src/tenant/pages/DashboardPage.tsx#L44)
- [MemoryQaTab.tsx](/Users/ellis/Documents/nuychat/nuyess-chat/apps/tenant-admin/src/tenant/modules/memory-qa/MemoryQaTab.tsx)

页面包含两块：

1. `Encoder Traces`
   看 trace 列表与详情
2. `Evaluation`
   管理评测数据集、运行评测、看报告

后端接口：

- [tenant-memory-observability.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-memory-observability.routes.ts)

## 11. 离线工具

当前有两支脚本：

### 11.1 导出评测模板

- [memory-eval-export.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/scripts/memory-eval-export.ts)

用途：

- 从真实租户会话导出评测样本模板
- 人工补充 `goldActiveMemories / goldStaleMemories`

### 11.2 跑离线评测

- [memory-eval-run.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/scripts/memory-eval-run.ts)

用途：

- 对数据集运行只读版 encoder
- 输出报告 JSON

## 12. 系统如何“持续修复 / 调整 / 自我进化”

这里的“自我进化”不是模型自动改代码，而是系统化闭环：

### 12.1 线上运行产生 trace

- recall trace
- encoder trace

### 12.2 运营或开发人工抽检

观察：

- candidate 太多还是太少
- reviewer 是否误杀
- stale memory 是否太高
- 哪类 unresolved_issue 没记住

### 12.3 从真实会话构建评测集

把线上问题会话加入 `memory_eval_datasets`，形成更贴近业务的 gold set。

### 12.4 用同一套生产 encoder 跑离线评测

通过 `previewConversationMemories(... persist: false)` 跑出新结果。

### 12.5 调整 3 类东西

1. Encoder prompt
   影响 framing / candidate / review
2. Memory schema
   影响记忆类型与粒度
3. Retrieval / ranking
   影响真正注入模型的记忆集合

### 12.6 批量重建向量索引

当以下内容变化时，需要重建向量：

- `embedding_input` 规则变化
- profile 聚合逻辑变化
- embedding model 变化
- 大批量记忆重写

### 12.7 再观察线上 trace

形成闭环：

`production traces -> dataset -> offline eval -> prompt/schema/ranking update -> reindex -> production traces`

这就是当前系统的持续演进方式。

## 13. 当前已知限制

### 13.1 评测还不是任务化异步执行

当前管理端“运行评测”是同步请求执行。

问题：

- 大数据集会慢
- 容易超时

后续建议：

- 把评测也收进 `async_tasks`

### 13.2 评测数据集还没有在线标注器

现在创建 dataset 主要靠粘贴 JSON。

后续建议：

- 从管理端会话列表直接选样本
- 在线编辑 gold memories

### 13.3 还没有真正的 reranker model

目前 reviewer 是 LLM quality review，不是独立 cross-encoder reranker。

后续建议：

- 如果量大且稳定，可以考虑把 reviewer 逐步半结构化、规则化、甚至替换为专门 reranker

### 13.4 向量 embedding model 仍使用 OpenAI `text-embedding-3-small`

当前优点：

- 成本低
- 稳定

缺点：

- 不一定是多语言客服场景最优

后续建议：

- 如果业务更偏中英印尼语混合，可以实验更强 embedding 模型，但要注意“不同 embedding space 不兼容”，升级时要全量重建索引

## 14. 接手开发时的优先级建议

如果后续有人继续接手，建议按这个顺序推进：

1. 先看管理端 `Memory QA`
   理解 trace、评测报告、当前表现
2. 再看 `memory-encoder.service.ts`
   这是系统质量上限所在
3. 再看 `customer-intelligence.service.ts`
   理解 profile 聚合与检索注入
4. 再看 `task-vector-memory.service.ts`
   理解索引修复与重建
5. 最后再动 embedding / schema / ranking

不要一上来先改 Qdrant 或只换 embedding model。

## 15. 结论

当前系统已经不是“把历史会话简单存一下，再做相似度搜索”。

它已经具备：

- 分层记忆
- 结构化 encoder
- reviewer 质量控制
- profile 聚合
- 混合检索
- 向量索引修复
- recall trace
- encoder trace
- 离线评测
- 租户管理端可视化

因此，它现在更接近一套可持续迭代的“客户记忆平台”，而不是一次性拼出来的 prompt 技巧。

后续真正决定系统上限的，依然是两件事：

1. Encoder 是否持续变得更准
2. 评测闭环是否持续用真实业务数据驱动
