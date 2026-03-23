// 用于质检管理，包含质检记录列表、质检维度配置、质检统计分析等功能
// 菜单路径：客户中心 -> 质检管理
// 作者：吴川
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createQaReview,
  listAgents,
  listQaConversations,
  listQaReviews,
  listQaScoringRules,
  patchQaReview,
  updateQaScoringRules
} from "../../api";
import type { AgentProfile, QaConversationOption, QaReviewItem, QaScoringRuleItem } from "../../types";

type ReviewFilter = {
  agentId?: string;
  tag?: string;
  minScore?: number;
};

export function QaTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviews, setReviews] = useState<{ page: number; pageSize: number; total: number; items: QaReviewItem[] } | null>(null);
  const [rules, setRules] = useState<QaScoringRuleItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [conversations, setConversations] = useState<QaConversationOption[]>([]);
  const [filters, setFilters] = useState<ReviewFilter>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [createForm] = Form.useForm<{
    conversationId: string;
    caseId?: string;
    score: number;
    tags: string;
    note: string;
    status: "draft" | "published";
  }>();
  const [rulesForm] = Form.useForm<{ rules: Array<{ code: string; name: string; weight: number; isActive: boolean }> }>();

  const load = useCallback(async (nextFilters: ReviewFilter = filters) => {
    setLoading(true);
    try {
      const [qaReviews, qaRules, qaConversations, agentList] = await Promise.all([
        listQaReviews({ ...nextFilters, page: 1, pageSize: 20 }),
        listQaScoringRules(),
        listQaConversations({ limit: 50 }),
        listAgents()
      ]);
      setReviews(qaReviews);
      setRules(qaRules);
      setConversations(qaConversations);
      setAgents(agentList);
    } catch (err) {
      message.error(`加载质检数据失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const averageScore = useMemo(() => {
    const items = reviews?.items ?? [];
    if (items.length === 0) return 0;
    return Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  }, [reviews]);

  const openCreate = () => {
    const firstAvailable = conversations.find((item) => !item.reviewed);
    createForm.setFieldsValue({
      conversationId: firstAvailable?.conversationId,
      caseId: firstAvailable?.caseId,
      score: 80,
      tags: "",
      note: "",
      status: "published"
    });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await createQaReview({
        conversationId: values.conversationId,
        caseId: values.caseId,
        score: values.score,
        tags: values.tags
          ? values.tags
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
        note: values.note,
        status: values.status
      });
      message.success("质检记录已保存");
      setCreateOpen(false);
      await load(filters);
    } catch (err) {
      message.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const openRules = () => {
    rulesForm.setFieldsValue({
      rules: rules.map((r) => ({ code: r.code, name: r.name, weight: r.weight, isActive: r.isActive }))
    });
    setRulesOpen(true);
  };

  const submitRules = async () => {
    const values = await rulesForm.validateFields();
    setSaving(true);
    try {
      await updateQaScoringRules(
        values.rules.map((item, idx) => ({
          code: item.code.trim().toLowerCase(),
          name: item.name.trim(),
          weight: Number(item.weight),
          isActive: item.isActive,
          sortOrder: (idx + 1) * 10
        }))
      );
      message.success("质检维度已更新");
      setRulesOpen(false);
      await load(filters);
    } catch (err) {
      message.error(`更新失败: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: QaReviewItem) => {
    try {
      await patchQaReview(row.reviewId, { status: row.status === "draft" ? "published" : "draft" });
      await load(filters);
    } catch (err) {
      message.error(`状态更新失败: ${(err as Error).message}`);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="质检管理"
        extra={
          <Space>
            <Button onClick={() => void load(filters)}>刷新</Button>
            <Button onClick={openRules}>维度配置</Button>
            <Button type="primary" onClick={openCreate}>新建质检</Button>
          </Space>
        }
      >
        <Space wrap>
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="按坐席筛选"
            value={filters.agentId}
            options={agents.map((a) => ({ value: a.agentId, label: `${a.displayName} (${a.email})` }))}
            onChange={(value) => setFilters((prev) => ({ ...prev, agentId: value }))}
          />
          <Input
            style={{ width: 220 }}
            placeholder="按标签筛选（如：态度问题）"
            value={filters.tag}
            onChange={(e) => setFilters((prev) => ({ ...prev, tag: e.target.value || undefined }))}
          />
          <InputNumber
            style={{ width: 180 }}
            min={0}
            max={100}
            placeholder="最低分"
            value={filters.minScore}
            onChange={(value) => setFilters((prev) => ({ ...prev, minScore: typeof value === "number" ? value : undefined }))}
          />
          <Button type="primary" onClick={() => void load(filters)} loading={loading}>查询</Button>
        </Space>
      </Card>

      <Card>
        <Space size={28}>
          <div>
            <Typography.Text type="secondary">质检总数</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{reviews?.total ?? 0}</Typography.Title>
          </div>
          <div>
            <Typography.Text type="secondary">当前页平均分</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{averageScore}</Typography.Title>
          </div>
          <div>
            <Typography.Text type="secondary">质检维度</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{rules.length}</Typography.Title>
          </div>
        </Space>
      </Card>

      <Card title="质检记录列表">
        <Table<QaReviewItem>
          rowKey="reviewId"
          loading={loading}
          dataSource={reviews?.items ?? []}
          pagination={{
            current: reviews?.page ?? 1,
            pageSize: reviews?.pageSize ?? 20,
            total: reviews?.total ?? 0,
            onChange: (page, pageSize) => {
              void (async () => {
                setLoading(true);
                try {
                  const next = await listQaReviews({ ...filters, page, pageSize });
                  setReviews(next);
                } finally {
                  setLoading(false);
                }
              })();
            }
          }}
          columns={[
            { title: "质检时间", dataIndex: "createdAt", render: (v: string) => new Date(v).toLocaleString() },
            { title: "事项ID", dataIndex: "caseId", ellipsis: true, render: (v: string) => <code>{v.slice(0, 8)}</code> },
            { title: "会话ID", dataIndex: "conversationId", ellipsis: true },
            { title: "坐席", dataIndex: "agentName", render: (v: string | null) => v ?? "-" },
            { title: "质检员", dataIndex: "reviewerEmail", render: (v: string | null) => v ?? "-" },
            { title: "得分", dataIndex: "score" },
            {
              title: "标签",
              dataIndex: "tags",
              render: (value: string[]) => (
                <Space size={4} wrap>
                  {value.length ? value.map((tag) => <Tag key={tag}>{tag}</Tag>) : <Typography.Text type="secondary">-</Typography.Text>}
                </Space>
              )
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v: "draft" | "published") => <Tag color={v === "published" ? "green" : "default"}>{v.toUpperCase()}</Tag>
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button size="small" onClick={() => void toggleStatus(row)}>
                  {row.status === "draft" ? "发布" : "转草稿"}
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Modal
        title="新建质检记录"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
      >
        <Form layout="vertical" form={createForm}>
          <Form.Item name="conversationId" label="会话" rules={[{ required: true, message: "请选择会话" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={(value) => {
                const next = conversations.find((item) => item.conversationId === value);
                createForm.setFieldValue("caseId", next?.caseId);
              }}
              options={conversations.map((item) => ({
                value: item.conversationId,
                label: `${item.customerName ?? "未知客户"} · 事项 ${item.caseId.slice(0, 8)} · 会话 ${item.conversationId.slice(0, 8)}${item.reviewed ? "（已质检）" : ""}`
              }))}
            />
          </Form.Item>
          <Form.Item name="caseId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="score" label="总分(0-100)" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input placeholder="态度问题, 解决能力, AI 使用不当" />
          </Form.Item>
          <Form.Item name="note" label="点评">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ value: "published", label: "发布" }, { value: "draft", label: "草稿" }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="质检维度配置"
        open={rulesOpen}
        onCancel={() => setRulesOpen(false)}
        onOk={() => void submitRules()}
        okButtonProps={{ loading: saving }}
        destroyOnHidden
        width={760}
      >
        <Form form={rulesForm} layout="vertical">
          <Form.List name="rules">
            {(fields) => (
              <Space direction="vertical" style={{ width: "100%" }}>
                {fields.map((field) => (
                  <Card key={field.key} size="small">
                    <Space align="start" wrap>
                      <Form.Item {...field} name={[field.name, "code"]} label="编码" rules={[{ required: true }]}>
                        <Input style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "name"]} label="名称" rules={[{ required: true }]}>
                        <Input style={{ width: 180 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "weight"]} label="权重" rules={[{ required: true }]}>
                        <InputNumber min={0} max={100} style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, "isActive"]} label="启用">
                        <Select
                          style={{ width: 120 }}
                          options={[
                            { value: true, label: "启用" },
                            { value: false, label: "停用" }
                          ]}
                        />
                      </Form.Item>
                    </Space>
                  </Card>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Space>
  );
}
