# AI 能力重构方案（Skill Package + Script Runtime）

## 1. 目标

把旧的 `capability + connector + executor` 混合模型，收敛成单一的 **Skill Package**：

- `Metadata`
- `SKILL.md`
- `FORMS.md`
- `REFERENCE.md`
- `Scripts`
- `Skill Env`

系统只让租户维护一个完整能力包。  
模型负责选择和补参，脚本负责真实执行。

## 2. 最终结构

每个能力在数据库里等价于下面这组内容：

```text
AI 能力
  ├── Metadata
  ├── SKILL.md
  ├── FORMS.md
  ├── REFERENCE.md
  └── scripts
```

其中：

- `Metadata`
  - 轻量描述，供 Agent 启动时加载
- `SKILL.md`
  - 主指令，告诉模型什么时候用、怎么用、怎么解释结果
- `FORMS.md`
  - 表单、参数填写说明
- `REFERENCE.md`
  - 详细接口说明、错误码说明、字段定义
- `scripts`
  - 真正执行动作的脚本
- `Skill Env`
  - 该技能自己维护的环境变量键值，用于给脚本注入密钥、账号、URL 等安全信息

## 3. 主执行链

```text
用户消息
  -> planner 选择 capability
  -> capability state 判断是否缺参
  -> script runtime 执行 scripts/*
  -> 返回结构化结果
  -> 生成 AI 回复
```

注意：

- 不再有租户可见的 connector 配置模型
- 不再有租户可见的 executor 目录模型
- HTTP、签名、脚本解释器都只是内部执行实现

## 4. 数据表

当前有效表：

- `capabilities`
- `capability_versions`
- `capability_resources`
- `capability_scripts`
- `capability_availability`
- `conversation_capability_states`
- `skill_runs`
- `skill_tasks`

说明：

- `capability_versions`
  - 保存 `metadata_yaml / skill_md / forms_md / reference_md`
- `capability_resources`
  - 保存资源内容
- `capability_scripts`
  - 保存脚本、语言、入口文件名、环境变量键名
- `capability_script_env_bindings`
  - 保存每个脚本自己的环境变量键值
- `conversation_capability_states`
  - 保存澄清与补参状态

## 5. 已删除

- `connectors`
- `connector_versions`
- `capability_connector_bindings`
- `connector_secret_bindings`
- 旧 connector 管理菜单
- 旧 connector admin 路由

## 6. 前端维护方式

能力新增/编辑页只维护这几块：

### 6.1 Metadata

- 能力名称
- 编码
- 分类
- 状态
- 说明

### 6.2 SKILL.md

主能力说明，建议至少包含：

- 这个能力做什么
- 什么时候使用
- 什么时候不要使用
- 需要什么输入
- 返回什么结果
- 异常如何处理

### 6.3 FORMS.md

补参数和表单说明，例如：

- 运单号字段叫 `billCodes`
- 多个单号用英文逗号分隔

### 6.4 REFERENCE.md

详细接口或规则说明，例如：

- J&T `scanType` 编码说明
- 错误码解释
- 请求示例

### 6.5 Scripts

脚本列表，维护：

- `scriptKey`
- `name`
- `language`
- `fileName`
- `envBindings`
- `sourceCode`

## 7. Script Runtime 约束

当前脚本运行规则：

- 支持 `python / javascript / bash`
- 脚本通过 `stdin` 收 JSON 输入
- 脚本通过 `stdout` 回 JSON 结果
- 环境变量通过技能自身维护的 `envBindings` 注入
- 密钥不写在脚本源码里，也不再依赖系统全局 `.env`

输入示例：

```json
{
  "tenantId": "...",
  "conversationId": "...",
  "capability": {
    "capabilityId": "...",
    "slug": "jt_cargo_trace",
    "name": "物流轨迹查询"
  },
  "script": {
    "scriptKey": "cargo_trace",
    "name": "JT Cargo 物流轨迹脚本",
    "fileName": "cargo_trace.py",
    "language": "python"
  },
  "args": {
    "billCodes": "570274982172"
  }
}
```

输出示例：

```json
{
  "status": "ok",
  "customerReply": "单号 570274982172 的最新轨迹：...",
  "response": {}
}
```

## 8. 验证结果

已完成一次真实能力验证：

- capability：`jt_cargo_trace`
- script：`cargo_trace.py`
- 外部接口：J&T 物流轨迹查询

验证通过链路：

- [x] `skill_runs` 成功生成
- [x] `skill_tasks` 成功生成
- [x] `capability_script_execution` 成功执行
- [x] 成功计算 `digest`
- [x] 成功发出 J&T HTTP 请求
- [x] J&T 返回 `200 + success`
- [x] 结果回成客户可见 AI 回复

## 9. 注意事项

1. 不要再新增 connector 概念
2. 不要把签名逻辑暴露成租户侧单独配置页
3. 新能力优先用脚本表达真实执行逻辑
4. `SKILL.md` 负责教模型什么时候用
5. script runtime 负责真正执行
6. `AI 运行策略` 只保留系统级边界，不再做技能触发器
7. 脚本所需账号、密钥、URL 由技能内维护，不写入系统级环境变量

## 10. 完成检查

- [x] 租户侧只维护 Skill Package
- [x] script runtime 已打通
- [x] J&T 样例已真实跑通
- [x] 旧 connector 表已进入删除迁移
- [x] 文档已切到新方案
