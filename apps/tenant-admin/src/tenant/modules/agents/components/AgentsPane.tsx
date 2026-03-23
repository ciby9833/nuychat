// 作用: 坐席列表面板（坐席表格 + 状态统计 + 坐席详情抽屉入口）
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 坐席管理 Tab
// 作者：吴川

import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import { Badge, Button, Space, Table, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";

import { removeAgent } from "../../../api";
import type { AgentProfile, MemberListItem, SkillGroup } from "../../../types";
import { AgentDrawer } from "../modals/AgentDrawer";
import { ROLE_COLOR, SENIORITY_LABEL, STATUS_LABEL } from "../types";

export function AgentsPane({
  agents,
  members,
  groups,
  loading,
  onReload,
  onEnable
}: {
  agents: AgentProfile[];
  members: MemberListItem[];
  groups: SkillGroup[];
  loading: boolean;
  onReload: () => void;
  onEnable: () => void;
}) {
  const [selected, setSelected] = useState<AgentProfile | null>(null);

  useEffect(() => {
    if (!selected) return;
    const fresh = agents.find((agent) => agent.agentId === selected.agentId) ?? null;
    if (!fresh) setSelected(null);
    else if (fresh !== selected) setSelected(fresh);
  }, [agents, selected]);

  const removableCandidates = members.filter((member) => !member.agentId).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Space size="large">
          <Space><Badge status="success" /><Typography.Text>在线 {agents.filter((agent) => agent.status === "online").length}</Typography.Text></Space>
          <Space><Badge status="warning" /><Typography.Text>忙碌 {agents.filter((agent) => agent.status === "busy").length}</Typography.Text></Space>
          <Typography.Text type="secondary">共 {agents.length} 位坐席</Typography.Text>
        </Space>
        <Space>
          <Button onClick={onReload} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onEnable}>
            启用接待资格
          </Button>
        </Space>
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
        当前还有 {removableCandidates} 位成员未启用接待资格。
      </Typography.Paragraph>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <Table<AgentProfile>
          rowKey="agentId"
          loading={loading}
          dataSource={agents}
          pagination={agents.length > 10 ? { pageSize: 10, size: "small" } : false}
          onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "坐席",
              render: (_, row) => (
                <Space>
                  <UserOutlined style={{ color: "#8c8c8c" }} />
                  <div>
                    <Typography.Text strong>{row.displayName}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.email}{row.employeeNo ? ` / ${row.employeeNo}` : ""}
                    </Typography.Text>
                  </div>
                </Space>
              )
            },
            {
              title: "状态",
              dataIndex: "status",
              width: 90,
              render: (value: string) => <Badge status={value === "online" ? "success" : value === "busy" ? "warning" : "default"} text={STATUS_LABEL[value] ?? value} />
            },
            { title: "角色", dataIndex: "role", width: 110, render: (value: string) => <Tag color={ROLE_COLOR[value] ?? "default"}>{value}</Tag> },
            { title: "资历", dataIndex: "seniorityLevel", width: 80, render: (value: string) => SENIORITY_LABEL[value] ?? value },
            { title: "并发", dataIndex: "maxConcurrency", width: 70, align: "center" as const },
            {
              title: "技能组",
              render: (_, row) => row.skillGroups.length > 0
                ? row.skillGroups.map((skill) => <Tag key={skill.skill_group_id} color="geekblue">{skill.code}</Tag>)
                : <Typography.Text type="secondary">-</Typography.Text>
            }
          ]}
        />
      </div>

      <AgentDrawer
        agent={selected}
        groups={groups}
        onClose={() => setSelected(null)}
        onUpdated={onReload}
        onRemoved={async (agentId) => {
          try {
            await removeAgent(agentId);
            message.success("已从坐席列表移除");
            setSelected(null);
            onReload();
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
      />
    </>
  );
}
