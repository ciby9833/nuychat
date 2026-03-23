# Conversation Cases 阶段 A 最小实现设计稿

## 1. 目标

阶段 A 的目标不是一次做完整事项平台，而是先把 `case` 作为平台主实体落下来。

本阶段只解决 4 件事：

1. 定义 `conversation_cases` 主表
2. 明确它和 `conversations / conversation_segments / async_tasks / memory` 的关系
3. 确定最小迁移顺序
4. 定义最小接口边界

本阶段不做：

- 自动 case 分类
- 多 active case 并行
- 复杂 case 合并/拆分
- 完整租户技能扩展
- 前端完整 case 工作台

如果现有逻辑和新模型冲突，以新模型为准，不做兼容保留。

## 2. 设计原则

### 2.1 一个 thread 至少要有一个当前 case

当前项目已经以 `conversation` 作为长期线程。

阶段 A 不推翻这个模型，而是在其上增加：

- `conversation` = 长期线程
- `conversation_case` = 当前待解决事项

阶段 A 约束：

- 一个 thread 同时只允许一个 `active case`
- 新消息默认进入当前 active case
- 如果 thread 没有 active case，则自动新建一个

这能在最小改动下把事项层补出来。

### 2.2 case 是业务主实体，segment 是处理段

以后职责明确为：

- `conversation`
  长期聊天容器
- `conversation_case`
  当前业务问题
- `conversation_segment`
  某段时间里由谁实际处理

### 2.3 不做历史兼容字段保留策略

凡是“继续让旧逻辑主导”的地方，都不保留。

这意味着：

- 新链路里，owner、任务、摘要都优先挂 `case`
- `conversation` 只保留线程级属性
- `async_tasks` 不再把 `conversation_id` 视为主归属
- 记忆读取顺序以 `case` 为核心

## 3. 表结构设计

## 3.1 主表：`conversation_cases`

建议字段：

- `case_id`
  `uuid primary key`
- `tenant_id`
  `uuid not null`
- `conversation_id`
  `uuid not null`
- `customer_id`
  `uuid not null`
- `current_segment_id`
  `uuid null`
- `parent_case_id`
  `uuid null`
  用于后续拆分/升级链路
- `case_type`
  `varchar(80) not null`
  默认 `general_inquiry`
- `case_source`
  `varchar(40) not null`
  `system | manual | ai_detected | skill_generated | workflow`
- `title`
  `varchar(255) not null`
- `summary`
  `text null`
- `status`
  `varchar(40) not null`
  `open | in_progress | waiting_customer | waiting_internal | resolved | closed`
- `priority`
  `varchar(20) not null`
  `low | normal | high | urgent`
- `current_owner_type`
  `varchar(20) not null`
  `system | ai | agent | workflow`
- `current_owner_id`
  `uuid null`
- `opened_at`
  `timestamp not null`
- `resolved_at`
  `timestamp null`
- `closed_at`
  `timestamp null`
- `last_customer_message_at`
  `timestamp null`
- `last_agent_message_at`
  `timestamp null`
- `last_ai_message_at`
  `timestamp null`
- `last_activity_at`
  `timestamp not null`
- `metadata`
  `jsonb not null default '{}'`
- `created_at`
  `timestamp not null`
- `updated_at`
  `timestamp not null`

建议索引：

- `(tenant_id, conversation_id, status, last_activity_at desc)`
- `(tenant_id, customer_id, status, last_activity_at desc)`
- `(tenant_id, current_owner_type, current_owner_id, status)`
- `(tenant_id, case_type, status, last_activity_at desc)`

建议唯一约束：

- 阶段 A 直接限制一个 thread 只有一个 active case：
  可用部分唯一索引实现：
  `(tenant_id, conversation_id)` where `status in ('open','in_progress','waiting_customer','waiting_internal')`

## 3.2 关系表调整：`conversation_segments`

阶段 A 不新建 segment 关系表，直接给 `conversation_segments` 增加：

- `case_id uuid not null`

含义：

- 每个 segment 必须属于一个 case

约束：

- `conversation_segments.case_id -> conversation_cases.case_id`

解释：

- thread 下可以有多个 segment
- 这些 segment 在阶段 A 都归属于当前唯一 active case

## 3.3 关系表调整：`messages`

给 `messages` 增加：

- `case_id uuid not null`

含义：

- 每条消息不仅属于 thread，也必须属于 case

解释：

- 线程级检索仍用 `conversation_id`
- 事项级统计和记忆沉淀用 `case_id`

