/**
 * 菜单路径与名称: 客户中心 -> Organization / 组织架构 -> 部门面板
 * 文件职责: 展示部门列表、全部部门入口，以及新建部门入口。
 * 主要交互文件:
 * - ../OrganizationTab.tsx
 * - ../hooks/useOrganizationData.ts
 * - ../modals/NewDepartmentModal.tsx
 */

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { DepartmentItem, TeamItem } from "../types";

type DepartmentPanelProps = {
  loading: boolean;
  departments: DepartmentItem[];
  teams: TeamItem[];
  selectedDeptId: string | null;
  onSelect: (departmentId: string | null) => void;
  onOpenCreate: () => void;
  onEdit: (department: DepartmentItem) => void;
  onDelete: (department: DepartmentItem) => void;
};

export function DepartmentPanel({
  loading,
  departments,
  teams,
  selectedDeptId,
  onSelect,
  onOpenCreate,
  onEdit,
  onDelete
}: DepartmentPanelProps) {
  const { t } = useTranslation();
  return (
    <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography.Text strong>{t("organizationModule.department.listTitle")}</Typography.Text>
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={onOpenCreate}>
          {t("organizationModule.department.create")}
        </Button>
      </div>

      <div
        onClick={() => onSelect(null)}
        style={{ padding: "10px 16px", cursor: "pointer", background: selectedDeptId === null ? "#e6f4ff" : "transparent", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Typography.Text style={{ color: selectedDeptId === null ? "#1677ff" : undefined }}>
          {t("organizationModule.department.all")}
        </Typography.Text>
        <Tag>{t("organizationModule.department.teamsCount", { count: teams.length })}</Tag>
      </div>

      {loading && departments.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center" }}>
          <Typography.Text type="secondary">{t("organizationModule.department.loading")}</Typography.Text>
        </div>
      ) : (
        departments.map((department) => {
          const isSelected = department.departmentId === selectedDeptId;
          const deptTeams = teams.filter((team) => team.departmentId === department.departmentId);
          return (
            <div
              key={department.departmentId}
              onClick={() => onSelect(isSelected ? null : department.departmentId)}
              style={{ padding: "10px 16px", cursor: "pointer", background: isSelected ? "#e6f4ff" : "transparent", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.15s" }}
            >
              <div>
                <Typography.Text strong={isSelected} style={{ color: isSelected ? "#1677ff" : undefined, display: "block" }}>
                  {department.name}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{department.code}</Typography.Text>
              </div>
              <Space size={8}>
                <Tag>{t("organizationModule.department.teamsCount", { count: deptTeams.length })}</Tag>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={t("organizationModule.department.edit")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(department);
                  }}
                />
                <Popconfirm
                  title={t("organizationModule.department.deleteConfirmTitle")}
                  description={deptTeams.length > 0
                    ? t("organizationModule.department.deleteBlockedHint", { count: deptTeams.length })
                    : t("organizationModule.department.deleteConfirmDescription", { name: department.name })}
                  okText={t("common.confirm")}
                  cancelText={t("common.cancel")}
                  okButtonProps={{ danger: true, disabled: deptTeams.length > 0 }}
                  onConfirm={() => { onDelete(department); }}
                  onPopupClick={(event) => { event.stopPropagation(); }}
                >
                  <Button
                    danger
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={t("organizationModule.department.delete")}
                    onClick={(event) => { event.stopPropagation(); }}
                  />
                </Popconfirm>
              </Space>
            </div>
          );
        })
      )}

      {!loading && departments.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Typography.Text type="secondary">{t("organizationModule.department.empty")}</Typography.Text>
        </div>
      ) : null}
    </div>
  );
}
