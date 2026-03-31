/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构 -> 团队面板
 * 文件职责: 展示团队列表、主管信息、成员列表与成员增删入口。
 * 主要交互文件:
 * - ../OrganizationTab.tsx
 * - ../hooks/useOrganizationData.ts
 * - ../modals/NewTeamModal.tsx
 */

import { PlusOutlined, TeamOutlined, UserDeleteOutlined } from "@ant-design/icons";
import { Select, Space, Table, Tag, Tooltip, Typography, Button } from "antd";
import { useTranslation } from "react-i18next";

import type { AgentProfile, DepartmentItem, TeamItem } from "../types";

type TeamsPanelProps = {
  loading: boolean;
  visibleTeams: TeamItem[];
  selectedDeptId: string | null;
  selectedDept: DepartmentItem | null;
  agents: AgentProfile[];
  onOpenCreate: () => void;
  onAddMember: (teamId: string, agentId: string) => void;
  onRemoveMember: (teamId: string, agentId: string) => void;
};

export function TeamsPanel({
  loading,
  visibleTeams,
  selectedDeptId,
  selectedDept,
  agents,
  onOpenCreate,
  onAddMember,
  onRemoveMember
}: TeamsPanelProps) {
  const { t } = useTranslation();
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Space>
          <TeamOutlined />
          <Typography.Text strong>{selectedDept ? t("organizationModule.teams.titleWithDept", { name: selectedDept.name }) : t("organizationModule.teams.titleAll")}</Typography.Text>
          <Tag color="blue">{visibleTeams.length}</Tag>
        </Space>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={onOpenCreate}>
          {t("organizationModule.teams.create")}
        </Button>
      </div>

      <Table<TeamItem>
        rowKey="teamId"
        loading={loading}
        dataSource={visibleTeams}
        pagination={visibleTeams.length > 8 ? { pageSize: 8, size: "small" } : false}
        locale={{ emptyText: selectedDeptId ? t("organizationModule.teams.emptyWithDept") : t("organizationModule.teams.empty") }}
        style={{ padding: "0 8px" }}
        columns={[
          {
            title: t("organizationModule.teams.team"),
            key: "team",
            render: (_, row) => (
              <div>
                <Typography.Text strong>{row.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>{row.code}</Typography.Text>
                {!selectedDeptId ? <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>{row.departmentName}</Tag> : null}
              </div>
            )
          },
          {
            title: t("organizationModule.teams.supervisor"),
            dataIndex: "supervisorName",
            width: 140,
            render: (value: string | null) =>
              value ? <Tag color="purple">{value}</Tag> : <Typography.Text type="secondary">{t("organizationModule.teams.noSupervisor")}</Typography.Text>
          },
          {
            title: t("organizationModule.teams.members"),
            key: "members",
            render: (_, row) => {
              const memberIds = new Set(row.members.map((member) => member.agentId));
              const available = agents.filter((agent) => !memberIds.has(agent.agentId));

              return (
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  {row.members.length > 0 ? (
                    <Space wrap>
                      {row.members.map((member) => (
                        <Tooltip key={member.agentId} title={t("organizationModule.teams.removeMember", { name: member.displayName })}>
                          <Tag
                            icon={<UserDeleteOutlined />}
                            closable
                            color={member.isPrimary ? "geekblue" : "default"}
                            onClose={(event) => {
                              event.preventDefault();
                              onRemoveMember(row.teamId, member.agentId);
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            {member.displayName}
                          </Tag>
                        </Tooltip>
                      ))}
                    </Space>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("organizationModule.teams.noMembers")}</Typography.Text>
                  )}

                  {available.length > 0 ? (
                    <Select
                      showSearch
                      size="small"
                      placeholder={t("organizationModule.teams.addMember")}
                      value={null}
                      style={{ width: 220 }}
                      optionFilterProp="label"
                      options={available.map((agent) => ({ value: agent.agentId, label: `${agent.displayName} (${agent.email})` }))}
                      onChange={(agentId) => {
                        if (agentId) onAddMember(row.teamId, String(agentId));
                      }}
                    />
                  ) : null}
                </Space>
              );
            }
          }
        ]}
      />
    </div>
  );
}
