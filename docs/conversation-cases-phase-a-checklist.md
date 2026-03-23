# Conversation Cases 阶段 A 实施 Checklist

## 1. 使用范围

这份 checklist 只服务于：

- `conversation_cases` 阶段 A 最小实现

不包含：

- 自动 case 分类
- 多 active case
- case 技能编排
- 完整 case 前端工作台
- 复杂质检/SLA 重算

原则：

- 先把数据主模型立起来
- 再改主链路
- 最后再补外围页面

## 2. 迁移脚本清单

按顺序执行。

### 2.1 新建主表

必须新增：

- ✅ `conversation_cases`

建议包含：

- 主键、状态、owner、summary、priority、时间字段
- `(tenant_id, conversation_id)` 的 active case 唯一约束

### 2.2 现有表加列

必须新增：

- ✅ `conversations.current_case_id`
- ✅ `conversation_segments.case_id`
- ✅ `messages.case_id`
- ✅ `async_tasks.case_id`

建议同步新增：

- ✅ `customer_memory_items.case_id`
- `customer_state_snapshots.case_id`
  延后：当前表是纯客户状态快照，没有稳定 `conversation/case` 归属依据，现阶段硬回填会污染状态模型

可选但推荐：

- `case_intelligence`

### 2.3 索引与约束

必须新增：

- `conversation_cases(tenant_id, conversation_id, status, last_activity_at desc)`
- `conversation_cases(tenant_id, current_owner_type, current_owner_id, status)`
- `conversation_segments.case_id -> conversation_cases.case_id`
- `messages.case_id -> conversation_cases.case_id`
- `async_tasks.case_id -> conversation_cases.case_id`

### 2.4 历史回填脚本

必须新增：

- ✅ 为每个现有 `conversation` 创建一个历史 case
- ✅ 将该 thread 下：
  - `segments`
  - `messages`
  - `async_tasks`
  回填到这个 case
- ✅ 为活跃 thread 写回 `conversations.current_case_id`

### 2.5 废弃逻辑清理迁移

这一项不一定是 SQL migration，也可以是代码清理任务。

必须确认：

- 后续不再把 `conversation reopen` 视为“同一问题 reopen”
- 旧逻辑只允许复用 thread，不允许复用旧问题语义

## 3. 服务改造顺序

按下面顺序改，避免半路出现数据主真相切换。

### 3.1 先新增 `ConversationCaseService`

必须先有内部服务，再切入口。

最小方法：

- `getOrCreateActiveCase`
- `createCase`
- `resolveCase`
- `closeCase`
- `setCurrentOwner`
- `attachSegment`
- `attachTask`

当前状态：

- ✅ 已新增最小 `ConversationCaseService`
- ✅ 已落地：`getOrCreateActiveCase / closeCase / setCurrentOwner / clearCurrentOwnership`
- 延后：`createCase / resolveCase / attachSegment / attachTask`

### 3.2 改 intake 主链路

优先级最高。

涉及：

- [`inbound.worker.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
- [`conversation.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.service.ts)

目标：

- thread 定位后，必须先定位/创建 active case
- 不允许 message 在没有 case 的情况下写入

当前状态：

