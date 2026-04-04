# QA方案

## 1. 目标与结论

本方案用于重构当前 QA（质检）能力，目标不是延续旧的“人工创建 QA 记录”模式，而是建设一套 **AI 驱动、按 case/segment 归因、自动分流、人工轻复核** 的 QA 系统。

核心结论：

- `case` 是 QA 的主评审对象，代表一次服务单元
- `segment` 是 QA 的责任归因对象，代表一次具体服务段
- 系统应在 `case` 结案后自动执行 QA，而不是等人工先建任务
- QA 结果应自动分流到：
  - 自动通过池
  - 风险池
  - 抽检池
- 人工不是主流程驱动者，而是风险与抽检 case 的复核者
- AI 质检必须使用租户自己的 AI 配置
- QA 准则由租户在前端以 Markdown 维护，供 AI 理解和执行

本次重构默认 **不保留旧 QA 逻辑**，旧表、旧接口、旧页面在新系统稳定后全部下线。

## 1.1 当前完成状态（本轮）

本轮已完成：

- ✅ 新增 QA v2 后端数据结构迁移设计：
  - `qa_guidelines`
  - `qa_review_tasks`
  - `qa_ai_reviews`
  - `qa_case_reviews`
  - `qa_segment_reviews`
- ✅ 已接通 `case` 结案后的自动入池触发：
  - 会话正常 `resolve`
  - 主管 `force-close`
- ✅ 已实现 QA v2 后端主查询入口：
  - `GET /api/admin/qa/dashboard`
  - `GET /api/admin/qa/guideline`
  - `PUT /api/admin/qa/guideline`
  - `GET /api/admin/qa/tasks`
  - `GET /api/admin/qa/cases/:caseId`
  - `POST /api/admin/qa/cases/:caseId/review`
- ✅ 已实现 AI QA 后台执行主链路
- ✅ AI QA 当前已复用租户 AI 配置解析能力
  - 当前实现优先走租户 `qa_review` 场景
  - 若该场景无配置，则 fallback 到租户默认 AI 配置
- ✅ 已完成租户前端主工作台首版：
  - Dashboard 总览
  - 风险池 / 抽检池 / 自动通过 三池切换
  - case 卡片队列
  - case 三栏详情抽屉
  - Markdown 准则编辑弹窗
- ✅ 已删除旧前端 QA 交互代码：
  - `QaCreateModal`
  - `QaRulesModal`
  - `QaReviewsTable`
  - `QaStatsCard`
  - `QaFilterBar`
  - `useQaData`
- ✅ 已将 QA v2 后端按职责拆分文件：
  - `qa-v2.ai-review.service.ts`
  - `qa-v2.case-data.ts`
  - `qa-v2.guideline.service.ts`
  - `qa-v2.manual-review.service.ts`
  - `qa-v2.query.service.ts`
  - `qa-v2.shared.ts`
  - `qa-v2.types.ts`
- ✅ 已新增 `qa_review` 独立场景模型配置能力
- ✅ 已补充“人工已处理 / AI差异”工作台视图
- ✅ 已补充 QA 工作台国际化
- ✅ 已补充日期范围与多坐席查询
- ✅ 已将队列 Tabs 切换调整为本地过滤，避免切换时整页重刷
- ✅ 已实现旧 QA 表清理迁移：
  - `qa_reviews`
  - `qa_scoring_rules`
  - `qa_scoring_schemes`
- ✅ 已完成类型级编译自检

本轮未完成：

- 未执行数据库迁移落库验证

---

## 2. 现状与问题

### 2.1 当前链路已经具备的基础能力

当前运行链路已经满足 QA v2 重构前提：

1. 同一客户重复接入时，`conversation` 会复用，但会重新创建新的 active `case`
2. 每条消息会落到当前 `case_id` 与 `segment_id`
3. owner 切换时会切 `segment`，并记录转接关系
4. 结案时会写入 `final_owner_type / final_owner_id / resolved_by_agent_id`

因此，系统已经能支持：

- 同客户同天两次独立咨询 -> 两个不同 case
- 一个 case 内多次转接 -> 多个不同 segment
- case 结案后稳定找到最终责任人
- 按 case 读取消息证据
- 按 segment 读取责任链

