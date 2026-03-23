import { Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import { useMemo, useState } from "react";

import type { MarketplaceInstallItem, MarketplaceSkillItem, MarketplaceTier } from "../types";

type ConfirmState =
  | { kind: "delete_skill"; skillId: string; label: string }
  | null;

export function MarketplacePanel({
  skills,
  installs,
  tenants,
  onCreate,
  onUpdate,
  onPublish,
  onDisable,
  onRetract,
  onDelete
}: {
  skills: MarketplaceSkillItem[];
  installs: MarketplaceInstallItem[];
  tenants: Array<{ tenantId: string; slug: string; name: string }>;
  onCreate: (input: {
    slug: string;
    name: string;
    description: string;
    tier: MarketplaceTier;
    ownerTenantId?: string;
    version: string;
    changelog: string;
    manifest: Record<string, unknown>;
  }) => Promise<void>;
  onUpdate: (skillId: string, input: { name?: string; description?: string; status?: "draft" | "published" | "deprecated" }) => Promise<void>;
  onPublish: (skillId: string, input: { version: string; changelog: string }) => Promise<void>;
  onDisable: (skillId: string) => Promise<void>;
  onRetract: (skillId: string) => Promise<void>;
  onDelete: (skillId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | MarketplaceTier>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "deprecated">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{
    slug: string;
    name: string;
    description: string;
    toolName: string;
    tier: MarketplaceTier;
    ownerTenantId: string;
    version: string;
    changelog: string;
  }>();
  const [editForm] = Form.useForm<{ name: string; description: string }>();
  const [editingSkill, setEditingSkill] = useState<MarketplaceSkillItem | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const filteredSkills = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return skills.filter((s) => {
      const matchKeyword = !keyword || [s.name, s.slug, s.description].join(" ").toLowerCase().includes(keyword);
      const matchTier = tierFilter === "all" || s.tier === tierFilter;
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchKeyword && matchTier && matchStatus;
    });
  }, [skills, search, tierFilter, statusFilter]);

  const createSkill = async () => {
    const values = await createForm.validateFields();
    await onCreate({
      slug: values.slug.toLowerCase(),
      name: values.name,
      description: values.description,
      tier: values.tier,
      ownerTenantId: values.ownerTenantId || undefined,
      version: values.version,
      changelog: values.changelog,
      manifest: { createdBy: "platform-admin-ui", tier: values.tier, toolName: values.toolName.trim() }
    });
    setCreateOpen(false);
    createForm.resetFields();
  };

  const submitEdit = async () => {
    if (!editingSkill) return;
    const values = await editForm.validateFields();
    await onUpdate(editingSkill.skillId, {
      name: values.name.trim() || undefined,
      description: values.description.trim() || undefined
    });
    setEditingSkill(null);
  };

  const submitConfirm = async () => {
    if (!confirmState) return;
    if (confirmState.kind === "delete_skill") await onDelete(confirmState.skillId);
    setConfirmState(null);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={<Tag color="blue">技能 {filteredSkills.length} 条</Tag>}>
        <Space wrap>
          <Input.Search placeholder="搜索技能 name/slug" allowClear style={{ width: 320 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            value={tierFilter}
            style={{ width: 180 }}
            options={[{ value: "all", label: "全部 Tier" }, { value: "official", label: "official" }, { value: "private", label: "private" }, { value: "third_party", label: "third_party" }]}
            onChange={setTierFilter}
          />
          <Select
            value={statusFilter}
            style={{ width: 180 }}
            options={[{ value: "all", label: "全部状态" }, { value: "draft", label: "draft" }, { value: "published", label: "published" }, { value: "deprecated", label: "deprecated" }]}
            onChange={setStatusFilter}
          />
          <Button type="primary" onClick={() => {
            createForm.setFieldsValue({ tier: "official", version: "1.0.0", changelog: "Initial release" });
            setCreateOpen(true);
          }}>
            新增技能
          </Button>
        </Space>
      </Card>

      <Card title="列表模块 - 技能列表">
        <Table<MarketplaceSkillItem>
          rowKey="skillId"
          dataSource={filteredSkills}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "Slug", dataIndex: "slug" },
            { title: "Tier", dataIndex: "tier" },
            { title: "Version", dataIndex: "latestVersion" },
            { title: "Status", dataIndex: "status", render: (v) => <Tag color={v === "published" ? "green" : v === "deprecated" ? "red" : "default"}>{v}</Tag> },
            {
              title: "操作",
              render: (_, record) => (
                <Space wrap>
                  <Button size="small" disabled={record.status === "published"} onClick={() => { void onPublish(record.skillId, { version: bumpPatch(record.latestVersion), changelog: "Publish update" }); }}>Publish</Button>
                  <Button size="small" disabled={record.status === "deprecated"} onClick={() => { void onDisable(record.skillId); }}>Disable</Button>
                  <Button size="small" disabled={record.status !== "published"} onClick={() => { void onRetract(record.skillId); }}>Retract</Button>
                  <Button size="small" onClick={() => {
                    setEditingSkill(record);
                    editForm.setFieldsValue({ name: record.name, description: record.description });
                  }}>Edit</Button>
                  <Button size="small" danger onClick={() => setConfirmState({ kind: "delete_skill", skillId: record.skillId, label: record.slug })}>Delete</Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card title="列表模块 - 安装列表" extra={<Tag>{installs.length} 条</Tag>}>
        <Table<MarketplaceInstallItem>
          rowKey="installId"
          dataSource={installs}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "Skill", dataIndex: "skillName" },
            { title: "Slug", dataIndex: "skillSlug" },
            { title: "Tenant", dataIndex: "tenantSlug" },
            { title: "Version", dataIndex: "version" },
            { title: "Status", dataIndex: "status", render: (v) => <Tag color={v === "active" ? "green" : "default"}>{v}</Tag> },
            { title: "观察", render: () => <Tag color="blue">公司侧管理</Tag> }
          ]}
        />
      </Card>

      <Drawer title="新增技能" placement="right" width={480} onClose={() => setCreateOpen(false)} open={createOpen}>
        <Form form={createForm} layout="vertical" initialValues={{ tier: "official", version: "1.0.0", changelog: "Initial release" }}>
          <Form.Item label="Slug" name="slug" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Tool Name" name="toolName" rules={[{ required: true }]}><Input placeholder="lookup_order" /></Form.Item>
          <Form.Item label="Tier" name="tier" rules={[{ required: true }]}><Select options={[{ value: "official", label: "official" }, { value: "private", label: "private" }, { value: "third_party", label: "third_party" }]} /></Form.Item>
          <Form.Item label="Owner Tenant" name="ownerTenantId"><Select allowClear options={tenants.map((t) => ({ value: t.tenantId, label: `${t.name} (${t.slug})` }))} /></Form.Item>
          <Form.Item label="Version" name="version" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Changelog" name="changelog" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Description" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Button type="primary" onClick={() => { void createSkill(); }}>Create Skill</Button>
        </Form>
      </Drawer>

      <Modal title="编辑技能" open={!!editingSkill} onCancel={() => setEditingSkill(null)} onOk={() => { void submitEdit(); }}>
        <Form form={editForm} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="Description" name="description"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="确认操作" open={!!confirmState} onCancel={() => setConfirmState(null)} onOk={() => { void submitConfirm(); }} okButtonProps={{ danger: true }}>
        {confirmState?.kind === "delete_skill" ? `确定删除技能 ${confirmState.label} 吗？` : ""}
      </Modal>
    </Space>
  );
}

function bumpPatch(version: string) {
  const parts = version.split(".").map((p) => Number(p));
  const major = Number.isFinite(parts[0]) ? parts[0] : 1;
  const minor = Number.isFinite(parts[1]) ? parts[1] : 0;
  const patch = Number.isFinite(parts[2]) ? parts[2] : 0;
  return `${major}.${minor}.${patch + 1}`;
}
