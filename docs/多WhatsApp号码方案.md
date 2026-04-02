可以支持，而且结合你现在的调度中心/路由中心看，**这件事应该分成两层来设计**：

1. **先支持“一个租户多个 WhatsApp 号码实例”**
2. **再决定调度中心是否需要“按号码实例做分流”**

当前代码说明：  
**消息链路本身其实已经天然接近支持多号码**，真正卡住你的，是渠道配置模型和后台管理模型，不是消息队列或 worker。

---

**先说结论**
我建议的具体方案是：

1. `channel_configs` 改成支持同租户多条 `whatsapp`
2. 每个 WhatsApp 号码都是一个独立渠道实例
3. 入站仍按 `phoneNumberId -> channel_config -> tenant/channelId`
4. 出站仍按 `conversation.channel_id -> channel_config`
5. 调度中心第一阶段继续按 `channelType=whatsapp` 工作，不会坏
6. 第二阶段再补“按具体号码/channelId 做调度规则”

这是最稳、最小破坏、又能继续扩展的方案。

---

# 一、现状梳理

## 1. 当前为什么只能一个号码
根因不是 Meta，而是你自己的单例模型：

### 数据库层
[20260404_037_tenant_channel_catalog.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/migrations/20260404_037_tenant_channel_catalog.ts)

这里有唯一索引：
- `uq_channel_configs_tenant_type`
- `(tenant_id, channel_type)`

这意味着：
- 一个租户只能有一条 `whatsapp`

### 服务层
[tenant-channel-config.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/tenant-channel-config.service.ts)

`ensureTenantChannelConfigs()` 现在按：
- `Map<channelType, row>`

去重后只保留一条。

### 后台接口层
[channel-admin.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/channel-admin.routes.ts)

这里很多接口默认认为：
- `tenant + whatsapp = 1条`

例如：
- `GET /api/admin/channel-configs/whatsapp/setup`
没有 `configId`

### 前端层
当前前端是“固定 3 张渠道卡片”：
- `web`
- `whatsapp`
- `webhook`

不是“渠道实例列表”。

---

## 2. 消息层实际上已经接近支持多号码
这一点很关键。

### 入站
[channel.gateway.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/channel.gateway.ts)

WhatsApp webhook 是按：
- `phone_number_id`

去查：
- [channel.repository.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/channel.repository.ts)
- `findActiveWhatsAppChannelByPhoneNumberId(phoneNumberId)`

这意味着只要有多条 `whatsapp` 配置，每条各自有不同 `phoneNumberId`，**入站天然能区分不同号码实例**。

### 出站
[outbound.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/outbound.worker.ts)

出站是按：
- `conversation.channel_id`

反查渠道配置，再发送。

这意味着只要不同号码实例有不同 `channel_id`，**出站也天然能走对号码**。

结论：
- **消息收发层没有本质障碍**
- 真正要改的是：渠道配置、租户后台、部分调度上下文

---

# 二、结合调度中心后的判断

## 1. 当前调度中心按什么分流
当前调度、路由、技能匹配主要看：

- `channelType`
- `channelId`
- `operatingMode`
- `skillGroup`
- `routing rules`

关键位置：
- [routing-context.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-context.service.ts)
- [routing-engine/types.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/types.ts)
- [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)

当前 `RoutingContext` 已经有：
- `channelType`
- `channelId`

所以从调度引擎输入看，**系统内部已经保留了号码实例维度**，只是现在业务规则大多数只用 `channelType`，还没真正用 `channelId` 做规则。

---

## 2. 这意味着什么
意味着你可以分两步做：

### 第一步
先支持多号码实例，但调度仍按：
- `whatsapp`

统一处理

这样：
- 不影响现有 routing rules
- 不影响 skill groups
- 不影响 human/AI dispatch

### 第二步
如果你后面想实现：
- 销售号 -> 销售技能组
- 售后号 -> 售后技能组
- VIP号 -> 专属队列

