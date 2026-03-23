// 作用: 坐席详情侧边抽屉（编辑坐席信息、管理技能组）
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 坐席管理 -> 点击坐席行
// 作者：吴川

import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import { useEffect, useMemo, useState } from "react";

import { addAgentSkill, patchAgent, removeAgentSkill } from "../../../api";
import type { AgentProfile, SkillGroup } from "../../../types";
import { ROLE_COLOR, SENIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from "../types";

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
      displayName: agent.displayName,
      status: agent.status,
      seniorityLevel: agent.seniorityLevel,
      maxConcurrency: agent.maxConcurrency,
      allowAiAssist: agent.allowAiAssist
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
      message.success("坐席信息已更新");
      onUpdated();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title={agent ? (
        <Space>
          <UserOutlined />
          {agent.displayName}
          <Tag color={STATUS_COLOR[agent.status] ?? "default"}>{STATUS_LABEL[agent.status] ?? agent.status}</Tag>
        </Space>
      ) : "坐席详情"}
      placement="right"
      width={560}
      open={!!agent}
      onClose={onClose}
      destroyOnHidden
      extra={agent ? (
        <Popconfirm
          title="确认移除该座席档案？"
          description="成员账号会保留，仅移除座席能力。"
          okText="移除"
          cancelText="取消"
          onConfirm={() => { void onRemoved(agent.agentId); }}
        >
          <Button danger size="small">移除座席</Button>
        </Popconfirm>
      ) : null}
    >
      {agent && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Card size="small" title="基本信息">
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="邮箱">{agent.email}</Descriptions.Item>
              <Descriptions.Item label="工号">{agent.employeeNo ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="角色"><Tag color={ROLE_COLOR[agent.role] ?? "default"}>{agent.role}</Tag></Descriptions.Item>
            </Descriptions>
            <Form form={infoForm} layout="vertical" size="small">
              <Form.Item label="显示名称" name="displayName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="状态" name="status">
                <Select options={["online", "busy", "away", "offline"].map((status) => ({ value: status, label: STATUS_LABEL[status] ?? status }))} />
              </Form.Item>
              <Form.Item label="资历级别" name="seniorityLevel">
                <Select options={Object.entries(SENIORITY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
              <Form.Item label="最大并发数" name="maxConcurrency">
                <InputNumber min={1} max={20} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item label="AI 辅助" name="allowAiAssist" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Button type="primary" size="small" loading={saving} onClick={() => { void handleSaveInfo(); }}>
                保存
              </Button>
            </Form>
          </Card>

          <Card size="small" title="技能组">
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              {agent.skillGroups.length > 0 ? (
                <Space wrap>
                  {agent.skillGroups.map((skill) => (
                    <Tooltip key={skill.skill_group_id} title={`移除 ${skill.name}`}>
                      <Popconfirm
                        title={`确认移除技能组 ${skill.name}?`}
                        onConfirm={() => { void removeAgentSkill(agent.agentId, skill.skill_group_id).then(onUpdated); }}
                        okText="移除"
                        cancelText="取消"
                      >
                        <Tag closable color="geekblue" style={{ cursor: "pointer" }} onClose={(e) => e.preventDefault()}>
                          {skill.code} - {skill.name}
                        </Tag>
                      </Popconfirm>
                    </Tooltip>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂未绑定技能组</Typography.Text>
              )}
              {addableGroups.length > 0 && (
                <Space style={{ marginTop: 8 }}>
                  <Select
                    style={{ width: 240 }}
                    placeholder="选择技能组添加"
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
                          message.error((err as Error).message);
                        } finally {
                          setAddingSkill(false);
                        }
                      })();
                    }}
                  >
                    添加
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