- ✅ [`inbound.worker.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts) 已接入 `getOrCreateActiveCase`
- ✅ intake 结束前会强校验 `current_case_id`

### 3.3 改 message 写入链路

涉及：

- [`message.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

目标：

- inbound/outbound 都必须带 `case_id`
- 若当前 thread 没有 `current_case_id`，直接报错或由上游先补 case

当前状态：

- ✅ [`message.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts) 已改为 inbound/outbound 都写 `case_id`
- ✅ 若 thread 没有 `current_case_id`，现在直接报错

### 3.4 改 segment 链路

涉及：

- [`conversation-segment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)

目标：

- 所有新 segment 创建都要绑定 `case_id`
- case owner 与当前 active segment owner 保持一致

当前状态：

- ✅ [`conversation-segment.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts) 已改为所有新 segment 自动绑定 `current_case_id`
- ✅ 切段时会同步更新 `conversation_cases.current_segment_id / current_owner_*`
- ✅ 关段并清空当前 segment 时，会同步清空 case 的当前 segment/owner

### 3.5 改 routing context / routing plan

涉及：

- [`routing-context.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-context.service.ts)
- [`unified-routing-engine.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/unified-routing-engine.service.ts)

目标：

- routing context 必须带 `case_id`
- 事项摘要优先从 case 读，而不是 conversation 读

当前状态：

- ✅ [`routing-context.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-context.service.ts) 已正式带上 `case_id`
- ✅ [`routing_plans`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-plan.repository.ts) 已落 `case_id`
- ✅ routing context 已优先从 `conversation_cases` 读取 owner / summary，再回退到线程级 intelligence
- ✅ AI runtime、transfer、resolve 的 case 状态流转已在后续 3.6 收口

### 3.6 改 AI runtime / transfer / resolve

涉及：

- [`routing.worker.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
- [`conversation.routes.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
- [`tenant-admin.routes.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-admin.routes.ts)

目标：

- AI 转人工、人工转人工、人工转 AI，都以 case 为主语义
- 解决动作优先解决 case，再决定 thread 展示状态

当前状态：

- ✅ `switchToHumanSegment / switchToAISegment / switchToSystemSegment` 已通过 `ConversationSegmentService` 自动同步 case owner/status
- ✅ `resolve / supervisor force-close` 已改为先关 segment/case，再清 thread 当前指针
- ✅ `resolve / supervisor force-close` 会清掉 `conversations.current_case_id`
- ✅ `ConversationCaseService` 已新增 `setCurrentOwner / closeCase / clearCurrentOwnership` 服务化入口
- ✅ `transfer / supervisor transfer / AI handoff` 已通过 `ConversationSegmentService` 间接收口到 case owner/status
- ✅ `outbound.worker.ts` 已修复“resolved/closed thread 上人工主动发消息”链路：先创建新 active case，再切 human segment，再写消息
- ✅ `conversation-timeout.worker.ts` 已修复 idle auto-resolve：会先关闭当前 segment/case，再清 thread 当前指针和 queue 状态

### 3.7 改 async task 链路

涉及：

- [`task-scheduler.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-scheduler.service.ts)
- [`task-engine.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts)

目标：

- 所有新任务必须挂 `case_id`
- `conversation_id` 降级为辅助字段

当前状态：

- ✅ `TaskScheduleJobPayload` 已支持 `caseId`
- ✅ `task-scheduler.worker.ts` 已优先写入显式 `caseId`，无显式值时会从当前 thread 解析 `current_case_id`
- ✅ `task-engine.service.ts` 已按 `case_id` 传播任务结果到 memory
- ✅ `task-publisher.worker.ts` 写回 conversation 的系统消息时已带上 `case_id`
- ✅ `conversation resolve` 后触发的 profile reindex 已显式保留原 `caseId`

### 3.8 改记忆链路

涉及：

- [`customer-intelligence.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)

目标：

- 先让 case summary 能稳定写入和读取
- customer memory 只做长期沉淀

当前状态：

- ✅ `upsertConversationInsight` 已同步写入 `conversation_intelligence.case_id`
- ✅ `upsertConversationInsight` 已同步更新 `customer_memory_items.case_id`
- ✅ AI 摘要写入时会同步刷新 `conversation_cases.summary`
- 未完成：独立 `case_intelligence` 与 customer profile 聚合的 case-aware 重算

## 4. 必须先改的入口点

这些入口如果不先改，后面会出现一半有 case、一半没有 case 的脏状态。

### 4.1 `inbound.worker`

必须第一个改。

原因：

- 所有渠道消息都从这里进
- 这是建立 case 主真相的入口

### 4.2 `MessageService`

必须第二个改。

原因：

- 消息是最核心事实表
- 如果消息还不挂 `case_id`，后面所有 case 统计都会失真

### 4.3 `ConversationSegmentService`

必须第三个改。

原因：

- owner 变更、转移、AI/人工切换都依赖它

### 4.4 `RoutingContextService`

必须第四个改。

原因：

- 新调度必须围绕 case，不然只是“表结构有 case，调度仍然不认 case”

## 5. 可延后的后台/前端项

这些都不要抢在主链路之前做。

### 5.1 可延后的后台项

- `GET /api/admin/cases`
- `GET /api/admin/cases/:caseId`
- case 级运营统计
- case 级 SLA 看板
- case 级满意度看板

原因：

- 没有稳定 case 写入前，先做这些只会消费脏数据

### 5.2 可延后的座席前端项

- thread 下 case 列表 UI
- 手工新建 case UI
- case 切换 UI
- case 详情侧栏

原因：

- 阶段 A 先默认一个 thread 只有一个 active case
- 前端暂时不需要复杂操作界面

### 5.3 可延后的 AI / Skill 项

- 自动 case 分类
- case summary skill
- task planner skill
- escalation skill

原因：

- 这些都建立在 case 基础能力已经稳定存在之上

## 6. 每一步的验收标准

### 6.1 数据层验收

必须满足：

- 任意活跃 thread 都有 `current_case_id`
- 任意新写入消息都有 `case_id`
- 任意 active segment 都有 `case_id`
- 任意新任务都有 `case_id`

### 6.2 行为层验收

必须满足：

- 新客户消息进入后会自动进入 active case
- 人工接管 / 转移不会丢 case
- AI 转人工不会新开脏 case
- 解决动作会解决当前 case

### 6.3 查询层验收

必须满足：

- 能从 case 查到：
  - thread
  - segment
  - messages
  - tasks
- 能从 thread 找到当前 case

## 7. 建议的实施批次

### 批次 1：数据模型

- ✅ 建表
- ✅ 加列
- ✅ 索引
- ✅ 回填脚本

当前状态补充：

- ✅ `conversation / segment / message / async_task(有 conversation_id)` 已完成历史 case 回填
- 保留 1 类延后项：没有 `conversation_id` 的孤立任务仍保持不挂 case，这类任务不属于阶段 A 的 thread/case 主链路

### 批次 2：主链路

- ✅ inbound
- ✅ case service
- ✅ message
- ✅ segment

### 批次 3：调度与执行

- routing context
- routing plan
- AI runtime
- transfer / resolve

### 批次 4：任务与记忆

- async tasks
- memory

### 批次 5：后台与前端

- admin case APIs
- case 查询页
- agent workspace case UI

## 8. 边界提醒

阶段 A 只做：

- `thread -> current case -> segment` 主模型落地

不要在本阶段顺手做：

- 多 case 并发
- case 自动分类
- case 合并拆分
- case 工作流引擎
- case 技能市场

这些都属于阶段 B/C 之后的事情。
