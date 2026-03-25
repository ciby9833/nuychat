// 作用: AI 运行策略卡片（查看态 / 编辑态分离，防止误操作）
// 菜单路径: 客户中心 -> AI 配置管理 -> AI 运行策略
// 作者：吴川

import { EditOutlined, UndoOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import { getTenantAIRuntimePolicy, patchTenantAIRuntimePolicy } from "../../../api";
import type { AIRuntimePolicy, PreReplyPolicyRule, PreReplyPolicySet } from "../../../types";

const SKILL_OPTIONS = [
  { value: "search_knowledge_base", label: "知识库检索" },
  { value: "lookup_order", label: "订单查询" },
  { value: "track_shipment", label: "物流查询" }
];

const INTENT_OPTIONS = [
  { value: "general_inquiry", label: "general_inquiry" },
  { value: "order_inquiry", label: "order_inquiry" },
  { value: "delivery_inquiry", label: "delivery_inquiry" },
  { value: "refund_request", label: "refund_request" },
  { value: "cancellation", label: "cancellation" },
  { value: "complaint", label: "complaint" },
  { value: "payment_inquiry", label: "payment_inquiry" }
];

const ON_MISSING_LABEL: Record<string, string> = {
  handoff: "转人工 (handoff)",
  defer: "延迟回复 (defer)"
};

type RuntimePolicyFormValues = {
  pre_reply_policies: PreReplyPolicySet;
};

/* ─────── 查看态：规则只读展示 ─────── */
function RuleViewCard({ rule }: { rule: PreReplyPolicyRule }) {
  return (
    <Card
      size="small"
      styles={{ body: { padding: 12 } }}
      title={
        <Space>
          <Typography.Text strong>{rule.name || "未命名规则"}</Typography.Text>
          <Tag color={rule.enabled ? "green" : "default"}>{rule.enabled ? "已启用" : "已停用"}</Tag>
        </Space>
      }
    >
      <Descriptions size="small" column={1} colon>
        <Descriptions.Item label="必检技能">
          {rule.requiredSkills?.length
            ? rule.requiredSkills.map((s) => {
              const opt = SKILL_OPTIONS.find((o) => o.value === s);
              return <Tag key={s} color="blue">{opt?.label ?? s}</Tag>;
            })
            : <Typography.Text type="secondary">无</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label="触发意图">
          {rule.intents?.length
            ? rule.intents.map((i) => <Tag key={i}>{i}</Tag>)
            : <Typography.Text type="secondary">全部意图</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label="触发关键词">
          {rule.keywords?.length
            ? rule.keywords.map((k) => <Tag key={k}>{k}</Tag>)
            : <Typography.Text type="secondary">无</Typography.Text>}
        </Descriptions.Item>
        <Descriptions.Item label="缺失时动作">
          {ON_MISSING_LABEL[rule.onMissing] ?? rule.onMissing ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="系统原因码">{rule.reason || "-"}</Descriptions.Item>
        <Descriptions.Item label="并入首选技能">
          {rule.augmentPreferredSkills ? "是" : "否"}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

/* ─────── 主组件 ─────── */
export function AIRuntimePolicyCard() {
  const [form] = Form.useForm<RuntimePolicyFormValues>();
  const [policy, setPolicy] = useState<AIRuntimePolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await getTenantAIRuntimePolicy();
      setPolicy(next);
      form.setFieldsValue({ pre_reply_policies: next.pre_reply_policies });
    } catch (err) {
      setError((err as Error).message);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const enterEdit = () => {
    if (policy) {
      form.setFieldsValue({ pre_reply_policies: policy.pre_reply_policies });
    }
    setEditing(true);
    setSaved(false);
  };

  const cancelEdit = () => {
    if (policy) {
      form.setFieldsValue({ pre_reply_policies: policy.pre_reply_policies });
    }
    setEditing(false);
    setError("");
  };

  const confirmSave = async () => {
    try {
      setBusy(true);
      setError("");
      setSaved(false);
      const values = await form.validateFields();
      const next = await patchTenantAIRuntimePolicy({
        preReplyPolicies: values.pre_reply_policies
      });
      setPolicy(next);
      form.setFieldsValue({ pre_reply_policies: next.pre_reply_policies });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    Modal.confirm({
      title: "确认保存策略",
      content: "修改后的运行策略将立即生效，是否确认保存？",
      okText: "确认保存",
      cancelText: "取消",
      onOk: () => confirmSave()
    });
  };

  const prp = policy?.pre_reply_policies;
  const rules = prp?.rules ?? [];

  return (
    <Card
      title="AI 运行策略"
      extra={
        editing ? (
          <Space>
            <Button icon={<UndoOutlined />} onClick={cancelEdit}>取消</Button>
            <Button type="primary" loading={busy} onClick={handleSave}>保存策略</Button>
          </Space>
        ) : (
          <Button icon={<EditOutlined />} onClick={enterEdit}>编辑策略</Button>
        )
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          这里定义的是租户级系统流程边界，不属于模型 Key 或底层模型驱动配置。规则只决定直接回复前必须完成哪些检查。
        </Typography.Paragraph>
        {policy ? (
          <Typography.Text type="secondary">
            最后更新：{policy.updated_at ?? "未保存到租户策略表"}
          </Typography.Text>
        ) : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {saved ? <Alert type="success" showIcon message="策略已保存" /> : null}

        {/* ─────── 查看态 ─────── */}
        {!editing ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="回复前检查">
                <Tag color={prp?.enabled ? "green" : "default"}>
                  {prp?.enabled ? "已启用" : "已停用"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="规则数">
                {rules.length} 条
              </Descriptions.Item>
            </Descriptions>

            {rules.length === 0 ? (
              <Alert
                type="info"
                showIcon
                message="暂未配置回复前检查规则"
                description="点击右上角「编辑策略」可添加规则。"
              />
            ) : (
              rules.map((rule, idx) => <RuleViewCard key={rule.ruleId ?? idx} rule={rule} />)
            )}
          </Space>
        ) : null}

        {/* ─────── 编辑态 ─────── */}
        {editing ? (
          <Form form={form} layout="vertical">
            <Alert
              type="warning"
              showIcon
              message="当前处于编辑模式"
              description="修改完成后请点击右上角「保存策略」，或点击「取消」放弃变更。"
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              label="启用回复前检查"
              name={["pre_reply_policies", "enabled"]}
              valuePropName="checked"
              extra="系统会在 AI 直接回复前检查是否已完成必需技能调用。"
            >
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
            <Form.List name={["pre_reply_policies", "rules"]}>
              {(fields, { add, remove }) => (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {fields.map((field) => (
                    <Card
                      key={field.key}
                      size="small"
                      title={
                        <Form.Item
                          name={[field.name, "name"]}
                          style={{ margin: 0 }}
                          rules={[{ required: true, message: "请输入规则名称" }]}
                        >
                          <Input placeholder="规则名称，例如：退款问题先查知识库" />
                        </Form.Item>
                      }
                      extra={<Button danger type="text" onClick={() => remove(field.name)}>删除</Button>}
                    >
                      <Form.Item name={[field.name, "ruleId"]} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={[field.name, "enabled"]} valuePropName="checked" initialValue={true}>
                        <Switch checkedChildren="启用" unCheckedChildren="停用" />
                      </Form.Item>
                      <Form.Item
                        label="必检技能"
                        name={[field.name, "requiredSkills"]}
                        rules={[{ required: true, message: "至少选择一个技能" }]}
                      >
                        <Select mode="multiple" options={SKILL_OPTIONS} placeholder="选择回复前必须完成的技能" />
                      </Form.Item>
                      <Form.Item label="触发意图" name={[field.name, "intents"]}>
                        <Select mode="multiple" options={INTENT_OPTIONS} placeholder="命中这些意图时触发" />
                      </Form.Item>
                      <Form.Item label="触发关键词" name={[field.name, "keywords"]}>
                        <Select mode="tags" tokenSeparators={[",", "\n"]} placeholder="输入关键词，回车确认" />
                      </Form.Item>
                      <Form.Item label="缺失时动作" name={[field.name, "onMissing"]} initialValue="handoff">
                        <Select options={[{ value: "handoff", label: "转人工 (handoff)" }, { value: "defer", label: "延迟回复 (defer)" }]} />
                      </Form.Item>
                      <Form.Item label="系统原因码" name={[field.name, "reason"]}>
                        <Input placeholder="例如：policy_requires_knowledge_base_check" />
                      </Form.Item>
                      <Form.Item
                        label="并入首选技能"
                        name={[field.name, "augmentPreferredSkills"]}
                        valuePropName="checked"
                        initialValue={true}
                      >
                        <Switch checkedChildren="是" unCheckedChildren="否" />
                      </Form.Item>
                    </Card>
                  ))}
                  <Button
                    onClick={() => add({
                      ruleId: `rule_${Date.now()}`,
                      name: "",
                      enabled: true,
                      requiredSkills: [],
                      intents: [],
                      keywords: [],
                      onMissing: "handoff",
                      reason: null,
                      augmentPreferredSkills: true
                    })}
                  >
                    新增规则
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form>
        ) : null}

      </Space>
    </Card>
  );
}
