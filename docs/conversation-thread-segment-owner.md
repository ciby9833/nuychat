# 会话 Thread / Segment / Owner 重构说明

## 1. 为什么要重构

旧模型的问题是：

- `conversation` 同时承担“客户长期线程”“当前负责人”“一次接待过程”三种职责
- `queue_assignments` 只是当前派单快照，无法完整表达 AI -> 人工 -> 人工转移 -> 再回 AI 的完整责任链
- 同一个客户同一天联系多个座席时，无法稳定评估：
  - 谁接待过
  - 每段接待持续多久
  - 哪段是 AI，哪段是人工
  - 转接前后 SLA、质检、满意度该归谁

本次重构的目标是把三个层次拆开：

1. `thread`
   客户长期会话线程
2. `owner`
   当前由谁负责
3. `segment`
   每一次具体接待段

## 2. 新模型

### 2.1 thread

当前项目中仍然使用 `conversations` 作为 thread 主表。

它的职责是：

- 代表客户在某渠道上的长期对话线程
- 承载客户级上下文
- 承载当前负责人
- 挂接当前活跃 segment

关键字段：

- `conversation_id`
- `customer_id`
- `channel_id`
- `channel_type`
- `status`
- `assigned_agent_id`
- `current_handler_type`
- `current_handler_id`
- `current_segment_id`

### 2.2 owner

owner 是 thread 当前的负责对象。

当前支持三类：

- `system`
- `human`
- `ai`

对应字段：

- `current_handler_type`
- `current_handler_id`

补充说明：

- 人工 owner 时，`assigned_agent_id` 必须同步指向当前人工
- AI owner 时，thread 当前负责方在 `current_handler_type/current_handler_id`
- system owner 表示当前处于待分配/待转接状态

### 2.3 segment

每一次具体接待过程是一个独立 `segment`。

表：

- `conversation_segments`

它解决的是：

- 哪一段是 AI 处理
- 哪一段是人工 A 处理
- 什么时候转交给人工 B
- 什么时候关闭或解决

核心字段：

- `segment_id`
- `conversation_id`
- `customer_id`
- `owner_type`
- `owner_agent_id`
- `owner_ai_agent_id`
- `status`
- `opened_reason`
- `closed_reason`
- `transferred_from_segment_id`
- `started_at`
- `ended_at`

迁移文件：

- [20260417_054_conversation_segments.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260417_054_conversation_segments.ts)

## 3. 当前链路怎么工作

核心服务：

- [conversation-segment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)

### 3.1 inbound 进入

入口：

- [inbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)

流程：

1. 先找到或创建 customer
2. 再找到或创建 thread（`conversations`）
3. 如果当前 thread 没有 `current_segment_id`
   - `human_active` 且有人工 owner -> 补 human segment
   - 当前 handler 是 AI -> 补 AI segment
   - 否则 -> 建 system segment
4. inbound message 写入 `messages.segment_id`
5. 再进入 dispatch 决策

### 3.2 AI 接手

入口：

- [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)

如果 AI 产出回复：

1. `switchToAISegment`
2. `queue_assignments.assigned_ai_agent_id = 当前 AI`
3. thread 更新：
   - `status = bot_active`
   - `current_handler_type = ai`
   - `current_handler_id = ai_agent_id`

### 3.3 AI 请求转人工

如果 AI 判断需要 handoff：

1. `switchToSystemSegment`
2. thread 更新：
   - `status = queued`
   - `current_handler_type = system`
   - `current_handler_id = null`
3. queue assignment 标记：
   - `handoff_required = true`
   - `handoff_reason = xxx`

### 3.4 人工接管

入口：

- [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
  `POST /api/conversations/:conversationId/assign`

流程：

1. `switchToHumanSegment`
2. thread 更新：
   - `status = human_active`
   - `assigned_agent_id = 当前人工`
   - `current_handler_type = human`
   - `current_handler_id = agent_id`
3. queue assignment 更新为人工已接单

### 3.5 人工转移

入口：

- [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
  `POST /api/conversations/:conversationId/transfer`

流程：

1. 当前人工 segment 结束
2. 新建目标人工 segment
3. thread owner 切到新人工
4. queue assignment 改到新人工

### 3.6 解决

入口：

- [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
  `POST /api/conversations/:conversationId/resolve`

流程：

1. 关闭当前 segment
2. thread 设为 `resolved`
3. 清空 `current_handler_type/current_handler_id/current_segment_id`

## 4. 消息如何挂到 segment

当前消息已经跟 segment 关联：

- inbound message
- outbound human message
- outbound AI message

都通过 `segment_id` 归属到当前 segment。

实现文件：

- [message.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

这意味着后续可以按 segment 看：

- 本段开始到结束的完整消息
- 本段到底是谁处理
- 本段是 AI 还是人工

## 5. 为什么这套模型更适合后续运营

### 5.1 AI 记忆

AI 的长期理解应建立在：

- thread 历史
- customer 长期记忆
- 最近若干 segment 摘要

而不是只看“当前是否 assigned 给某人”。

### 5.2 质检

质检不能按整个 thread 粗暴评估。

应该能区分：

- AI 段表现如何
- 人工 A 段表现如何
- 人工 B 段表现如何

segment 正是这个最小责任单位。

### 5.3 SLA

SLA 以后也应至少分两层：

- thread 级
  客户整体等待时间、整体解决时长
- segment 级
  当前接待人/当前接待段的响应与处理时长

### 5.4 满意度

客户同一条长期 thread 里可能经历：

- AI 先聊
- 人工 A 接手
- 人工 B 转移跟进

如果没有 segment，就无法判断满意度应该反馈给哪一段。

## 6. 当前已完成的代码接入

### 6.1 服务

- [conversation-segment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)

### 6.2 入口

- [inbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
- [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
- [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
- [message.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

### 6.3 历史回填

已经补了历史 segment 回填脚本：

- [backfill-conversation-segments.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/scripts/backfill-conversation-segments.ts)

命令：

- `npm run db:backfill:conversation-segments`

## 7. 给后续开发人员的约束

后续新增会话能力时，必须遵守：

1. 不要再把一次接待过程直接写死在 `conversations` 上
2. 任何 owner 变化，都要同步切 segment
3. 消息如果代表当前接待过程，必须写入对应 `segment_id`
4. 不要再把 `queue_assignments` 当成完整历史，它只是当前快照
5. 质检、SLA、满意度、AI 评估，后续应优先围绕 segment 做

## 8. 当前模型仍然没做完的地方

这次重构解决了 thread/owner/segment 的基础分层，但还没把“调度决策审计”独立出来。

目前仍然缺：

- 一次 dispatch run 的完整输入快照
- 为什么命中了某条 routing rule
- 为什么选了某个部门/团队/人工/AI
- 每个候选人为什么被淘汰
- 后续人工转移/AI 转人工/人工转 AI 的统一审计模型

这部分建议作为下一个独立域来设计，不要继续塞进 `conversation_events` 的自由 JSON 里。

## 9. 推荐阅读顺序

1. [20260417_054_conversation_segments.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260417_054_conversation_segments.ts)
2. [conversation-segment.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation-segment.service.ts)
3. [inbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/inbound.worker.ts)
4. [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)
5. [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
6. [message.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/message/message.service.ts)

看完这 6 个点，就能理解当前 thread / owner / segment 的完整主线。
