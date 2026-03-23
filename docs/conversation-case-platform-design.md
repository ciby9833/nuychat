# 会话 / 事项 / 记忆 平台化设计稿

## 1. 目的

这份文档解决两个问题：

1. 梳理当前项目里“会话线程 / 处理段 / 消息 / 记忆 / 任务”的真实实现
2. 设计下一阶段的 `case/task` 平台能力，让租户能通过技能和扩展逻辑实现自己的业务闭环，而不是把业务规则写死在核心客服链路里

本文不直接引入代码变更，只给出平台级方案和迁移方向。

## 2. 当前真实模型

### 2.1 Thread：客户长期线程

当前项目的主线程是 [`conversations`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.service.ts)。

现状：

- 一个客户在一个渠道下，优先复用同一条活跃会话
- 如果没有活跃会话，会重开最近一条 `resolved/closed`
- 所以当前系统本质上是：
  `customer + channel -> persistent thread`

这个模型适合：

- 连续聊天体验
- AI 连续上下文
- 客服查看同一客户历史沟通

这个模型不适合单独承担：

- 当前待解决事项归属
- 多次转接的责任边界
- SLA / 质检 / 满意度的精确归因

### 2.2 Segment：一次处理段

当前项目已经有 [`conversation_segments`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)。

现状：

- `system` 段：待分配或系统处理中
- `human` 段：某个人工座席处理
- `ai` 段：某个 AI 座席处理
- 转人工 / 转 AI / 转系统时会关闭当前段并开启新段

这个模型已经能解决：

- 谁在这一段负责
- AI -> 人工、人工 -> 人工 的切换链路
- 一条线程里多次切换处理人的历史

但它仍然不是“事项”：

- 一个 segment 仍然可能覆盖多个问题
- 一个客户同一线程里可能已经换题，但还留在同一个 segment 里

### 2.3 Message：消息记录

消息由 [`message.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts) 写入。

现状：

- 所有消息挂在 `conversation_id`
- 同时挂 `segment_id`
- inbound 由客户写入
- outbound 可由人工或 AI 写入

这意味着当前已经具备两层视角：

- 线程视角：一整条历史对话
- 段落视角：某次 AI/人工处理期间的消息

### 2.4 Memory：记忆能力

当前项目里已经有三层不同粒度的记忆：

1. Working Memory
   文件：[`customer-intelligence.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)
   特点：
   - Redis 短期上下文
   - 按 `conversationId` 存储
   - 适合当前会话即时推理

2. Conversation Intelligence
   文件：[`customer-intelligence.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)
   特点：
   - 按 `conversation_id` 记录摘要、意图、情绪、关键实体
   - 是“线程级摘要”

3. Customer Profile / Memory Items / State Snapshots
   文件：[`customer-intelligence.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)
   特点：
   - 按 `customer_id` 聚合长期事实、历史摘要、状态、外部任务结果
   - 是“客户长期记忆”

当前缺口：

- 还没有“事项级记忆”
- 也就是：某次退款、某次投诉、某次订单核查，这些业务单元没有独立记忆容器

### 2.5 Task：异步任务

当前已有 [`async_tasks`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts)。

现状：

- 任务可挂 `conversation_id`
- 结果会写 `result_summary`
- 部分任务结果还会回流到 `customer_memory_items` 和 `customer_state_snapshots`

这说明系统已经有“事项雏形”，但仍是弱耦合：

- task 是执行单元
- 不是事项主实体
- 多个 task 之间也没有天然归属到“同一问题”

## 3. 当前服务边界

### 3.1 Intake / Conversation

入口主链路：

