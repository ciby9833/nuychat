# 座席 Presence Engine 设计说明

## 1. 背景

旧实现把座席是否在线分散在多个地方判断：

- 工作台只要登录并持续发 `/api/agent/heartbeat`，就会被视为在线
- 调度模块直接用 `agent_profiles.status + last_seen_at` 选人
- 管理台又会自己按 `last_seen_at` 推导一次 `away/offline`
- 成员/座席列表也会重复做一套“有效状态”计算

这会导致三个典型问题：

1. 页面还开着，但人已经离岗，系统仍然继续派单
2. 管理台显示在线，但调度不选；或者调度还能选，但管理台已经显示离开
3. 座席状态在多个模块各算一套，后续越改越乱

本次重构的目标是：

- 连接存活、人工在岗、调度可分配 三层彻底拆开
- 后端统一产出单一真相 `presence_state`
- 调度、工作台、管理台全部只认这一个状态

## 2. 新模型

### 2.1 概念分层

- `heartbeat`
  只表示工作台连接还活着
- `activity`
  表示最近有人在真实工作
- `presence_state`
  后端统一计算出的当前在岗状态

### 2.2 字段定义

本次在 `agent_profiles` 上新增：

- `last_heartbeat_at`
- `last_activity_at`
- `presence_state`
- `presence_state_changed_at`
- `presence_recovery_due_at`

迁移文件：

- [20260417_055_presence_engine.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260417_055_presence_engine.ts)

### 2.3 状态含义

- `offline`
  工作台连接断开，或者人工显式离线
- `away`
  连接仍在，但人不在岗，或者在休息中
- `online`
  人在岗，可接单
- `busy`
  人在岗，且当前已有进行中的人工会话

注意：

- `status` 仍然保留，但它现在只是“人工意图状态”
- 真正的在线状态只看 `presence_state`

## 3. 统一状态引擎

核心实现：

- [presence.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/agent/presence.service.ts)

### 3.1 统一阈值

- heartbeat 超时：`90s`
- idle 转 away：`5min`
- away/offline 恢复冷却：`10s`

### 3.2 状态计算规则

后端统一按以下顺序计算：

1. 如果人工手动状态是 `offline`，直接为 `offline`
2. 如果 `last_heartbeat_at` 超过 90 秒未更新，直接为 `offline`
3. 如果存在 active break，或者人工手动状态是 `away`，为 `away`
4. 如果 `last_activity_at` 超过 5 分钟未更新，为 `away`
5. 如果刚从 `away/offline` 恢复，且 `presence_recovery_due_at` 还没到，继续保持 `away`
6. 如果当前有已分配人工会话，或者人工手动状态是 `busy`，为 `busy`
7. 否则为 `online`

## 4. 信号来源

### 4.1 heartbeat

工作台每 30 秒发一次：

- `POST /api/agent/heartbeat`

用途：

- 只用于连接存活判断

接入文件：

- [agent.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/agent/agent.routes.ts)
- [useWorkspaceDashboard.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/agent-workspace/src/workspace/hooks/useWorkspaceDashboard.ts)

### 4.2 activity

activity 分两类。

#### UI 活跃信号

工作台低频上报：

- `mousemove`
- `keydown`
- `click`
- `focus`
- `visibilitychange`

说明：

- 节流为 15 秒，避免刷接口
- 只作为弱信号

#### 业务行为信号

这是高优先级 activity，必须计入：

- 打开会话详情
- 发送回复
- 接管会话
- 请求转人工
- 转移会话
- 解决会话

说明：

- 业务行为优先级高于纯前端事件
- 即使 UI 事件很少，只要人工在处理会话，也不会被误判离岗

接入文件：

- [useWorkspaceDashboard.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/agent-workspace/src/workspace/hooks/useWorkspaceDashboard.ts)
- [conversation.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/conversation/conversation.routes.ts)
- [outbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/outbound.worker.ts)

## 5. 统一使用原则

### 5.1 调度

调度前会先刷新租户所有座席的 `presence_state`，然后只从以下状态选人：

- `online`
- `busy`

调度不再自行判断：

- `last_seen_at`
- `status === online`
- `90 秒内心跳`

调度接入文件：

- [human-dispatch.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/human-dispatch.service.ts)

### 5.2 管理台

管理台在线看板、主管视图、座席列表，全部统一读取 `presence_state`。

管理台不再自己推导：

- stale online -> away
- 5 分钟 / 30 分钟超时逻辑

相关文件：

- [tenant-admin.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-admin.routes.ts)
- [tenant-org-member.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-org-member.routes.ts)

### 5.3 工作台

工作台现在负责两件事：

1. 发送 heartbeat
2. 上报 activity

工作台不再负责计算 online / away / offline。

相关文件：

- [useWorkspaceDashboard.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/agent-workspace/src/workspace/hooks/useWorkspaceDashboard.ts)

## 6. break 与 logout 规则

### 6.1 break

`agent_breaks` 仍然保留为业务表。

但 break 不再直接把 `agent_profiles.status` 当成最终在线状态来源。

当前规则：

- 有 active break -> `presence_state = away`
- 结束 break 后，由 presence engine 重新计算是否恢复为 `online/busy`

相关文件：

- [tenant-admin.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-admin.routes.ts)

### 6.2 logout

登出时会立即写回：

- `status = offline`
- `presence_state = offline`
- 清空 `last_heartbeat_at`
- 清空 `last_activity_at`

这样不会出现旧 session 残留在线态。

相关文件：

- [auth.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/auth/auth.routes.ts)

## 7. 兼容与历史说明

### 7.1 为什么 `status` 还保留

因为它仍然有业务意义：

- 人工手动设置 `away`
- 人工手动设置 `busy`
- 管理台代设置离线

但是：

- `status` 不再等于最终在线态
- 最终在线态一定看 `presence_state`

### 7.2 为什么 `last_seen_at` 还保留

`last_seen_at` 目前只作为兼容镜像保留。

它不再用于：

- 调度筛选
- 管理台状态推导
- 座席列表状态推导

后续如果没有别的历史依赖，可以继续清理。

## 8. 给后续开发人员的约束

后续新增功能时，必须遵守下面几条：

1. 不要再在任何页面或服务里自己推导 online/away/offline
2. 只使用 `presence_state` 作为最终状态
3. 新的人工业务动作，如果代表“座席正在工作”，必须补 `recordActivity`
4. 不要再让调度直接读 `last_seen_at`
5. break、排班、人工手动状态，只能作为 presence engine 的输入，不能各自输出最终在线状态

## 9. 推荐阅读顺序

新同学接手时，建议按这个顺序看：

1. [20260417_055_presence_engine.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260417_055_presence_engine.ts)
2. [presence.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/agent/presence.service.ts)
3. [agent.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/agent/agent.routes.ts)
4. [human-dispatch.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/human-dispatch.service.ts)
5. [useWorkspaceDashboard.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/agent-workspace/src/workspace/hooks/useWorkspaceDashboard.ts)
6. [tenant-admin.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-admin.routes.ts)

看完这 6 个点，基本就能理解这套 Presence Engine 的全链路。
