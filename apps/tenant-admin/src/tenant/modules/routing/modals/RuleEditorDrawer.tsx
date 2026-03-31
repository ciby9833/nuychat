/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 路由规则 -> 规则编辑抽屉
 * 文件职责: 维护路由规则的条件、执行模式、人工与 AI 目标、回退策略等配置。
 * 主要交互文件:
 * - ../RoutingTab.tsx
 * - ../helpers.ts
 * - ../types.ts
 * - ../../../types
 */

import {
  Button,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Switch,
  Typography
} from "antd";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo } from "react";

import type { DepartmentItem, RoutingRule, SkillGroup, TeamItem, TenantAIAgent } from "../../../types";
import {
  readAiAgentId,
  readAiAssignmentStrategy,
  readExecutionMode,
  readFallbackTarget,
  readHumanTarget,
  readHybridStrategy,
  readOverflowPolicy,
  readOverrides
} from "../helpers";
import type { RuleFormValues } from "../types";
import {
  AI_STRATEGY_OPTIONS,
  AI_UNHANDLED_OPTIONS,
  CHANNEL_OPTIONS,
  EXECUTION_MODE_OPTIONS,
  HYBRID_STRATEGY_OPTIONS,
  LANGUAGE_OPTIONS,
  OVERRIDE_OPTIONS,
  STRATEGY_OPTIONS,
  TIER_OPTIONS
} from "../types";