再把调度规则扩展到：
- `channelId`

即可。

这比一步到位大改路由规则安全得多。

---

# 三、建议的多 WhatsApp 号码设计

## 设计原则
**一个号码 = 一个独立 WhatsApp 渠道实例**

也就是：
- 一条 `channel_configs`
- 一个 `channel_id`
- 一个 `phoneNumberId`
- 一个绑定状态

而不是：
- 一个 `whatsapp` 配置里塞 `numbers[]`

原因：
1. 入站识别天然按实例匹配
2. 出站天然按实例发送
3. 停用/启用更清晰
4. 后续统计、权限、调度、审计都能精确到号码

---

# 四、具体改动方案

## A. 数据库改动

### 1. 删除单例约束
删除：
- `(tenant_id, channel_type)` 唯一索引

也就是删掉：
- `uq_channel_configs_tenant_type`

### 2. 保留/新增的约束
保留：
- `channel_id` 全局唯一

保留或新增：
- WhatsApp `phoneNumberId` 唯一
- 建议唯一索引：
  - `regexp_replace(encrypted_config::jsonb ->> 'phoneNumberId', '[^0-9]', '', 'g')`
  - `WHERE channel_type='whatsapp'`

目的：
- 一个 Meta 号码不能被两个租户或两个实例重复绑定

### 3. 默认数据策略调整
`web`、`webhook` 继续默认单例自动补齐  
`whatsapp` 改成：
- 默认只创建 1 条“主 WhatsApp 实例”
- 但不限制后续新增更多实例

---

## B. 服务层改动

### 当前问题
[tenant-channel-config.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/channel/tenant-channel-config.service.ts)

现在 `ensureTenantChannelConfigs()` 把同类型只留一条。

### 需要改成
把渠道类型拆成两类：

1. **单例渠道**
- `web`
- `webhook`

2. **多实例渠道**
- `whatsapp`

实现方式：
- `ensureTenantBaseChannelConfigs()` 只保证 `web` 和 `webhook`
- `whatsapp` 改成普通列表读取，不做按类型去重

### 序列化输出
当前 `GET /api/admin/channel-configs` 需要变成返回：
- `web` 1条
- `webhook` 1条
- `whatsapp` N条

前端按 `channel_type` 分组展示。

---

## C. 后端接口改动

### 1. 新增 WhatsApp 实例
新增接口：
- `POST /api/admin/channel-configs/whatsapp`

作用：
- 为当前租户创建一条新的 WhatsApp 渠道实例
- 初始配置：
  - `onboardingStatus = "unbound"`
  - `is_active = false`
  - 自动生成 `channel_id`

建议字段：
- `label?`
- `usageScene?`
- `isPrimary?`

### 2. setup 改为实例级
当前：
- `GET /api/admin/channel-configs/whatsapp/setup`

应改成：
- `GET /api/admin/channel-configs/:configId/whatsapp/setup`

因为以后不止一条。

### 3. 绑定完成接口继续保留
保留：
- `POST /api/admin/channel-configs/:configId/whatsapp/embedded-signup/complete`

它本来就是实例级的，这个是对的。

### 4. 停用而非删除
继续保留：
- `PATCH isActive=false`
- 不允许物理删除

这和你之前的约束一致。

---

## D. 前端界面改动

### 当前问题
前端是固定三张卡片，不适合多号码。

### 改成
`Channels` 页面要变成：

#### `web`
- 单卡

#### `webhook`
- 单卡

#### `whatsapp`
- 卡片组 / 列表
- 可展示多个实例

每个实例显示：
- `label`
- `displayPhoneNumber`
- `phoneNumberId`
- `wabaId`
- `isActive`
- `bound/unbound`

操作：
- `新增 WhatsApp 号码`
- `绑定`
- `重新绑定`
- `停用`
- `修改标签`

---

# 五、与调度中心的具体联动方案