- [`inbound.worker.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
- [`conversation.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.service.ts)
- [`conversation-segment.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)
- [`message.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

职责：

- 渠道消息进入
- 识别 customer
- 找到或重开 thread
- 写消息
- 补齐当前 segment

### 3.2 Routing

当前统一调度核心：

- [`routing-context.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-context.service.ts)
- [`unified-routing-engine.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/unified-routing-engine.service.ts)
- [`routing-execution.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-execution.service.ts)

职责：

- 构建决策上下文
- 一次生成 `RoutingPlan`
- 执行 plan

当前状态：

- 已经具备 `thread + segment + summary` 级调度
- 还不是 `case` 级调度

### 3.3 AI Runtime

- [`routing.worker.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
- [`orchestrator.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts)

职责：

- AI 执行
- 返回 response / handoff

### 3.4 Audit

- [`dispatch-audit.service.ts`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/dispatch/dispatch-audit.service.ts)
- [`routing_plans`](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-plan.repository.ts)

职责：

- 记录一次调度为什么这么决策
- 记录候选淘汰原因
- 记录转移链路

## 4. 当前缺口

当前系统已经有：

- thread
- segment
- message
- memory
- task
- routing plan

但还没有一个真正的平台主实体回答：

`当前客户这次到底在处理什么问题？`

这会直接影响：

- 路由是否应该重新判断
- AI 应该继承哪些上下文
- 技能应该围绕哪个事项工作
- SLA / 质检 / 满意度应该挂在哪个业务单元上

## 5. 平台级新模型

建议引入两层新实体：

### 5.1 Conversation Case

`conversation_case` 是“一个待解决事项”。

建议定义：

- 一个 thread 下可以有多个 case
- 一个 case 可以跨多个 segment
- 一个 case 可以关联多个 task
- 一个 case 在任意时刻有一个当前 owner

建议字段：

- `case_id`
- `tenant_id`
- `conversation_id`
- `customer_id`
- `case_type`
  例如：`order_status / refund / complaint / vip_service / general_inquiry`
- `case_title`
- `case_summary`
- `status`
  `open / in_progress / waiting_customer / waiting_internal / resolved / closed`
- `priority`
- `source`
  `manual / ai_detected / skill_generated / workflow`
- `current_owner_type`
  `system / ai / agent / workflow`
- `current_owner_id`
- `opened_at`
- `resolved_at`
- `closed_at`

### 5.2 Conversation Case Task

`conversation_case_task` 是事项下的执行单元。

与当前 `async_tasks` 的关系建议是：

- `async_tasks` 保留为执行引擎表
- `conversation_case_tasks` 作为业务编排层
- 一个 case task 可触发一个或多个 async task

建议字段：

- `case_task_id`
- `case_id`
- `tenant_id`
- `task_type`
  例如：`lookup_order / verify_refund / collect_evidence / follow_up_customer`
- `status`
  `pending / running / waiting_input / completed / failed / cancelled`
- `assigned_to_type`
  `agent / ai / workflow / external`
- `assigned_to_id`
- `input_payload`
- `result_summary`
- `result_payload`
- `started_at`
- `completed_at`

## 6. 三层主视角

重构后要明确分成 3 层：

### 6.1 Thread

回答：

- 这是哪位客户在这个渠道下的长期沟通线程

用途：

- 长期聊天记录
- 长期 working memory
- 客户历史回看

### 6.2 Case

回答：

- 当前具体在解决什么问题
- 这个问题现在谁负责

用途：

- 调度
- SLA
- 质检
- 满意度归因
- AI / 技能围绕该事项工作

### 6.3 Segment

回答：

- 在这个事项的某段时间里，谁实际在处理

用途：

- 转接链路
- 座席工作量
- 人工 / AI 责任边界

## 7. 对记忆系统的改造建议

### 7.1 保留三层记忆，但重分职责

1. Thread Working Memory
   按 `conversation_id`
   用于当前连续对话窗口

2. Case Memory
   按 `case_id`
   用于当前事项上下文
   建议新增：
   - `case_summary`
   - `case_facts`
   - `case_decisions`
   - `case_open_questions`

3. Customer Long-Term Memory
   按 `customer_id`
   用于长期客户理解

### 7.2 记忆读取顺序

建议以后 AI / Skill 的标准读取顺序是：

1. `case memory`
2. 当前 `thread` 最近消息
3. `customer profile`
4. 相关 `task` 结果

而不是直接把整条 thread 全塞给模型。

## 8. 平台级能力抽象

这个设计要抽成平台能力，而不是租户特例。

建议把核心能力拆成：

### 8.1 Case Engine

职责：

- 创建 case
- 合并 / 拆分 case
- 切换 case owner
- 关闭 case
- 维护 case summary

### 8.2 Task Orchestrator

职责：

- case 下挂任务
- 决定任务由 AI / 人工 / 工作流 / 外部系统执行
- 管控任务状态机

### 8.3 Memory Engine

职责：

- 统一提供 thread / case / customer 三级上下文
- 统一沉淀任务结果、AI 摘要、人工备注

### 8.4 Routing Engine

职责：

- 决定本次消息该进入哪个 case
- 当前 case 该给谁处理
- 是否应该新建 case
- 是否应该把消息归并到已有 case

## 9. 给租户二次开发的扩展点

目标不是让租户改核心表，而是让租户通过“技能”扩展平台能力。

建议开放以下平台扩展点：

### 9.1 Case Classifier Skill

作用：

- 判断这条新消息属于哪个 `case_type`
- 决定归并到哪个已有 case，或新建 case

输入：

- 当前消息
- 最近 thread 摘要
- 已开放 case 列表
- 客户画像

输出：

- `caseType`
- `shouldCreateNewCase`
- `targetCaseId`
- `confidence`

### 9.2 Case Summary Skill

作用：

- 维护事项摘要
- 生成交接摘要

输出：

- 当前问题是什么
- 已确认事实
- 已完成动作
- 待完成动作
- 建议下一步

### 9.3 Task Planner Skill

作用：

- 为 case 生成任务清单

例如：

- 查询订单
- 校验退款凭证
- 请求人工审批
- 通知客户等待结果

### 9.4 Escalation Skill

作用：

- 判断是否需要从 AI 升级到人工
- 判断应升级给哪个团队 / 哪种角色

### 9.5 Tenant Business Skills

租户自己的业务技能只需要围绕：

- case 分类
- case 任务
- case 规则
- 外部系统接入

不需要直接改：

- thread
- message
- owner
- segment
- routing 内核

## 10. 推荐的最小实现顺序

### 阶段 A：不改线程模型，先补 case 外壳

先做：

- `conversation_cases`
- 一个 thread 默认只有一个 active case
- 新消息默认归到当前 active case

这样风险最低。

### 阶段 B：把任务从 conversation 挂到 case

扩展：

- `async_tasks` 增加 `case_id`
- 新任务优先挂 case
- 历史兼容保留 conversation_id

### 阶段 C：让 routing 先判断 case，再判断 owner

以后统一引擎变成：

1. 找 thread
2. 找/建 case
3. 生成 routing plan
4. 决定 owner

### 阶段 D：开放租户技能扩展

开放：

- case 分类 skill
- case summary skill
- task planner skill
- escalation skill

## 11. 结论

当前项目已经有足够好的基础：

- thread
- segment
- message
- memory
- task
- routing plan

真正缺的不是“再多一个调度规则”，而是：

`case 作为平台级事项主实体`

只有把 `case` 补出来，后面这些目标才能真正稳定成立：

- AI 与人工围绕同一事项协作
- 多次转接仍能保持业务上下文
- 质检 / SLA / 满意度按事项归因
- 租户通过 skill 做业务编排，而不是改核心客服底座
