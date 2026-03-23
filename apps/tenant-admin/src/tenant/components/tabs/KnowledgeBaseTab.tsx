// 用于知识库管理，包含知识库条目的增删改查，以及分类和标签管理功能
// 菜单路径：客户中心 -> 知识库管理
// 作者：吴川
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Tag } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../api";
import type { KBEntry } from "../../types";

type KBFormData = { category: string; title: string; content: string; tags: string[] };

export function KnowledgeBaseTab() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<KBFormData>();

  const categories = ["policy", "shipping", "payment", "order", "faq", "product", "general"];

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (catFilter) params.set("category", catFilter);
      const result = await api<{ entries: KBEntry[]; total: number }>(`/api/admin/knowledge-base?${params}`);
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [search, catFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ category: "general", title: "", content: "", tags: [] });
    setCreateOpen(true);
  };

  const openEdit = (entry: KBEntry) => {
    setEditing(entry);
    form.setFieldsValue({ category: entry.category, title: entry.title, content: entry.content, tags: entry.tags });
    setCreateOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    if (editing) {
      await api(`/api/admin/knowledge-base/${editing.entry_id}`, { method: "PATCH", body: JSON.stringify(values) });
    } else {
      await api("/api/admin/knowledge-base", { method: "POST", body: JSON.stringify(values) });
    }
    setCreateOpen(false);
    setEditing(null);
    await load();
  };

  const deactivate = async (id: string) => {
    await api(`/api/admin/knowledge-base/${id}`, { method: "DELETE" });
    await load();
  };

  const filteredEntries = useMemo(() => entries, [entries]);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={<Tag color="blue">总计 {total}</Tag>}>
        <Space wrap>
          <Input.Search value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索文章" style={{ width: 300 }} />
          <Select
            value={catFilter || "all"}
            style={{ width: 180 }}
            options={[{ value: "all", label: "全部分类" }, ...categories.map((c) => ({ value: c, label: c }))]}
            onChange={(value) => setCatFilter(value === "all" ? "" : value)}
          />
          <Button type="primary" onClick={openCreate}>新增文章</Button>
          <Button onClick={() => { void load(); }}>刷新</Button>
          {error ? <Tag color="red">{error}</Tag> : null}
        </Space>
      </Card>

      <Card title="列表模块" extra={<Tag>{filteredEntries.length} 条</Tag>}>
        <Table<KBEntry>
          rowKey="entry_id"
          dataSource={filteredEntries}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Category", dataIndex: "category", render: (v) => <Tag>{String(v)}</Tag> },
            { title: "Title", dataIndex: "title" },
            { title: "Content", dataIndex: "content", render: (v) => String(v).slice(0, 80) },
            { title: "Hits", dataIndex: "hit_count" },
            { title: "Status", dataIndex: "is_active", render: (v) => <Tag color={v ? "green" : "default"}>{v ? "active" : "inactive"}</Tag> },
            {
              title: "操作",
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => openEdit(record)}>编辑</Button>
                  {record.is_active ? <Button size="small" danger onClick={() => { void deactivate(record.entry_id); }}>停用</Button> : null}
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        title={editing ? "编辑文章" : "新增文章"}
        placement="right"
        width={520}
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
      >
        <Form form={form} layout="vertical" initialValues={{ category: "general", title: "", content: "", tags: [] }}>
          <Form.Item label="Category" name="category" rules={[{ required: true }]}>
            <Select options={categories.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item label="Title" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Content" name="content" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item label="Tags (逗号分隔)">
            <Input
              value={(form.getFieldValue("tags") ?? []).join(",")}
              onChange={(e) => form.setFieldValue("tags", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))}
            />
          </Form.Item>
          <Button type="primary" onClick={() => { void save(); }}>保存</Button>
        </Form>
      </Drawer>
    </Space>
  );
}