### 2.2 当前旧 QA 逻辑的主要问题

当前旧 QA 的主要问题不在“抓不到数据”，而在“对象与口径错误”：

- QA 仍偏人工驱动
- 候选对象偏 `conversation/thread` 视角
- 已结案后仍错误依赖 `current_owner_id`
- 没有风险驱动分流
- 没有 AI 预评审能力
- 没有面向运营的 Dashboard
- 没有 segment 级责任评分能力

### 2.3 本次方案的边界

本方案只覆盖以下范围：

- case 结案后自动质检
- 基于 case/segment 的 QA 结果生成与分流
- AI 质检与人工复核链路
- QA Dashboard / 队列 / 详情工作台
- QA 准则的租户化管理

本方案 **不覆盖** 以下范围：

- 实时会话中的实时风险拦截
- AI 回复前的在线审核
- 客户满意度（CSAT）逻辑重构
- 绩效系统重构
- 复杂多轮稽核审批流
- 平台级跨租户 QA 汇总

---

## 3. 核心对象定义

### 3.1 Conversation

`conversation` 是 persistent thread，用于承载客户长期聊天线程。

职责：

- 长期对话主线程
- 当前 handler / 当前 segment / 当前 case 的挂载点
- 不作为 QA 的评分对象

### 3.2 Case

`case` 是一次服务单元，是 QA 主对象。

典型定义：

- 一次客户问题从接入到解决/关闭
- 同客户同天多次咨询，可对应多个 case
- 同一 `conversation` 下可连续出现多个 case

QA 的主评分结果应绑定在 case 上。

### 3.3 Segment

`segment` 是一次具体服务段，是责任归因对象。

典型定义：

- AI 接待一段
- 人工 A 接待一段
- 转给人工 B 后又是一段

QA 的责任拆分应绑定在 segment 上。

---

## 4. 数据边界与来源

本节明确 QA 系统依赖的数据边界，以及每类信息从哪里获取。

### 4.1 Case 主信息

来源表：

- `conversation_cases`

关键字段：

- `case_id`
- `conversation_id`
- `customer_id`
- `status`
- `title`
- `summary`
- `opened_at`
- `resolved_at`
- `closed_at`
- `last_activity_at`
- `final_owner_type`
- `final_owner_id`
- `resolved_by_agent_id`

用途：

- case 列表展示
- 最终责任人归因
- 自动入池条件判断
- Dashboard 聚合统计

### 4.2 Segment 责任链

来源表：

- `conversation_segments`

关键字段：

- `segment_id`
- `conversation_id`
- `case_id`
- `owner_type`
- `owner_agent_id`
- `owner_ai_agent_id`
- `status`
- `started_at`
- `ended_at`
- `transferred_from_segment_id`
- `opened_reason`
- `closed_reason`

用途：

- 还原服务段链路
- 定位每段责任人
- 判断是否发生多次转接
- 生成 segment 级评分

### 4.3 消息证据

来源表：

- `messages`

关键字段：

- `message_id`
- `conversation_id`
- `case_id`
- `segment_id`
- `direction`
- `sender_type`
- `sender_id`
- `content`
- `reply_to_message_id`
- `reaction_target_message_id`
- `created_at`

用途：

- 生成 case 级消息流
- 为 AI 质检提供证据
- 定位关键回复
- 统计每段消息数

### 4.4 当前与最终责任人

来源表：

- `conversation_cases`
- `conversation_segments`
- `agent_profiles`
- `tenant_ai_agents`

规则：

1. case 最终责任座席：
   - 优先 `conversation_cases.resolved_by_agent_id`
   - 否则 `conversation_cases.final_owner_type='agent'` 时使用 `final_owner_id`
2. segment 责任人：
   - 人工段：`conversation_segments.owner_agent_id`
   - AI 段：`conversation_segments.owner_ai_agent_id`
3. 最后人工责任段：
   - 在该 case 的 segment 中按 `ended_at desc, started_at desc`
   - 找最后一个 `owner_type='human'`

### 4.5 调度与转接摘要

来源表：

- `decision_traces`
- `conversation_events`

用途：

- 判断是否发生 AI 转人工
- 判断是否人工转人工
- 统计多次转接
- 给 AI QA 提供风险上下文