## 第一阶段：不改调度规则语义
保持当前 routing engine 逻辑：
- 仍按 `channelType=whatsapp`

这样：
- 原有 `channel_filters`
- 原有技能组
- 原有队列分配
- 原有 AI/Human handoff

都不用动。

### 原因
当前 routing context 已经有：
- `channelId`
- `channelType`

但规则里主要使用的是 `channelType`

所以多号码上线后：
- 所有 WhatsApp 号码仍走同一套 WhatsApp 路由策略
- 系统稳定性最高

---

## 第二阶段：支持按号码路由
如果你要让不同号码走不同客服团队，再补这层：

### 1. RoutingContext 增强
在 [routing-engine/types.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/types.ts) 中正式把 `channelId` 作为可筛选规则字段使用

其实它已经在 context 里了，只是没完整下沉到规则判断。

### 2. Routing rules 支持条件
新增 rule condition：
- `channelId`
- 或更业务化一点：
  - `channelCode`
  - `channelLabel`
  - `channelTags`

### 3. Skill group / module 可支持号码过滤
如果你希望更强控制，可以在 `skill_groups.channel_filters` 之外新增：
- `channel_id_filters`

但这属于第二阶段，不是第一阶段必做。

---

# 六、推荐的数据结构补充

建议在 WhatsApp `encrypted_config` 里新增这些字段：

- `label`
  - 例：`Sales WA`
- `usageScene`
  - 例：`sales | support | vip`
- `isPrimary`
- `onboardingStatus`
- `phoneNumberId`
- `wabaId`
- `displayPhoneNumber`
- `businessAccountName`
- `connectedAt`

这样后台和调度中心以后都能用。

---

# 七、改动优先级建议

## Phase 1：先支持多号码实例
1. ✅ 改 migration，去掉单例约束（`20260428_097_multi_whatsapp_channel.ts`，同时将 phone 唯一约束改为仅约束 active 行）
2. ✅ 改 `tenant-channel-config.service.ts`（`ensureTenantChannelConfigs` 只管 web/webhook；新增 `createWhatsAppChannelConfig()`；`TenantChannelConfigView` 增加 label/usage_scene/is_primary/onboarding_status）
3. ✅ 改 `channel-admin.routes.ts`（新增 `POST /whatsapp`、`GET /:configId/whatsapp/setup`、`POST /:configId/whatsapp/unbind`；`DELETE` 允许删除 unbound 实例）
4. ✅ 改前端（`types.ts`、`api.ts`、`useChannelsData.ts`、`ChannelGrid.tsx`、`ChannelDetail.tsx`、`ChannelsTab.tsx`）
5. 待验证：确认入站/出站正常（gateway + outbound worker 无需改动，天然支持）

## Phase 2：调度中心按号码分流
1. routing rules 支持 `channelId`
2. skill groups 支持号码过滤
3. 后台路由规则 UI 增加号码筛选

---

# 八、风险点

## 1. 不要把多个号码塞进一条配置
否则会破坏：
- 入站匹配
- 出站定位
- 审计
- 启停

## 2. 不要一步改动调度规则
先让多号码实例跑通，再做号码级分流  
否则范围会扩大到：
- routing rule evaluator
- admin routing UI
- skill group filters
- dispatch analytics

## 3. 要保住 `phoneNumberId` 唯一
否则两个实例绑定同一个号码会把消息打乱。

---

# 九、最终建议方案

**推荐落地方案：**

1. `web`、`webhook` 保持单例
2. `whatsapp` 改成多实例
3. 每个号码独立一条 `channel_configs`
4. 第一阶段调度中心继续按 `channelType=whatsapp`
5. 第二阶段再支持 `channelId` 路由

这是结合你现有代码后，最稳、代价最低、且后续扩展最干净的方案。

如果你确认，我下一步可以直接开始实现 **Phase 1**：
1. 改数据库约束
2. 改后端 WhatsApp 多实例接口
3. 改租户后台多号码列表 UI