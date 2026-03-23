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
      title={rule ? "编辑调度规则" : "新增调度规则"}
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
          {rule ? "保存" : "创建"}
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
            <Form.Item label="规则名称" name="name" rules={[{ required: true, message: "请输入规则名称" }]}>
              <Input placeholder="WhatsApp 售后 VIP" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="优先级" name="priority" rules={[{ required: true, message: "请输入优先级" }]}>
              <InputNumber min={1} max={999} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="启用" name="isActive" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 命中条件 ── */}
        <Divider style={{ marginTop: 4 }}><Typography.Text type="secondary" style={{ fontSize: 13 }}>命中条件</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="渠道" name="channelType">
              <Select allowClear options={CHANNEL_OPTIONS} placeholder="任意渠道" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="语言" name="customerLanguage">
              <Select allowClear options={LANGUAGE_OPTIONS} placeholder="任意语言" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="客户等级" name="customerTier">
              <Select allowClear options={TIER_OPTIONS} placeholder="任意等级" />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 执行模式 ── */}
        <Divider style={{ marginTop: 4 }}><Typography.Text type="secondary" style={{ fontSize: 13 }}>调度动作</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="执行模式" name="executionMode" rules={[{ required: true }]}>
              <Select options={EXECUTION_MODE_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          执行模式决定当前规则是先走 AI、先走人工，还是只允许其中一种处理方式。
        </Typography.Text>

        {/* ── 人工目标 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>人工目标</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="目标部门" name="targetDepartmentId">
              <Select
                allowClear
                placeholder="不限部门"
                options={departmentOptions}
                onChange={() => form.setFieldValue("targetTeamId", undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="目标团队" name="targetTeamId">
              <Select
                allowClear
                placeholder="部门内任意团队"
                options={teamOptions.map((t) => ({ value: t.teamId, label: `${t.name} / ${t.departmentName}` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="目标技能组" name="targetSkillGroupCode" rules={[{ required: true, message: "请选择技能组" }]}>
              <Select showSearch optionFilterProp="label" options={activeGroups} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="分配策略" name="assignmentStrategy" rules={[{ required: true }]}>
              <Select options={STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="AI 座席" name="aiAgentId">
              <Select allowClear placeholder="留空按 AI 策略自动选" options={activeAiAgents} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="AI 分配策略" name="aiAssignmentStrategy" rules={[{ required: true }]}>
              <Select options={AI_STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 容量与覆盖策略 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>容量与覆盖策略</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="人工→AI 阈值(%)" name="humanToAiThresholdPct">
              <InputNumber min={0} max={100} style={{ width: "100%" }} placeholder="不溢出" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="AI→人工 阈值(%)" name="aiToHumanThresholdPct">
              <InputNumber min={0} max={100} style={{ width: "100%" }} placeholder="不溢出" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="AI 软并发上限" name="aiSoftConcurrencyLimit">
              <InputNumber min={1} max={500} style={{ width: "100%" }} placeholder="负载估算" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label="混合策略" name="hybridStrategy">
              <Select options={HYBRID_STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="客户要求人工" name="customerRequestsHuman" rules={[{ required: true }]}>
              <Select options={OVERRIDE_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="AI 无法处理" name="aiUnhandled" rules={[{ required: true }]}>
              <Select options={AI_UNHANDLED_OPTIONS.map((i) => ({ value: i.value, label: i.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="人工关键词（每行一个）" name="humanRequestKeywords">
              <Input.TextArea rows={2} placeholder={"人工\n转人工\n客服"} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 回退目标 ── */}
        <Divider plain><Typography.Text type="secondary" style={{ fontSize: 13 }}>回退目标</Typography.Text></Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="回退部门" name="fallbackDepartmentId">
              <Select
                allowClear
                placeholder="沿用人工目标"
                options={departmentOptions}
                onChange={() => form.setFieldValue("fallbackTeamId", undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="回退团队" name="fallbackTeamId">
              <Select
                allowClear
                placeholder="沿用人工目标"
                options={fallbackTeamOptions.map((t) => ({ value: t.teamId, label: `${t.name} / ${t.departmentName}` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="回退技能组" name="fallbackSkillGroupCode">
              <Select allowClear showSearch optionFilterProp="label" placeholder="沿用人工目标" options={activeGroups} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="回退策略" name="fallbackAssignmentStrategy">
              <Select
                allowClear
                placeholder="沿用人工目标"
                options={STRATEGY_OPTIONS.map((i) => ({ value: i.value, label: i.label }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {showAiHint && (
          <Typography.Text type="secondary">
            固定 AI 座席优先；留空时按 AI 分配策略在启用 AI 座席中选择。
          </Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