## 3.4 关系表调整：`async_tasks`

给 `async_tasks` 增加：

- `case_id uuid not null`

并改变语义：

- `conversation_id` 只作为辅助定位字段
- `case_id` 才是主归属

阶段 A 开始：

- 所有新任务必须带 `case_id`
- conversation 详情页的任务列表，本质上应先查当前 case，再查 case 下任务

## 3.5 记忆表调整

### `conversation_intelligence`

阶段 A 不删除，但降级为线程摘要表。

新增：

- `case_id uuid null`

语义调整：

- 后续新写入优先按 `case_id`
- 若是 thread 级摘要，也允许 `case_id = null`

### 建议新增：`case_intelligence`

如果要彻底切清，阶段 A 就应该直接新增，而不是继续混用 `conversation_intelligence`。

建议字段：

- `case_id`
- `tenant_id`
- `conversation_id`
- `customer_id`
- `summary`
- `last_intent`
- `last_sentiment`
- `message_count`
- `key_entities`
- `open_questions`
- `next_actions`
- `updated_at`

这样更干净。

### `customer_memory_items`

建议增加：

- `case_id uuid null`

语义：

- 长期记忆项可以追溯来源 case
- 但主归属仍是 customer

### `customer_state_snapshots`

建议增加：

- `case_id uuid null`

语义：

- 外部任务或事项处理中形成的状态快照，可以回到具体 case

## 4. 关系定义

## 4.1 `conversations` 和 `conversation_cases`

关系：

- 一个 `conversation` 有多个 `conversation_cases`
- 阶段 A 同时只有一个 active case

建议在 `conversations` 上增加：

- `current_case_id uuid null`

这和 `current_segment_id` 类似，是线程级当前指针。

以后：

- 找 thread 当前问题：看 `current_case_id`
- 找 thread 当前处理人：看 `current_segment_id` 和 case owner

## 4.2 `conversation_cases` 和 `conversation_segments`

关系：

- 一个 case 有多个 segments
- 一个 segment 只属于一个 case

这解决：

- A 接待一段
- AI 接待一段
- B 再接待一段

都归于同一个事项。

## 4.3 `conversation_cases` 和 `messages`

关系：

- 一个 case 有多条消息
- 一条消息只属于一个 case

## 4.4 `conversation_cases` 和 `async_tasks`

关系：

- 一个 case 有多个 tasks
- 一个 task 只属于一个 case

## 4.5 `conversation_cases` 和记忆

关系：

- 一个 case 有自己的摘要和结构化理解
- case 的沉淀可以反哺 customer memory
- customer memory 不是 case 的替代品

## 5. 状态机

## 5.1 Case 状态

建议状态：

- `open`
  刚建立，还未稳定进入处理
- `in_progress`
  AI / 人工 / workflow 正在处理
- `waiting_customer`
  等客户补充信息
- `waiting_internal`
  等内部任务或外部系统结果
- `resolved`
  问题已解决
- `closed`
  事项关闭，不再作为当前事项

阶段 A 最小闭环：

- 新建时默认 `open`
- 一旦有 owner 处理，转 `in_progress`
- 点解决时转 `resolved`
- thread reopen 时，不再直接 reopen 整个 conversation 语义，而是：
  新开一个 case，老 case 保持 `resolved/closed`

这点非常关键。

## 5.2 Owner 规则

case 上的 owner 才是业务主负责对象：

- `current_owner_type`
- `current_owner_id`

segment 上的 owner 是执行段负责对象。

阶段 A 约束：

- case owner 和当前 active segment owner 应保持一致
- 若没有 active segment，则 case owner 可为 `system`

## 6. 迁移顺序

按最小风险分 6 步。

### 步骤 1：建表与加列

新增：

- `conversation_cases`
- 可选：`case_intelligence`

新增列：

- `conversations.current_case_id`
- `conversation_segments.case_id`
- `messages.case_id`
- `async_tasks.case_id`
- `customer_memory_items.case_id`
- `customer_state_snapshots.case_id`
- `conversation_intelligence.case_id` 或直接改为后续废弃

### 步骤 2：历史回填

规则：

- 每个 `conversation` 创建一个默认历史 case
- 默认 `case_type = general_inquiry`
- `title = conversation.last_message_preview` 的裁剪版，若无则 `Historical case`
- 若 conversation 当前未结束，则该 case 为 active，并写回 `conversations.current_case_id`
- 若 conversation 已结束，则 case 状态映射为 `resolved`