### 4.6 客户与渠道信息

来源表：

- `customers`
- `conversations`

用途：

- Dashboard 展示
- QA 列表卡片展示
- AI 质检上下文补充

### 4.7 AI 质检模型配置

来源服务：

- `apps/api/src/modules/ai/provider-config.service.ts`

关键能力：

- `resolveTenantAISettings(...)`
- `resolveTenantAISettingsForScene(...)`

用途：

- AI QA 执行时按租户配置解析 provider / model / key / baseUrl
- 支持按 scene 单独配置 QA 专用模型

### 4.8 QA 准则

来源：

- 新增 `qa_guidelines`

格式：

- Markdown

用途：

- AI 质检的主要判定标准
- 租户可维护、可读、可版本化

---

## 5. 新系统边界内的业务目标

QA v2 系统的目标是：

1. case 结案后自动执行 AI QA
2. 按规则自动分流 case
3. 默认不需要人工逐条点开
4. 只把风险/抽检 case 暴露给人工复核
5. 支持人工确认、修改、驳回 AI 结果
6. 支持 Dashboard 看板化运营
7. 支持后续 AI 与人工差异分析

---

## 6. 新的系统流程

### 6.1 主流程

主流程从“人工驱动”改为“AI 驱动”：

1. case 进入 `resolved/closed`
2. 系统触发 QA 评估流程
3. 读取 case、segment、消息、准则、风险信号
4. 调用租户 AI 配置执行 AI QA
5. 输出结构化结果
6. 系统自动分流：
   - 自动通过池
   - 风险池
   - 抽检池
7. 人工仅处理风险池 / 抽检池

### 6.2 三种池

#### 自动通过池

特点：

- AI 判断通过
- 风险低
- 默认无需人工处理
- 进入结果库

#### 风险池

特点：

- AI 判断高风险或低置信度
- 必须人工复核
- 是人工的主要工作池

#### 抽检池

特点：

- AI 判断通过但命中抽样规则
- 用于校验 AI 质量与运营公平性

### 6.3 人工不是主驱动

系统应避免如下错误路径：

- 人工先建任务
- 人工逐条翻 case 再打分
- 全量 case 依赖人工进入详情页

正确路径应为：

- 系统自动判断
- 人工仅处理系统推出来的少量 case

---

## 7. QA 准则设计

### 7.1 为什么要文档化

由于本系统依赖 LLM 进行 QA 评估，固定字段化规则不足以表达复杂质检标准。  
因此，QA 准则必须允许租户以高可读方式维护，并可直接被 AI 理解。

### 7.2 采用 Markdown

前端提供 Markdown 编辑能力，允许租户维护：

- 总则
- 服务态度要求
- 响应与解决标准
- 转接标准
- AI 使用边界
- 禁止项
- 风险判定示例
- 低分场景示例

说明：

- 租户侧 QA 配置应尽量收敛到这份 Markdown 准则
- AI 将基于该准则 + case/segment 上下文自动评审
- 不再把风险阈值、抽样比例、segment 人工细颗粒评分做成租户必填配置
- 平台内部允许保留少量系统常量，用于保障任务量与系统稳定性，但这些不作为租户操作面

### 7.3 数据结构建议

新增表：

- `qa_guidelines`

建议字段：

- `guideline_id`
- `tenant_id`
- `name`
- `scope`
- `content_md`
- `is_active`
- `version`
- `created_at`
- `updated_at`

### 7.4 AI QA 输入内容

AI 执行时输入应包含：

- QA 准则 Markdown
- case 元信息
- 最终责任人
- 全部 segment 时间线
- 仅本 case 的消息记录
- 转接摘要
- SLA / 风险信号
- 必须输出的结构化 schema

---

## 8. 新的数据模型

### 8.1 qa_review_tasks

作用：

- QA 执行主记录
- 自动分流载体
- 不是“人工任务池”，而是 QA 生命周期主对象

建议字段：

- `qa_task_id`
- `tenant_id`
- `case_id`
- `source`
  - `risk_trigger`
  - `auto_sampling`
  - `manual_assign`
  - `appeal_recheck`
- `review_mode`
  - `ai_only`
  - `human_required`
  - `human_sampled`