export function RuleEditorDrawer({
  open,
  saving,
  rule,
  departments,
  teams,
  aiAgents,
  groups,
  onClose,
  onSubmit
}: {
  open: boolean;
  saving: boolean;
  rule: RoutingRule | null;
  departments: DepartmentItem[];
  teams: TeamItem[];
  aiAgents: TenantAIAgent[];
  groups: SkillGroup[];
  onClose: () => void;
  onSubmit: (values: RuleFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<RuleFormValues>();
  const selectedDepartmentId = Form.useWatch("targetDepartmentId", form);
  const selectedFallbackDepartmentId = Form.useWatch("fallbackDepartmentId", form);
  const selectedExecutionMode = Form.useWatch("executionMode", form);

  useEffect(() => {
    if (!open) return;
    const humanTarget = rule ? readHumanTarget(rule) : null;
    const fallbackTarget = rule ? readFallbackTarget(rule) : null;
    const overflowPolicy = rule ? readOverflowPolicy(rule) : null;
    const overrides = rule ? readOverrides(rule) : null;
    form.setFieldsValue({
      name: rule?.name ?? "",
      priority: rule?.priority ?? 100,
      channelType: rule?.conditions.channelType,
      customerLanguage: rule?.conditions.customerLanguage,
      customerTier: rule?.conditions.customerTier,
      executionMode: rule ? readExecutionMode(rule) : "ai_first",
      targetDepartmentId: humanTarget?.targetDepartmentId,
      targetTeamId: humanTarget?.targetTeamId,
      targetSkillGroupCode: humanTarget?.targetSkillGroupCode ?? "",
      aiAgentId: rule ? readAiAgentId(rule) : undefined,
      aiAssignmentStrategy: rule ? readAiAssignmentStrategy(rule) : "least_busy",
      assignmentStrategy: humanTarget?.assignmentStrategy ?? "least_busy",
      humanToAiThresholdPct: overflowPolicy?.humanToAiThresholdPct,
      aiToHumanThresholdPct: overflowPolicy?.aiToHumanThresholdPct,
      aiSoftConcurrencyLimit: overflowPolicy?.aiSoftConcurrencyLimit,
      hybridStrategy: rule ? readHybridStrategy(rule) : "load_balanced",
      customerRequestsHuman: overrides?.customerRequestsHuman ?? "force_human",
      humanRequestKeywords: overrides?.humanRequestKeywords ?? "",
      aiUnhandled: overrides?.aiUnhandled ?? "force_human",
      fallbackDepartmentId: fallbackTarget?.fallbackDepartmentId,
      fallbackTeamId: fallbackTarget?.fallbackTeamId,
      fallbackSkillGroupCode: fallbackTarget?.fallbackSkillGroupCode,
      fallbackAssignmentStrategy: fallbackTarget?.fallbackAssignmentStrategy,
      isActive: rule?.is_active ?? true
    });
  }, [open, rule, form]);

  const teamOptions = useMemo(() => {
    if (!selectedDepartmentId) return teams;
    return teams.filter((team) => team.departmentId === selectedDepartmentId);
  }, [teams, selectedDepartmentId]);

  const fallbackTeamOptions = useMemo(() => {
    if (!selectedFallbackDepartmentId) return teams;
    return teams.filter((team) => team.departmentId === selectedFallbackDepartmentId);
  }, [teams, selectedFallbackDepartmentId]);

  const activeGroups = useMemo(
    () => groups.filter((g) => g.is_active).map((g) => ({ value: g.code, label: `${g.name} (${g.code})` })),
    [groups]
  );

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.departmentId, label: d.name })),
    [departments]
  );

  const activeAiAgents = useMemo(
    () => aiAgents.filter((a) => a.status === "active").map((a) => ({ value: a.aiAgentId, label: a.name })),
    [aiAgents]
  );

  const showAiHint = selectedExecutionMode !== "human_only" && selectedExecutionMode !== "human_first";

  return (
    <Drawer
      title={rule ? t("routing.form.editRule") : t("routing.form.createRule")}
      open={open}
      onClose={() => {
        form.resetFields();
        onClose();
      }}
      width={640}
      destroyOnClose
      extra={
        <Button
          type="primary"
          loading={saving}
          onClick={() => {
            void (async () => {
              const values = await form.validateFields();
              await onSubmit(values);
              form.resetFields();
            })();
          }}
        >
          {rule ? t("common.save") : t("routing.form.create")}
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          priority: 100,
          executionMode: "ai_first",
          aiAssignmentStrategy: "least_busy",
          assignmentStrategy: "least_busy",
          hybridStrategy: "load_balanced",
          customerRequestsHuman: "force_human",
          aiUnhandled: "force_human",
          isActive: true
        }}
      >
        {/* ── 基本信息 ── */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.ruleName")} name="name" rules={[{ required: true, message: t("routing.form.ruleNameRequired") }]}>
              <Input placeholder={t("routing.form.ruleNamePlaceholder")} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("routing.table.priority")} name="priority" rules={[{ required: true, message: t("routing.form.priorityRequired") }]}>
              <InputNumber min={1} max={999} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label={t("routing.form.enabled")} name="isActive" valuePropName="checked">
              <Switch checkedChildren={t("routing.state.active")} unCheckedChildren={t("routing.state.inactive")} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 命中条件 ── */}
        <Divider style={{ marginTop: 4 }}><Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.matchConditions")}</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t("routing.form.channel")} name="channelType">
              <Select allowClear options={CHANNEL_OPTIONS} placeholder={t("routing.form.anyChannel")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.language")} name="customerLanguage">
              <Select allowClear options={LANGUAGE_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} placeholder={t("routing.form.anyLanguage")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.customerTier")} name="customerTier">
              <Select allowClear options={TIER_OPTIONS} placeholder={t("routing.form.anyTier")} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 执行模式 ── */}
        <Divider style={{ marginTop: 4 }}><Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.routingAction")}</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.executionMode")} name="executionMode" rules={[{ required: true }]}>
              <Select options={EXECUTION_MODE_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          {t("routing.form.executionHint")}
        </Typography.Text>

        {/* ── 人工目标 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.humanTarget")}</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.targetDepartment")} name="targetDepartmentId">
              <Select
                allowClear
                placeholder={t("routing.form.anyDepartment")}
                options={departmentOptions}
                onChange={() => form.setFieldValue("targetTeamId", undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t("routing.form.targetTeam")} name="targetTeamId">
              <Select
                allowClear
                placeholder={t("routing.form.anyTeamInDepartment")}
                options={teamOptions.map((t) => ({ value: t.teamId, label: `${t.name} / ${t.departmentName}` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.targetSkillGroup")} name="targetSkillGroupCode" rules={[{ required: true, message: t("routing.form.targetSkillGroupRequired") }]}>
              <Select showSearch optionFilterProp="label" options={activeGroups} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t("routing.form.assignmentStrategy")} name="assignmentStrategy" rules={[{ required: true }]}>
              <Select options={STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.aiAgent")} name="aiAgentId">
              <Select allowClear placeholder={t("routing.form.autoSelectAi")} options={activeAiAgents} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t("routing.form.aiAssignmentStrategy")} name="aiAssignmentStrategy" rules={[{ required: true }]}>
              <Select options={AI_STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 容量与覆盖策略 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.capacityAndOverrides")}</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t("routing.form.humanToAiThreshold")} name="humanToAiThresholdPct">
              <InputNumber min={0} max={100} style={{ width: "100%" }} placeholder={t("routing.form.noOverflow")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.aiToHumanThreshold")} name="aiToHumanThresholdPct">
              <InputNumber min={0} max={100} style={{ width: "100%" }} placeholder={t("routing.form.noOverflow")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.aiSoftConcurrencyLimit")} name="aiSoftConcurrencyLimit">
              <InputNumber min={1} max={500} style={{ width: "100%" }} placeholder={t("routing.form.loadEstimate")} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t("routing.form.hybridStrategy")} name="hybridStrategy">
              <Select options={HYBRID_STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.customerRequestsHuman")} name="customerRequestsHuman" rules={[{ required: true }]}>
              <Select options={OVERRIDE_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.aiUnhandled")} name="aiUnhandled" rules={[{ required: true }]}>
              <Select options={AI_UNHANDLED_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label={t("routing.form.humanKeywords")} name="humanRequestKeywords">
              <Input.TextArea rows={2} placeholder={t("routing.form.humanKeywordsPlaceholder")} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 回退目标 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.fallbackTarget")}</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.fallbackDepartment")} name="fallbackDepartmentId">
              <Select
                allowClear
                placeholder={t("routing.form.fallbackReuseHumanTarget")}
                options={departmentOptions}
                onChange={() => form.setFieldValue("fallbackTeamId", undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t("routing.form.fallbackTeam")} name="fallbackTeamId">
              <Select
                allowClear
                placeholder={t("routing.form.fallbackReuseHumanTarget")}
                options={fallbackTeamOptions.map((t) => ({ value: t.teamId, label: `${t.name} / ${t.departmentName}` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.fallbackSkillGroup")} name="fallbackSkillGroupCode">
              <Select allowClear showSearch optionFilterProp="label" placeholder={t("routing.form.fallbackReuseHumanTarget")} options={activeGroups} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={t("routing.form.fallbackStrategy")} name="fallbackAssignmentStrategy">
              <Select
                allowClear
                placeholder={t("routing.form.fallbackReuseHumanTarget")}
                options={STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: t(i.labelKey) }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {showAiHint && (
          <Typography.Text type="secondary">
            {t("routing.form.aiHint")}
          </Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