同时：

- 把该 conversation 下所有 `segments/messages/tasks` 全部回填到这个 case

这是阶段 A 的最小历史迁移策略。

### 步骤 3：入站链路切换

改动：

- `inbound.worker`
  在拿到 thread 后，先 `getOrCreateActiveCase`
- 消息写入时必须带 `case_id`
- routing context 构建时必须带 `case`

### 步骤 4：segment 切换链路切换

改动：

- `ConversationSegmentService`
  所有新 segment 创建都必须带 `case_id`
- 转人工、转 AI、转系统时，先确认当前 case，再在这个 case 下切段

### 步骤 5：任务链路切换

改动：

- `scheduleLongTask`
- `task-engine`
- conversation task 接口

要求：

- 所有新任务必须带 `case_id`

### 步骤 6：记忆链路切换

改动：

- AI 摘要
- case 摘要
- customer memory 沉淀

读取顺序调整为：

1. case intelligence
2. thread 最近消息
3. customer profile
4. task results

## 7. 最小接口设计

阶段 A 只需要这些接口。

## 7.1 内部服务接口

### `ConversationCaseService`

建议新增：

- `getOrCreateActiveCase(...)`
- `createCase(...)`
- `resolveCase(...)`
- `closeCase(...)`
- `setCurrentOwner(...)`
- `attachSegment(...)`
- `attachMessage(...)`
- `attachTask(...)`

### `CaseIntelligenceService`

建议新增：

- `getCaseSummary(...)`
- `upsertCaseSummary(...)`
- `appendCaseFact(...)`
- `buildCaseContext(...)`

## 7.2 API 最小接口

### 座席侧

- `GET /api/conversations/:conversationId/cases`
  返回该 thread 下 case 列表
- `GET /api/conversations/:conversationId/cases/:caseId`
  返回 case 详情
- `POST /api/conversations/:conversationId/cases`
  手工新建 case
- `POST /api/conversations/:conversationId/cases/:caseId/resolve`
  解决 case
- `POST /api/conversations/:conversationId/cases/:caseId/reopen`
  reopen case

### 管理台

- `GET /api/admin/cases`
  用于质检、SLA、满意度、调度运营
- `GET /api/admin/cases/:caseId`
  case 详情页

阶段 A 不需要先做完整前端，只要接口边界先定。

## 8. 需要删除或调整的旧逻辑

## 8.1 必须删除

### `ConversationService.getOrCreateActiveConversation()`

当前存在这段旧逻辑：

- 没有活跃会话时，重开最近 `resolved/closed` conversation

阶段 A 之后，这个 reopen 语义不应该再承担“新问题开始”的职责。

新的原则应该是：

- thread 仍可复用
- 但新问题必须新开 `case`
- 不能再把“解决后的新问题”直接混回原问题语义里

也就是说：

- 可以保留 persistent thread
- 但必须删除“reopen 即复用原问题语义”的业务认知

### 需要改成：

- 若 thread 已存在但没有 active case：
  创建新 case
- 不再把 `conversation.status = open` 当成 reopen 问题本身

## 8.2 降级的旧字段

这些字段不再是业务主真相：

- `conversations.status`
  以后更偏 thread 展示状态
- `conversations.assigned_agent_id`
  以后只是线程当前负责人镜像
- `queue_assignments`
  以后只是当前执行快照

业务主真相应迁到：

- `conversation_cases.status`
- `conversation_cases.current_owner_*`

## 9. 对平台级二次开发的意义

阶段 A 做完后，平台就有了稳定扩展点：

- 租户 skill 可以判断是否新建 case
- 租户 skill 可以决定 case type
- 租户 skill 可以为 case 规划任务
- 租户 skill 可以为 case 生成摘要和建议动作

这样租户的业务差异就放在：

- `case_type`
- `case summary`
- `case tasks`
- `case escalation`

而不是侵入：

- thread
- message
- routing engine 内核

## 10. 最终建议

阶段 A 的最小正确做法是：

1. 先把 `conversation_cases` 立起来
2. 把 `segment / message / task / memory` 都挂到 `case`
3. 保留 thread，但把它降级为长期聊天容器
4. 后续所有路由、AI、人工协作，都围绕 `case` 展开

这一步做完，后面再做：

- 自动 case 分类
- 多 case 并行
- skill 驱动 case 编排

才会稳定。否则继续直接在 thread 上扩路由和 AI，只会越来越重。
