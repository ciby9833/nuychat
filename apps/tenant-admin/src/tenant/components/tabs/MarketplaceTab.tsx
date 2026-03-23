// 用于市场技能管理，包含市场技能目录展示、技能安装/卸载、已安装技能治理配置等功能
// 菜单路径：客户中心 -> 市场技能
// 作者：吴川
import { Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tag } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  installTenantMarketplaceSkill,
  listTenantMarketplaceCatalog,
  listTenantMarketplaceInstalls,
  patchTenantMarketplaceInstallGovernance,
  uninstallTenantMarketplaceInstall
} from "../../api";
import type { MarketplaceInstall, SkillGroup } from "../../types";

type GovernanceDraft = {
  status: "active" | "disabled";
  enabledModulesText: string;
  enabledSkillGroupsText: string;
  enabledForAi: boolean;
  enabledForAgent: boolean;
  aiWhitelisted: boolean;
  rateLimitPerMinute: number;
};

export function MarketplaceTab() {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof listTenantMarketplaceCatalog>>["skills"]>([]);
  const [installs, setInstalls] = useState<MarketplaceInstall[]>([]);
  const [skillGroups, setSkillGroups] = useState<SkillGroup[]>([]);
  const [drafts, setDrafts] = useState<Record<string, GovernanceDraft>>({});
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"all" | "official" | "private" | "third_party">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedInstall, setSelectedInstall] = useState<MarketplaceInstall | null>(null);
  const [govForm] = Form.useForm<GovernanceDraft>();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [catalogRes, installRes, groups] = await Promise.all([
        listTenantMarketplaceCatalog({ search, tier: tier === "all" ? undefined : tier, status: "published" }),
        listTenantMarketplaceInstalls(),
        api<SkillGroup[]>("/api/admin/skill-groups")
      ]);
      setCatalog(catalogRes.skills);
      setInstalls(installRes.installs);
      setSkillGroups(groups);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, tier]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next: Record<string, GovernanceDraft> = {};
    for (const install of installs) {
      next[install.installId] = {
        status: install.status,
        enabledModulesText: install.enabledModules.join(","),
        enabledSkillGroupsText: install.enabledSkillGroups.join(","),
        enabledForAi: install.enabledForAi,
        enabledForAgent: install.enabledForAgent,
        aiWhitelisted: install.aiWhitelisted,
        rateLimitPerMinute: install.rateLimitPerMinute
      };
    }
    setDrafts(next);
  }, [installs]);

  const installBySkillId = useMemo(() => new Map(installs.map((item) => [item.skillId, item])), [installs]);

  const onInstall = async (skillId: string, releaseId?: string) => {
    try {
      await installTenantMarketplaceSkill(skillId, releaseId);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openGovernance = (install: MarketplaceInstall) => {
    const draft = drafts[install.installId];
    if (!draft) return;
    setSelectedInstall(install);
    govForm.setFieldsValue(draft);
  };

  const onSaveGovernance = async () => {
    if (!selectedInstall) return;
    const values = await govForm.validateFields();
    try {
      await patchTenantMarketplaceInstallGovernance(selectedInstall.installId, {
        status: values.status,
        enabledModules: parseCsv(values.enabledModulesText),
        enabledSkillGroups: parseCsv(values.enabledSkillGroupsText),
        enabledForAi: values.enabledForAi,
        enabledForAgent: values.enabledForAgent,
        aiWhitelisted: values.aiWhitelisted,
        rateLimitPerMinute: values.rateLimitPerMinute
      });
      setSelectedInstall(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUninstall = async (installId: string) => {
    try {
      await uninstallTenantMarketplaceInstall(installId);
      if (selectedInstall?.installId === installId) setSelectedInstall(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card title="查询模块" extra={error ? <Tag color="red">{error}</Tag> : null}>
        <Space wrap>
          <Input.Search placeholder="按名称/slug 搜索技能" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 320 }} />
          <Select
            value={tier}
            style={{ width: 180 }}
            options={[
              { value: "all", label: "全部 Tier" },
              { value: "official", label: "official" },
              { value: "private", label: "private" },
              { value: "third_party", label: "third_party" }
            ]}
            onChange={setTier}
          />
          <Button onClick={() => { void load(); }} loading={loading}>刷新</Button>
        </Space>
      </Card>

      <Card title="列表模块 - 市场目录" extra={<Tag color="blue">{catalog.length} 条</Tag>}>
        <Table
          rowKey="skillId"
          dataSource={catalog}
          loading={loading}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: "Name", dataIndex: "name" },
            { title: "Slug", dataIndex: "slug" },
            { title: "Tier", dataIndex: "tier", render: (v) => <Tag>{String(v)}</Tag> },
            { title: "Version", dataIndex: "latestVersion" },
            {
              title: "Install Status",
              render: (_, record) => {
                const installed = installBySkillId.get(record.skillId);
                return installed ? <Tag color={installed.status === "active" ? "green" : "default"}>{installed.status}</Tag> : <Tag>not installed</Tag>;
              }
            },
            {
              title: "操作",
              render: (_, record) => {
                const installed = installBySkillId.get(record.skillId);
                return (
                  <Button
                    size="small"
                    type={installed ? "default" : "primary"}
                    disabled={Boolean(installed)}
                    onClick={() => { void onInstall(record.skillId, record.latestRelease?.releaseId); }}
                  >
                    {installed ? "Installed" : "Install"}
                  </Button>
                );
              }
            }
          ]}
        />
      </Card>

      <Card title="列表模块 - 已安装技能" extra={<Tag color="blue">{installs.length} 条</Tag>}>
        <Table<MarketplaceInstall>
          rowKey="installId"
          dataSource={installs}
          loading={loading}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: "Skill", dataIndex: "skillName" },
            { title: "Slug", dataIndex: "skillSlug" },
            { title: "Tier", dataIndex: "skillTier", render: (v) => <Tag>{String(v)}</Tag> },
            { title: "Version", dataIndex: "releaseVersion" },
            { title: "Status", dataIndex: "status", render: (v) => <Tag color={v === "active" ? "green" : "default"}>{v}</Tag> },
            {
              title: "操作",
              render: (_, record) => (
                <Space>
                  <Button size="small" onClick={() => openGovernance(record)}>治理配置</Button>
                  <Button danger size="small" onClick={() => { void onUninstall(record.installId); }}>卸载</Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Drawer
        title={selectedInstall ? `治理配置: ${selectedInstall.skillName}` : "治理配置"}
        placement="right"
        width={540}
        open={!!selectedInstall}
        onClose={() => setSelectedInstall(null)}
      >
        <Form form={govForm} layout="vertical">
          <Form.Item label="Install Status" name="status" rules={[{ required: true }]}>
            <Select options={[{ value: "active", label: "active" }, { value: "disabled", label: "disabled" }]} />
          </Form.Item>
          <Form.Item label="Rate Limit / min" name="rateLimitPerMinute" rules={[{ required: true }]}>
            <InputNumber min={1} max={10000} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Enabled Modules (CSV)" name="enabledModulesText">
            <Input />
          </Form.Item>
          <Form.Item label="Enabled Skill Groups (CSV UUID)" name="enabledSkillGroupsText">
            <Input placeholder={skillGroups.slice(0, 2).map((group) => group.skill_group_id).join(",")} />
          </Form.Item>
          <Form.Item label="AI Enabled" name="enabledForAi" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="Agent Enabled" name="enabledForAgent" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item label="AI Whitelisted" name="aiWhitelisted" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" onClick={() => { void onSaveGovernance(); }}>保存治理配置</Button>
        </Form>
      </Drawer>
    </Space>
  );
}

function parseCsv(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}
