import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import {
  Button, Card, Descriptions, Drawer, Form, Input, InputNumber,
  Popconfirm, Select, Space, Switch, Tag, Tooltip, Typography, message
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { addAgentSkill, patchAgent, removeAgentSkill } from "../../../api";
import type { AgentProfile, SkillGroup } from "../../../types";
import { ROLE_COLOR, STATUS_COLOR, roleLabel, seniorityOptions, statusLabel } from "../types";

export function AgentDrawer({
  agent,
  groups,
  onClose,
  onUpdated,
  onRemoved
}: {
  agent: AgentProfile | null;
  groups: SkillGroup[];
  onClose: () => void;
  onUpdated: () => void;
  onRemoved: (agentId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [infoForm] = Form.useForm<{
    displayName: string;
    status: string;
    seniorityLevel: string;
    maxConcurrency: number;
    allowAiAssist: boolean;
  }>();
  const [saving, setSaving] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillToAdd, setSkillToAdd] = useState<string>("");

  useEffect(() => {
    if (!agent) return;
    infoForm.setFieldsValue({
      displayName:    agent.displayName,
      status:         agent.status,
      seniorityLevel: agent.seniorityLevel,
      maxConcurrency: agent.maxConcurrency,
      allowAiAssist:  agent.allowAiAssist
    });
    setSkillToAdd("");
  }, [agent, infoForm]);

  const addableGroups = useMemo(() => {
    if (!agent) return [];
    const assigned = new Set(agent.skillGroups.map((sg) => sg.skill_group_id));
    return groups.filter((group) => !assigned.has(group.skill_group_id));
  }, [groups, agent]);

  const handleSaveInfo = async () => {
    if (!agent) return;
    const values = await infoForm.validateFields();
    setSaving(true);
    try {
      await patchAgent(agent.agentId, values);
      void message.success(t("agents.infoUpdated"));
      onUpdated();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = ["online", "busy", "away", "offline"].map((s) => ({
    value: s,
    label: statusLabel(s)
  }));

  return (
    <Drawer
      title={agent ? (
        <Space>
          <UserOutlined />
          {agent.displayName}
          <Tag color={STATUS_COLOR[agent.status] ?? "default"}>{statusLabel(agent.status)}</Tag>
        </Space>
      ) : t("agents.drawerTitle")}
      placement="right"
      width={560}
      open={!!agent}
      onClose={onClose}
      destroyOnHidden
      extra={agent ? (
        <Popconfirm
          title={t("agents.confirmRemove")}
          description={t("agents.removeDesc")}
          okText={t("common.remove")}
          cancelText={t("common.cancel")}
          onConfirm={() => { void onRemoved(agent.agentId); }}
        >
          <Button danger size="small">{t("agents.removeAgentBtn")}</Button>
        </Popconfirm>
      ) : null}
    >
      {agent && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small" title={t("agents.basicInfo")}>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label={t("agents.email")}>{agent.email}</Descriptions.Item>
              <Descriptions.Item label={t("agents.employeeNo")}>{agent.employeeNo ?? "-"}</Descriptions.Item>
              <Descriptions.Item label={t("agents.role")}><Tag color={ROLE_COLOR[agent.role] ?? "default"}>{roleLabel(agent.role)}</Tag></Descriptions.Item>
            </Descriptions>
            <Form form={infoForm} layout="vertical" size="small">
              <Form.Item label={t("agents.displayName")} name="displayName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label={t("agents.statusField")} name="status">
                <Select options={statusOptions} />
              </Form.Item>
              <Form.Item label={t("agents.seniorityLevel")} name="seniorityLevel">
                <Select options={seniorityOptions()} />
              </Form.Item>
              <Form.Item label={t("agents.maxConcurrency")} name="maxConcurrency">
                <InputNumber min={1} max={20} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label={t("agents.aiAssist")} name="allowAiAssist" valuePropName="checked">
                <Switch checkedChildren={t("common.on")} unCheckedChildren={t("common.off")} />
              </Form.Item>
              <Button type="primary" size="small" loading={saving} onClick={() => { void handleSaveInfo(); }}>
                {t("common.save")}
              </Button>
            </Form>
          </Card>

          <Card size="small" title={t("agents.skillGroupsTitle")}>
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              {agent.skillGroups.length > 0 ? (
                <Space wrap>
                  {agent.skillGroups.map((skill) => (
                    <Tooltip key={skill.skill_group_id} title={t("agents.removeSkill", { name: skill.name })}>
                      <Popconfirm
                        title={t("agents.confirmRemoveSkill", { name: skill.name })}
                        onConfirm={() => { void removeAgentSkill(agent.agentId, skill.skill_group_id).then(onUpdated); }}
                        okText={t("common.remove")}
                        cancelText={t("common.cancel")}
                      >
                        <Tag closable color="geekblue" style={{ cursor: "pointer" }} onClose={(e) => e.preventDefault()}>
                          {skill.code} - {skill.name}
                        </Tag>
                      </Popconfirm>
                    </Tooltip>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">{t("agents.noSkillGroups")}</Typography.Text>
              )}
              {addableGroups.length > 0 && (
                <Space style={{ marginTop: 8 }}>
                  <Select
                    style={{ width: 240 }}
                    placeholder={t("agents.addSkillPlaceholder")}
                    value={skillToAdd || undefined}
                    onChange={(value) => setSkillToAdd(value as string)}
                    options={addableGroups.map((group) => ({ value: group.skill_group_id, label: `${group.code} - ${group.name}` }))}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!skillToAdd}
                    loading={addingSkill}
                    onClick={() => {
                      void (async () => {
                        if (!skillToAdd) return;
                        setAddingSkill(true);
                        try {
                          await addAgentSkill(agent.agentId, skillToAdd);
                          setSkillToAdd("");
                          onUpdated();
                        } catch (err) {
                          void message.error((err as Error).message);
                        } finally {
                          setAddingSkill(false);
                        }
                      })();
                    }}
                  >
                    {t("common.add")}
                  </Button>
                </Space>
              )}
            </Space>
          </Card>
        </Space>
      )}
    </Drawer>
  );
}