- `queue_type`
  - `auto_pass`
  - `risk`
  - `sample`
- `status`
  - `queued`
  - `ai_running`
  - `ai_completed`
  - `review_required`
  - `reviewed_confirmed`
  - `reviewed_modified`
  - `reviewed_rejected`
  - `skipped`
- `risk_level`
- `risk_reasons`
- `confidence`
- `recommended_action`
- `assigned_reviewer_identity_id`
- `guideline_id`
- `guideline_version`
- `created_at`
- `updated_at`

### 8.2 qa_ai_reviews

作用：

- 保存 AI 原始 QA 结果
- 支撑人工复核
- 支撑 AI / 人工差异分析

建议字段：

- `qa_ai_review_id`
- `tenant_id`
- `case_id`
- `qa_task_id`
- `guideline_id`
- `guideline_version`
- `provider_name`
- `model`
- `score`
- `verdict`
- `confidence`
- `risk_level`
- `risk_reasons`
- `manual_review_recommended`
- `case_summary`
- `segment_reviews_json`
- `evidence_json`
- `raw_output_json`
- `status`
- `created_at`

### 8.3 qa_case_reviews

作用：

- 最终 case 级 QA 结果
- 可来自 AI 自动通过，也可来自人工确认/修改后发布

建议字段：

- `qa_case_review_id`
- `tenant_id`
- `qa_task_id`
- `case_id`
- `reviewer_identity_id`
- `source`
  - `ai_auto_pass`
  - `human_confirmed`
  - `human_modified`
- `final_owner_type`
- `final_owner_id`
- `resolved_by_agent_id`
- `total_score`
- `verdict`
- `tags`
- `summary`
- `status`
  - `draft`
  - `published`
- `created_at`
- `updated_at`

### 8.4 qa_segment_reviews

作用：

- 保存责任段评分

建议字段：

- `qa_segment_review_id`
- `tenant_id`
- `qa_case_review_id`
- `segment_id`
- `owner_type`
- `owner_agent_id`
- `owner_ai_agent_id`
- `score`
- `dimension_scores`
- `tags`
- `comment`
- `created_at`
- `updated_at`

## 9. 自动分流规则

### 9.1 自动通过条件

参考条件：

- `score >= 85`
- `confidence >= 0.8`
- 无高风险标签
- 无 SLA breach
- 无多次转接异常
- AI 未建议人工复核

### 9.2 风险池条件

命中任一条件进入风险池：

- `score < 80`
- `confidence < 0.65`
- 多次转接
- AI 转人工
- reopen 后再次结案
- 命中投诉/高风险标签
- 与准则存在明显冲突
- SLA breach
- 关键服务段缺少明确责任人

### 9.3 抽检池条件

适用于：

- AI 评估通过，但命中抽样规则
- 新人座席加权抽样
- 每日/每团队固定比例抽样
- 对 AI 质量进行对照复核

说明：

- 这些条件由平台内部系统逻辑控制，不作为租户侧复杂配置项暴露
- 租户主要操作面仍然是维护 QA 准则 Markdown，并查看 AI 结果与风险 case

---

## 10. 前端产品结构

### 10.1 Dashboard

Dashboard 是主入口，不是普通列表页。

展示：

- 今日 QA 数量
- 自动通过率
- 风险 case 数
- 抽检 case 数
- 各坐席平均分
- 各团队平均分
- AI vs 人工差异
- 低分趋势
- 风险来源分布
- 多次转接占比
- AI 低置信度占比

目标：

- 不点详情也知道整体情况
- 运营 / 主管快速识别异常

### 10.2 队列视图

队列视图采用 Tabs：

- 风险池
- 抽检池
- 自动通过池
- 人工已处理
- AI 与人工差异

每条 case 卡片至少展示：

- 客户名 / 渠道 / 时间
- case 标题
- 最终责任人
- segment 数量
- AI 总评分
- 风险标签
- 建议动作
- 置信度
- 是否多次转接
- 是否 AI 转人工
- 是否 SLA breach

要求：

- 不点详情也能理解
- 可直接筛选

### 10.3 详情页

采用三栏布局：

#### 左栏：消息流

- 仅展示本 case 的消息
- 聊天记录
- AI 高亮关键证据句

