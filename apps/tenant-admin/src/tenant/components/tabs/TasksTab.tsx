import { useEffect, useMemo, useState } from "react";
import { Button, Card, DatePicker, Form, Input, List, Select, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";

import { addAdminTaskComment, getAdminTaskDetail, listAdminTasks, listAgents, patchAdminTask } from "../../api";
import type { AdminTaskDetail, AdminTaskItem, AgentProfile } from "../../types";

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "open", label: "待处理" },
  { value: "in_progress", label: "进行中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" }
];

function statusColor(status: string) {
  switch (status) {
    case "done":
      return "green";
    case "in_progress":
      return "blue";
    case "cancelled":
      return "default";
    default:
      return "orange";
  }
}

export function TasksTab() {
  const [items, setItems] = useState<AdminTaskItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [filters, setFilters] = useState<{ status?: string; ownerAgentId?: string; search?: string }>({});

  const selectedTask = useMemo(
    () => items.find((item) => item.taskId === selectedId) ?? detail?.task ?? null,
    [detail?.task, items, selectedId]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [taskRows, agentRows] = await Promise.all([
        listAdminTasks(filters),
        listAgents()
      ]);
      setItems(taskRows.items);
      setAgents(agentRows);
      const nextSelected = selectedId && taskRows.items.some((item) => item.taskId === selectedId)
        ? selectedId
        : taskRows.items[0]?.taskId ?? null;
      setSelectedId(nextSelected);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filters.status, filters.ownerAgentId, filters.search]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getAdminTaskDetail(selectedId).then(setDetail);
  }, [selectedId]);

  const handlePatch = async (patch: { status?: string; assigneeAgentId?: string | null; dueAt?: string | null }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const next = await patchAdminTask(selectedId, patch);
      setDetail(next);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleComment = async () => {
    if (!selectedId || !comment.trim()) return;
    setSaving(true);
    try {
      const next = await addAdminTaskComment(selectedId, comment.trim());
      setDetail(next);
      setComment("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 16 }}>
      <Card title="任务列表">
        <Space style={{ marginBottom: 12, width: "100%" }} wrap>
          <Select
            value={filters.status ?? ""}
            style={{ width: 140 }}
            options={STATUS_OPTIONS}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value || undefined }))}
          />
          <Select
            value={filters.ownerAgentId ?? ""}
            style={{ width: 220 }}
            placeholder="负责人"
            options={[
              { value: "", label: "全部负责人" },
              ...agents.map((agent) => ({
                value: agent.agentId,
                label: `${agent.displayName}${agent.employeeNo ? ` #${agent.employeeNo}` : ""}`
              }))
            ]}
            onChange={(value) => setFilters((prev) => ({ ...prev, ownerAgentId: value || undefined }))}
          />
          <Input.Search
            allowClear
            placeholder="搜索任务/事项/客户"
            style={{ width: 260 }}
            onSearch={(value) => setFilters((prev) => ({ ...prev, search: value || undefined }))}
          />
        </Space>
        <Table
          rowKey="taskId"
          loading={loading}
          pagination={false}
          dataSource={items}
          rowSelection={undefined}
          onRow={(record) => ({
            onClick: () => setSelectedId(record.taskId)
          })}
          rowClassName={(record) => (record.taskId === selectedId ? "ant-table-row-selected" : "")}
          columns={[
            {
              title: "任务",
              dataIndex: "title",
              render: (_, row) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{row.title}</div>
                  <Typography.Text type="secondary">{row.caseTitle || row.caseId.slice(0, 8)}</Typography.Text>
                </div>
              )
            },
            {
              title: "负责人",
              render: (_, row) => row.ownerName ? `${row.ownerName}${row.ownerEmployeeNo ? ` #${row.ownerEmployeeNo}` : ""}` : "-"
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value) => <Tag color={statusColor(value)}>{value}</Tag>
            },
            {
              title: "截止时间",
              dataIndex: "dueAt",
              render: (value) => value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-"
            }
          ]}
        />
      </Card>

      <Card title="任务详情">
        {!detail && <Typography.Text type="secondary">选择左侧任务查看详情</Typography.Text>}
        {detail && selectedTask && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>{selectedTask.title}</Typography.Title>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                事项 {selectedTask.caseTitle || selectedTask.caseId.slice(0, 8)} · 客户 {selectedTask.customerName || selectedTask.customerRef || "-"}
              </Typography.Paragraph>
            </div>

            <Form layout="vertical">
              <Form.Item label="负责人">
                <Select
                  value={selectedTask.ownerAgentId ?? ""}
                  options={[
                    { value: "", label: "未分配" },
                    ...agents.map((agent) => ({
                      value: agent.agentId,
                      label: `${agent.displayName}${agent.employeeNo ? ` #${agent.employeeNo}` : ""}`
                    }))
                  ]}
                  onChange={(value) => void handlePatch({ assigneeAgentId: value || null })}
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  value={selectedTask.status}
                  options={STATUS_OPTIONS.filter((item) => item.value)}
                  onChange={(value) => void handlePatch({ status: value })}
                />
              </Form.Item>
              <Form.Item label="截止时间">
                <DatePicker
                  showTime
                  style={{ width: "100%" }}
                  value={selectedTask.dueAt ? dayjs(selectedTask.dueAt) : null}
                  onChange={(value) => void handlePatch({ dueAt: value ? value.toISOString() : null })}
                />
              </Form.Item>
            </Form>

            {selectedTask.description && (
              <div>
                <Typography.Text strong>描述</Typography.Text>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedTask.description}</div>
              </div>
            )}

            {selectedTask.sourceMessagePreview && (
              <div>
                <Typography.Text strong>关联消息</Typography.Text>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedTask.sourceMessagePreview}</div>
              </div>
            )}

            <div>
              <Typography.Text strong>回复 / 处理记录</Typography.Text>
              <List
                style={{ marginTop: 8, border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}
                dataSource={detail.comments}
                locale={{ emptyText: "暂无记录" }}
                renderItem={(item) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <List.Item.Meta
                      title={`${item.authorName || item.authorType}${item.authorEmployeeNo ? ` #${item.authorEmployeeNo}` : ""}`}
                      description={
                        <div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div>
                          <Typography.Text type="secondary">{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>

            <Input.TextArea
              rows={4}
              placeholder="添加处理回复/备注"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            <Space>
              <Button type="primary" loading={saving} onClick={() => void handleComment()}>
                回复任务
              </Button>
              {selectedTask.status !== "done" && (
                <Button loading={saving} onClick={() => void handlePatch({ status: "done" })}>
                  结束任务
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Card>
    </div>
  );
}
