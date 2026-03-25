// 用于客户管理，包含客户列表展示、客户标签管理、客户分组规则配置等功能
// 菜单路径：客户中心 -> 客户管理
// 作者：吴川
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applySegment,
  assignCustomerTags,
  createCustomerSegment,
  createCustomerTag,
  listCustomerSegments,
  listCustomers,
  listCustomerTags,
  patchCustomerSegment,
  patchCustomerTag
} from "../../api";
import type { CustomerListItem, CustomerSegmentItem, CustomerTagItem } from "../../types";

type Filters = {
  search?: string;
  tagId?: string;
  segmentId?: string;
};

export function CustomersTab() {
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [customers, setCustomers] = useState<{ page: number; pageSize: number; total: number; items: CustomerListItem[] } | null>(null);
  const [tags, setTags] = useState<CustomerTagItem[]>([]);
  const [segments, setSegments] = useState<CustomerSegmentItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [segmentModalOpen, setSegmentModalOpen] = useState(false);
  const [assignTagIds, setAssignTagIds] = useState<string[]>([]);
  const [tagForm] = Form.useForm<{ code: string; name: string; color?: string; description?: string }>();
  const [segmentForm] = Form.useForm<{
    code: string;
    name: string;
    description?: string;
    tagsAny?: string;
    minConversationCount?: number;
    minTaskCount?: number;
    minCaseCount?: number;
    minOpenCaseCount?: number;
    daysSinceLastConversationGte?: number;
    daysSinceLastCaseActivityGte?: number;
  }>();

  const load = useCallback(async (nextFilters: Filters = filters) => {
    setLoading(true);
    try {
      const [customerData, tagData, segmentData] = await Promise.all([
        listCustomers({ ...nextFilters, page: 1, pageSize: 30 }),
        listCustomerTags({ active: true }),
        listCustomerSegments({ active: true })
      ]);
      setCustomers(customerData);
      setTags(tagData);
      setSegments(segmentData);
    } catch (err) {
      message.error(`加载客户标签数据失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAssignModal = (customer: CustomerListItem) => {
    setSelectedCustomer(customer);
    setAssignTagIds(customer.tags.map((tag) => tag.tagId));
    setTagModalOpen(true);
  };

  const submitAssignTags = async () => {
    if (!selectedCustomer) return;
    try {
      await assignCustomerTags(selectedCustomer.customerId, { tagIds: assignTagIds, source: "manual" });
      message.success("客户标签已更新");
      setTagModalOpen(false);
      await load(filters);
    } catch (err) {
      message.error(`保存失败: ${(err as Error).message}`);
    }
  };

  const submitCreateTag = async () => {
    const values = await tagForm.validateFields();
    try {
      await createCustomerTag(values);
      message.success("标签已创建");
      tagForm.resetFields();
      await load(filters);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const submitCreateSegment = async () => {
    const values = await segmentForm.validateFields();
    const tagsAny = values.tagsAny
      ? values.tagsAny.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
      : [];
    const rule: Record<string, unknown> = {};
    if (tagsAny.length > 0) rule.tagsAny = tagsAny;
    if (values.minConversationCount) rule.minConversationCount = values.minConversationCount;
    if (values.minTaskCount) rule.minTaskCount = values.minTaskCount;
    if (values.minCaseCount) rule.minCaseCount = values.minCaseCount;
    if (values.minOpenCaseCount) rule.minOpenCaseCount = values.minOpenCaseCount;
    if (values.daysSinceLastConversationGte) rule.daysSinceLastConversationGte = values.daysSinceLastConversationGte;
    if (values.daysSinceLastCaseActivityGte) rule.daysSinceLastCaseActivityGte = values.daysSinceLastCaseActivityGte;
    try {
      await createCustomerSegment({
        code: values.code,
        name: values.name,
        description: values.description,
        rule,
        isActive: true
      });
      message.success("分组已创建");
      segmentForm.resetFields();
      setSegmentModalOpen(false);
      await load(filters);
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const customerColumns = useMemo(
    () => [
      { title: "客户", render: (_: unknown, row: CustomerListItem) => row.name ?? row.reference },
      { title: "渠道", dataIndex: "channel", render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
      { title: "等级", dataIndex: "tier", render: (v: string) => <Tag>{v.toUpperCase()}</Tag> },
      { title: "会话数", dataIndex: "conversationCount" },
      { title: "事项数", dataIndex: "caseCount" },
      { title: "进行中事项", dataIndex: "openCaseCount" },
      { title: "任务数", dataIndex: "taskCount" },
      { title: "最近联系", dataIndex: "lastContactAt", render: (v: string | null) => (v ? new Date(v).toLocaleString() : "-") },
      {
        title: "最近事项",
        render: (_: unknown, row: CustomerListItem) => {
          if (!row.lastCaseId) return "-";
          return (
            <Space direction="vertical" size={0}>
              <span>{row.lastCaseTitle ?? `事项 ${row.lastCaseId}`}</span>
              <span style={{ color: "rgba(0,0,0,0.45)", fontSize: 12 }}>
                {row.lastCaseAt ? new Date(row.lastCaseAt).toLocaleString() : row.lastCaseId}
              </span>
            </Space>
          );
        }
      },
      {
        title: "标签",
        render: (_: unknown, row: CustomerListItem) => (
          <Space wrap>
            {row.tags.slice(0, 4).map((tag) => (
              <Tag key={tag.tagId} color={tag.color}>{tag.name}</Tag>
            ))}
            {row.tags.length > 4 ? <Tag>+{row.tags.length - 4}</Tag> : null}
          </Space>
        )
      },
      {
        title: "操作",
        render: (_: unknown, row: CustomerListItem) => (
          <Button size="small" onClick={() => openAssignModal(row)}>标签管理</Button>
        )
      }
    ],
    []
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="客户查询"
        extra={
          <Space>
            <Button onClick={() => void load(filters)}>刷新</Button>
            <Button onClick={() => setSegmentModalOpen(true)}>新建分组</Button>
            <Button onClick={() => tagForm.resetFields()} type="primary">新建标签</Button>
          </Space>
        }
      >
        <Space wrap>
          <Input.Search
            style={{ width: 260 }}
            placeholder="搜索客户名/客户标识"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value || undefined }))}
            onSearch={() => { void load(filters); }}
          />
          <Select
            allowClear
            style={{ width: 200 }}
            placeholder="按标签筛选"
            value={filters.tagId}
            onChange={(value) => setFilters((prev) => ({ ...prev, tagId: value }))}
            options={tags.map((tag) => ({ value: tag.tagId, label: tag.name }))}
          />
          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="按分组筛选"
            value={filters.segmentId}
            onChange={(value) => setFilters((prev) => ({ ...prev, segmentId: value }))}
            options={segments.map((segment) => ({ value: segment.segmentId, label: segment.name }))}
          />
          <Button type="primary" onClick={() => { void load(filters); }} loading={loading}>查询</Button>
        </Space>
      </Card>

      <Card title="标签库">
        <Space wrap>
          {tags.map((tag) => (
            <Tag key={tag.tagId} color={tag.color}>
              {tag.name}
              <Button
                size="small"
                type="link"
                style={{ paddingInline: 4 }}
                onClick={() => {
                  void (async () => {
                    try {
                      await patchCustomerTag(tag.tagId, { isActive: !tag.isActive });
                      await load(filters);
                    } catch (err) {
                      message.error((err as Error).message);
                    }
                  })();
                }}
              >
                {tag.isActive ? "停用" : "启用"}
              </Button>
            </Tag>
          ))}
        </Space>
        <Form form={tagForm} layout="inline" style={{ marginTop: 12 }}>
          <Form.Item name="code" rules={[{ required: true, message: "编码必填" }]}>
            <Input placeholder="code" />
          </Form.Item>
          <Form.Item name="name" rules={[{ required: true, message: "名称必填" }]}>
            <Input placeholder="标签名" />
          </Form.Item>
          <Form.Item name="color">
            <Input placeholder="#1677ff" />
          </Form.Item>
          <Form.Item name="description">
            <Input placeholder="描述" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={() => { void submitCreateTag(); }}>添加标签</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="分组规则">
        <Table<CustomerSegmentItem>
          rowKey="segmentId"
          dataSource={segments}
          loading={loading}
          pagination={false}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "编码", dataIndex: "code" },
            {
              title: "规则",
              render: (_: unknown, row) => <code>{JSON.stringify(row.rule)}</code>
            },
            {
              title: "状态",
              dataIndex: "isActive",
              render: (v: boolean) => <Tag color={v ? "green" : "default"}>{v ? "ACTIVE" : "DISABLED"}</Tag>
            },
            {
              title: "操作",
              render: (_: unknown, row) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      void (async () => {
                        try {
                          const firstTag = tags.find((tag) => tag.code === String((row.rule.tagsAny as string[] | undefined)?.[0] ?? ""));
                          const result = await applySegment(row.segmentId, firstTag ? { applyTagId: firstTag.tagId } : {});
                          message.success(`命中 ${result.matchedCount} 个客户`);
                          await load(filters);
                        } catch (err) {
                          message.error((err as Error).message);
                        }
                      })();
                    }}
                  >
                    执行分组
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      void (async () => {
                        try {
                          await patchCustomerSegment(row.segmentId, { isActive: !row.isActive });
                          await load(filters);
                        } catch (err) {
                          message.error((err as Error).message);
                        }
                      })();
                    }}
                  >
                    {row.isActive ? "停用" : "启用"}
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card title="客户列表">
        <Table<CustomerListItem>
          rowKey="customerId"
          loading={loading}
          dataSource={customers?.items ?? []}
          columns={customerColumns}
          pagination={{
            current: customers?.page ?? 1,
            pageSize: customers?.pageSize ?? 30,
            total: customers?.total ?? 0
          }}
        />
      </Card>

      <Modal
        title={`客户标签管理 · ${selectedCustomer?.name ?? selectedCustomer?.reference ?? "-"}`}
        open={tagModalOpen}
        onCancel={() => setTagModalOpen(false)}
        onOk={() => { void submitAssignTags(); }}
        destroyOnHidden
      >
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={assignTagIds}
          onChange={(values) => setAssignTagIds(values)}
          options={tags.filter((tag) => tag.isActive).map((tag) => ({ value: tag.tagId, label: tag.name }))}
        />
      </Modal>

      <Modal
        title="新建客户分组"
        open={segmentModalOpen}
        onCancel={() => setSegmentModalOpen(false)}
        onOk={() => { void submitCreateSegment(); }}
        destroyOnHidden
      >
        <Form form={segmentForm} layout="vertical">
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input placeholder="vip_customers" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="VIP 客户" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input placeholder="用于运营触达" />
          </Form.Item>
          <Form.Item name="tagsAny" label="命中任一标签（code，逗号分隔）">
            <Input placeholder="vip,high_risk" />
          </Form.Item>
          <Form.Item name="minConversationCount" label="最少会话数">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="minTaskCount" label="最少任务数">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="minCaseCount" label="最少事项数">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="minOpenCaseCount" label="最少进行中事项数">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="daysSinceLastConversationGte" label="距上次联系天数 >= ">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="daysSinceLastCaseActivityGte" label="距上次事项活动天数 >= ">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