#### 中栏：segment 时间线

- 每段开始/结束
- owner 类型
- owner 名称
- 转接关系
- 每段消息数
- 每段 AI 评分
- 每段人工评分
- 最后人工责任段高亮

#### 右栏：评分与操作

上半部分：

- AI 总评
- AI 分段评分
- 命中的准则条款
- 风险原因
- 证据摘要

下半部分：

- 通过
- 修改
- 驳回

人工操作应尽量轻量。

说明：

- 人工复核只修正 case 级最终结论，不要求租户维护复杂的 segment 级评分表单
- segment 时间线的核心价值是让 AI 评审和人工复核都能看清责任链，而不是增加人工录入成本

---

## 11. 相关信息从哪里获取

本节给实施人员一个明确的“查哪里”地图。

### 11.1 case 信息

查：

- `conversation_cases`

重点：

- `status`
- `title`
- `summary`
- `final_owner_type`
- `final_owner_id`
- `resolved_by_agent_id`

### 11.2 case 消息

查：

- `messages`

过滤条件：

- `messages.case_id = :caseId`

注意：

- 不允许再按 `conversation_id` 拉整条 thread 作为 QA 详情主数据

### 11.3 segment 链

查：

- `conversation_segments`

过滤条件：

- `conversation_segments.case_id = :caseId`

### 11.4 调度与转接风险

查：

- `decision_traces`
- `conversation_events`

### 11.5 客户与渠道

查：

- `customers`
- `conversations`

### 11.6 AI 配置

查：

- `resolveTenantAISettingsForScene(...)`
- `resolveTenantAISettings(...)`

### 11.7 QA 准则

查：

- `qa_guidelines`

---

## 12. 每次执行前必须检查的实际系统逻辑

本节非常关键。任何开发、联调、发布、回归时，都必须先检查以下实际逻辑是否仍成立。

### 12.1 会话重开逻辑

检查点：

- 同一客户重复接入时是否仍复用 `conversation`
- 是否仍会重新创建 active `case`

必须验证：

- 两次独立咨询最终落成两个不同 case

### 12.2 消息归属逻辑

检查点：

- 入站消息是否仍写入 `messages.case_id`
- 入站消息是否仍写入 `messages.segment_id`
- 出站消息是否仍写入正确的 case / segment

必须验证：

- QA 详情按 `case_id` 查消息时，消息不串案

### 12.3 segment 切换逻辑

检查点：

- owner 切换时是否仍结束旧 segment 并创建新 segment
- `transferred_from_segment_id` 是否写入

必须验证：

- 人工 A -> 人工 B 时，能看到两个 segment

### 12.4 结案归因逻辑

检查点：

- 结案时是否仍写 `final_owner_type`
- 是否仍写 `final_owner_id`
- 是否仍写 `resolved_by_agent_id`

必须验证：

- 已 resolved/closed 的 case 仍能稳定找回最终责任座席

### 12.5 QA 详情数据范围

检查点：

- 详情接口是否只按 `case_id` 取消息
- 详情接口是否只按 `case_id` 取 segment

必须验证：

- 不再混入同一 conversation 下其他 case 的消息

### 12.6 AI 配置逻辑

检查点：

- 当前租户是否存在 active AI config
- 是否支持 scene 级选择
- fallback 是否正确

必须验证：

- 无租户 AI config 时，AI QA 不应阻塞人工链路

### 12.7 QA 准则版本逻辑

检查点：

- AI 执行时读取的 guideline 是否为 active 版本
- review 结果是否记录 guideline version

必须验证：

- 后续差异分析可以按 guideline 版本追溯

---

## 13. 分阶段计划

### 阶段 1：AI 驱动底座

目标：

- case 结案自动创建 QA task
- 自动跑 AI QA
- 自动完成分流

实施：

- ✅ 新建表：
  - `qa_review_tasks`
  - `qa_ai_reviews`
  - `qa_case_reviews`
  - `qa_segment_reviews`
  - `qa_guidelines`
- ✅ 新建 QA v2 后端服务文件：
  - `qa-v2.ai-review.service.ts`
  - `qa-v2.case-data.ts`
  - `qa-v2.guideline.service.ts`
  - `qa-v2.manual-review.service.ts`
  - `qa-v2.query.service.ts`
  - `qa-v2.shared.ts`
  - `qa-v2.types.ts`
