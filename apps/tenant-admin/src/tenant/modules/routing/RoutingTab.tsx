/**
 * 菜单路径与名称: 客户中心 -> 路由
 * 文件职责: 第一阶段智能调度配置入口，只保留轻量规则配置。
 */

import { ApartmentOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Space, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RoutingRule } from "../../types";
import { RuleTable } from "./components/RuleTable";
import { useRoutingData } from "./hooks/useRoutingData";
import { RuleEditorDrawer } from "./modals/RuleEditorDrawer";
import type { RuleFormValues } from "./types";

export function RoutingTab() {
  const { t } = useTranslation();
  const data = useRoutingData();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);

  const openRuleEditor = useCallback((ruleId: string) => {
    const target = data.rules.find((rule) => rule.rule_id === ruleId) ?? null;
    setEditingRule(target);
    setEditorOpen(true);
  }, [data.rules]);

  const handleRuleSubmit = async (values: RuleFormValues) => {
    const ok = await data.submitRule(values, editingRule);
    if (ok) {
      setEditorOpen(false);
      setEditingRule(null);
    }
  };

  const handleDeleteRule = (ruleId: string) => {
    void data.removeRule(ruleId).then(() => {
      if (editingRule?.rule_id === ruleId) {
        setEditingRule(null);
        setEditorOpen(false);
      }
    });
  };

  const activeCount = data.rules.filter((rule) => rule.is_active).length;

  return (
    <>
      {data.error && <Tag color="red" style={{ marginBottom: 12 }}>{data.error}</Tag>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <Tag color="blue" icon={<ApartmentOutlined />}>{t("routing.rulesCount", { count: data.rules.length })}</Tag>
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
        默认不配置复杂回退或技能规则，系统会按渠道实例、部门/团队、在线人工、AI 和实时负载做智能分配。这里只保留少量例外覆盖规则。
      </Typography.Text>

      <RuleTable
        rules={data.rules}
        channels={data.channels}
        departments={data.departments}
        teams={data.teams}
        loading={data.loading}
        onEdit={openRuleEditor}
        onDelete={handleDeleteRule}
      />

      <RuleEditorDrawer
        open={editorOpen}
        saving={data.saving}
        rule={editingRule}
        channels={data.channels}
        departments={data.departments}
        teams={data.teams}
        onClose={() => { setEditorOpen(false); setEditingRule(null); }}
        onSubmit={handleRuleSubmit}
      />
    </>
  );
}
