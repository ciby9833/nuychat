/**
 * 菜单路径与名称: 客户中心 -> 路由 -> 路由规则 -> 规则编辑抽屉
 * 文件职责: 维护第一阶段智能调度规则的轻量配置。
 */

import { Button, Col, Divider, Drawer, Form, Input, InputNumber, Row, Select, Switch, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo } from "react";

import type { ChannelConfig, DepartmentItem, RoutingRule, TeamItem } from "../../../types";
import { readAiStrategy, readExecutionMode, readHumanStrategy, readServiceTarget } from "../helpers";
import type { RuleFormValues } from "../types";
import { AI_STRATEGY_OPTIONS, CHANNEL_OPTIONS, EXECUTION_MODE_OPTIONS, LANGUAGE_OPTIONS, STRATEGY_OPTIONS, TIER_OPTIONS } from "../types";

export function RuleEditorDrawer({
  open,
  saving,
  rule,
  channels,
  departments,
  teams,
  onClose,
  onSubmit
}: {
  open: boolean;
  saving: boolean;
  rule: RoutingRule | null;
  channels: ChannelConfig[];
  departments: DepartmentItem[];
  teams: TeamItem[];
  onClose: () => void;
  onSubmit: (values: RuleFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<RuleFormValues>();
  const selectedDepartmentId = Form.useWatch("targetDepartmentId", form);
  const selectedChannelType = Form.useWatch("channelType", form);

  useEffect(() => {
    if (!open) return;
    const serviceTarget = rule ? readServiceTarget(rule) : null;
    form.setFieldsValue({
      name: rule?.name ?? "",
      priority: rule?.priority ?? 100,
      channelType: rule?.conditions.channelType,
      channelId: rule?.conditions.channelId,
      customerLanguage: rule?.conditions.customerLanguage,
      customerTier: rule?.conditions.customerTier,
      executionMode: rule ? readExecutionMode(rule) : "hybrid",
      targetDepartmentId: serviceTarget?.targetDepartmentId,
      targetTeamId: serviceTarget?.targetTeamId,
      assignmentStrategy: rule ? readHumanStrategy(rule) : "balanced_new_case",
      aiAssignmentStrategy: rule ? readAiStrategy(rule) : "least_busy",
      isActive: rule?.is_active ?? true
    });
  }, [open, rule, form]);

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ value: department.departmentId, label: department.name })),
    [departments]
  );

  const teamOptions = useMemo(() => {
    if (!selectedDepartmentId) return teams;
    return teams.filter((team) => team.departmentId === selectedDepartmentId);
  }, [teams, selectedDepartmentId]);

  const channelInstanceOptions = useMemo(() => {
    const filtered = selectedChannelType
      ? channels.filter((channel) => channel.channel_type === selectedChannelType)
      : channels;

    return filtered.map((channel) => {
      let label = channel.channel_id;
      if (channel.channel_type === "whatsapp") {
        label = channel.label?.trim()
          || channel.display_phone_number?.trim()
          || channel.phone_number_id?.trim()
          || channel.channel_id;
      } else if (channel.channel_type === "web") {
        label = channel.widget_name?.trim()
          || channel.public_channel_key?.trim()
          || channel.channel_id;
      }

      return {
        value: channel.channel_id,
        label: `${label} (${channel.channel_id})`
      };
    });
  }, [channels, selectedChannelType]);

  return (
    <Drawer
      title={rule ? t("routing.form.editRule") : t("routing.form.createRule")}
      open={open}
      onClose={() => {
        form.resetFields();
        onClose();
      }}
      width={620}
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
          executionMode: "hybrid",
          assignmentStrategy: "balanced_new_case",
          aiAssignmentStrategy: "least_busy",
          isActive: true
        }}
      >
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

        <Divider style={{ marginTop: 4 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("routing.form.matchConditions")}</Typography.Text>
        </Divider>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t("routing.form.channel")} name="channelType">
              <Select
                allowClear
                options={CHANNEL_OPTIONS}
                placeholder={t("routing.form.anyChannel")}
                onChange={() => form.setFieldValue("channelId", undefined)}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.channelInstance")} name="channelId">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={channelInstanceOptions}
                placeholder={t("routing.form.anyChannelInstance")}
                disabled={channelInstanceOptions.length === 0}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.language")} name="customerLanguage">
              <Select allowClear options={LANGUAGE_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))} placeholder={t("routing.form.anyLanguage")} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t("routing.form.customerTier")} name="customerTier">
              <Select allowClear options={TIER_OPTIONS} placeholder={t("routing.form.anyTier")} />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ marginTop: 4 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>默认调度策略</Typography.Text>
        </Divider>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={t("routing.form.executionMode")} name="executionMode" rules={[{ required: true }]}>
              <Select
                options={EXECUTION_MODE_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.value === "hybrid" ? "智能分配" : item.value === "human_first" ? "偏人工" : "偏AI"
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
          智能分配会结合在线人工、AI、排班和负载自动选择最合适的处理方。偏人工和偏AI只影响默认倾向，不需要再配置回退规则。
        </Typography.Text>

        <Divider plain>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>服务目标</Typography.Text>
        </Divider>
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
                options={teamOptions.map((team) => ({ value: team.teamId, label: `${team.name} / ${team.departmentName}` }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="人工分配策略" name="assignmentStrategy" rules={[{ required: true }]}>
              <Select options={STRATEGY_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="AI 分配策略" name="aiAssignmentStrategy" rules={[{ required: true }]}>
              <Select options={AI_STRATEGY_OPTIONS.map((item) => ({ value: item.value, label: t(item.labelKey) }))} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  );
}