- ✅ 新增结案后自动触发逻辑
- ✅ 新增 AI scene：`qa_review`

阶段验收：

- ✅ case 结案后自动创建 QA task
- ✅ AI 可自动完成评审
- ✅ case 自动进入 `auto_pass / risk / sample`

阶段执行前必检：

- 会话重开逻辑
- case 创建逻辑
- 消息 case/segment 写入逻辑
- 结案归因逻辑
- 租户 AI 配置逻辑

### 阶段 2：Dashboard 与队列

目标：

- 让运营和 QA 团队可以不点详情先看整体
- 让风险与抽检队列可用

实施：

- ✅ Dashboard 页面
- ✅ 队列 Tabs：
  - 风险池
  - 抽检池
  - 自动通过池
- ✅ 人工已处理
- ✅ AI vs 人工差异
- ✅ 卡片化 case 列表
- ✅ 基础筛选与刷新

阶段验收：

- ✅ 运营无需进入详情即可掌握整体情况
- ✅ 风险 case 可直接在队列中识别

阶段执行前必检：

- Dashboard 聚合指标 SQL 是否基于新表
- 队列分类逻辑是否与后端实际状态一致

### 阶段 3：详情工作台与人工复核

目标：

- 对风险/抽检 case 提供轻量人工复核能力

实施：

- ✅ case 详情接口
- ✅ 三栏详情页
- ✅ 人工操作后端入口：
  - 通过
  - 修改
  - 驳回

阶段验收：

- ✅ 人工只处理少量 case
- ✅ 可以看到完整 case 证据与 segment 时间线

阶段执行前必检：

- 详情数据是否仅按 case 范围读取
- segment 链是否完整
- 最终责任人是否准确

### 阶段 4：差异分析与内部策略固化

目标：

- 建立 AI QA 可信度校验能力
- 固化平台内部风控与抽检逻辑，不增加租户操作复杂度

实施：

- ✅ AI / 人工差异分析看板（工作台视图首版）
- guideline 版本对比
- 平台内部抽样逻辑整理
- 平台内部风险触发逻辑整理

阶段验收：

- 能评估 AI QA 效果
- 能在不增加租户配置负担的前提下稳定运行 QA 分流

阶段执行前必检：

- AI review 与人工 review 关联是否稳定
- guideline version 记录是否完备

### 阶段 5：旧逻辑清理

目标：

- 下线旧 QA 模型与旧页面

实施：

- ✅ 已移除旧前端 QA 交互代码路径
- ✅ 旧后端 `/api/admin/qa/*` 已切换为 QA v2 路由
- ✅ 已实现旧表清理迁移：
  - `qa_reviews`
  - `qa_scoring_rules`
  - `qa_scoring_schemes`

阶段验收：

- 仓库中不再有旧 QA 逻辑引用
- 新 QA v2 全量接管

阶段执行前必检：

- 新系统已覆盖 Dashboard、队列、详情、人工复核、AI QA 全链路
- 数据库迁移已在目标环境执行

---

## 14. 旧逻辑下线策略

旧 QA 不保留主路径，不做长期兼容。

建议策略：

1. 先完成 QA v2 主链路
2. 让 Dashboard / 风险池 / 抽检池 / 详情工作台全部上线
3. 停止旧入口写入
4. 最终删除旧表与旧接口

---

## 15. 最终判断

本次 QA 重构的正确方向不是：

- 列表 + 人工新建 + 人工逐条评审

而是：

- AI 驱动自动评审
- 自动分流
- 风险优先
- 抽检复核
- case 评分 + segment 归因
- Markdown 准则驱动
- Dashboard 化运营

因此，系统最终形态应是：

- `case` 是 QA 主对象
- `segment` 是责任对象
- `resolved_by_agent_id / final_owner_id` 是结案归因依据
- `messages.case_id / messages.segment_id` 是 QA 证据范围
- `qa_guidelines` 是 AI 判定标准
- `qa_review_tasks` 是自动分流主对象
- `qa_ai_reviews` 是 AI 评审原始结果
- 人工只处理系统挑出来的 case
