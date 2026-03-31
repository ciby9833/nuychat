/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 路由模块主入口，负责规则、模块、技能组三个页签与编辑器弹窗状态编排。
 * 主要交互文件:
 * - ./hooks/useRoutingData.ts
 * - ./components/RuleTable.tsx
 * - ./components/ModuleTable.tsx
 * - ./components/SkillGroupTable.tsx
 * - ./modals/RuleEditorDrawer.tsx
 * - ./modals/ModuleEditorModal.tsx
 * - ./modals/SkillGroupEditorModal.tsx
 */

import { ApartmentOutlined, AppstoreOutlined, PlusOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Space, Tabs, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ModuleItem, RoutingRule, SkillGroup } from "../../types";
import { ModuleTable } from "./components/ModuleTable";
import { RuleTable } from "./components/RuleTable";
import { SkillGroupTable } from "./components/SkillGroupTable";
import { useRoutingData } from "./hooks/useRoutingData";
import { ModuleEditorModal } from "./modals/ModuleEditorModal";
import { RuleEditorDrawer } from "./modals/RuleEditorDrawer";
import { SkillGroupEditorModal } from "./modals/SkillGroupEditorModal";
import type { ModuleFormValues, RuleFormValues, SkillGroupFormValues } from "./types";

export function RoutingTab() {
  const { t } = useTranslation();
  const data = useRoutingData();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [moduleEditorOpen, setModuleEditorOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleItem | null>(null);
  const [skillGroupEditorOpen, setSkillGroupEditorOpen] = useState(false);
  const [editingSkillGroup, setEditingSkillGroup] = useState<SkillGroup | null>(null);

  const openRuleEditor = useCallback((ruleId: string) => {
    const target = data.rules.find((r) => r.rule_id === ruleId) ?? null;
    setEditingRule(target);
    setEditorOpen(true);
  }, [data.rules]);

  const handleRuleSubmit = async (values: RuleFormValues) => {
    const ok = await data.submitRule(values, editingRule);
    if (ok) { setEditorOpen(false); setEditingRule(null); }
  };

  const handleDeleteRule = (ruleId: string) => {
    void data.removeRule(ruleId).then(() => {
      if (editingRule?.rule_id === ruleId) { setEditingRule(null); setEditorOpen(false); }
    });
  };

  const handleModuleSubmit = async (values: ModuleFormValues) => {
    const ok = await data.submitModule(values, editingModule);
    if (ok) { setModuleEditorOpen(false); setEditingModule(null); }
  };

  const handleSkillGroupSubmit = async (values: SkillGroupFormValues) => {
    const ok = await data.submitSkillGroup(values, editingSkillGroup);
    if (ok) { setSkillGroupEditorOpen(false); setEditingSkillGroup(null); }
  };

  const activeCount = data.rules.filter((r) => r.is_active).length;

  const tabItems = [
    {
      key: "rules",
      label: <span><ApartmentOutlined /> {t("routing.rulesTab")} <Tag style={{ marginLeft: 4 }}>{data.rules.length}</Tag></span>,
      children: (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Space>
              <Tag color="blue">{t("routing.rulesCount", { count: data.rules.length })}</Tag>
              <Tag color="green">{t("routing.enabledCount", { count: activeCount })}</Tag>
            </Space>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingRule(null); setEditorOpen(true); }}>
                {t("routing.addRule")}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { void data.load(); }} loading={data.loading}>
                {t("common.refresh")}
              </Button>
            </Space>
          </div>
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
            {t("routing.hint")}
          </Typography.Text>
          <RuleTable
            rules={data.rules}
            departments={data.departments}
            teams={data.teams}
            aiAgents={data.aiAgents}
            loading={data.loading}
            onEdit={openRuleEditor}
            onDelete={handleDeleteRule}
          />
        </div>
      )
    },
    {
      key: "modules",
      label: <span><AppstoreOutlined /> {t("routing.modulesTab")} <Tag style={{ marginLeft: 4 }}>{data.modules.length}</Tag></span>,
      children: (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Tag color="blue">{t("routing.modulesCount", { count: data.modules.length })}</Tag>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingModule(null); setModuleEditorOpen(true); }}>
                {t("routing.addModule")}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { void data.load(); }} loading={data.loading}>
                {t("common.refresh")}
              </Button>
            </Space>
          </div>
          <ModuleTable
            modules={data.modules}
            loading={data.loading}
            onEdit={(item) => { setEditingModule(item); setModuleEditorOpen(true); }}
            onDelete={(id) => { void data.removeModule(id); }}
          />
        </div>
      )
    },
    {
      key: "skillGroups",
      label: <span><TeamOutlined /> {t("routing.skillGroupsTab")} <Tag style={{ marginLeft: 4 }}>{data.groups.length}</Tag></span>,
      children: (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Tag color="blue">{t("routing.skillGroupsCount", { count: data.groups.length })}</Tag>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={data.modules.length === 0}
                onClick={() => { setEditingSkillGroup(null); setSkillGroupEditorOpen(true); }}
              >
                {t("routing.addSkillGroup")}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { void data.load(); }} loading={data.loading}>
                {t("common.refresh")}
              </Button>
            </Space>
          </div>
          <SkillGroupTable
            groups={data.groups}
            modules={data.modules}
            loading={data.loading}
            onEdit={(item) => { setEditingSkillGroup(item); setSkillGroupEditorOpen(true); }}
            onDelete={(id) => { void data.removeSkillGroup(id); }}
          />
        </div>
      )
    }
  ];

  return (
    <>
      {data.error && <Tag color="red" style={{ marginBottom: 12 }}>{data.error}</Tag>}
      <Tabs defaultActiveKey="rules" items={tabItems} />

      <RuleEditorDrawer
        open={editorOpen}
        saving={data.saving}
        rule={editingRule}
        departments={data.departments}
        teams={data.teams}
        aiAgents={data.aiAgents}
        groups={data.groups}
        onClose={() => { setEditorOpen(false); setEditingRule(null); }}
        onSubmit={handleRuleSubmit}
      />
      <ModuleEditorModal
        open={moduleEditorOpen}
        saving={data.saving}
        item={editingModule}
        onClose={() => { setModuleEditorOpen(false); setEditingModule(null); }}
        onSubmit={handleModuleSubmit}
      />
      <SkillGroupEditorModal
        open={skillGroupEditorOpen}
        saving={data.saving}
        item={editingSkillGroup}
        modules={data.modules}
        onClose={() => { setSkillGroupEditorOpen(false); setEditingSkillGroup(null); }}
        onSubmit={handleSkillGroupSubmit}
      />
    </>
  );
}
