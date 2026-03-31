import { Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";

import { ROLE_LABEL } from "../helpers";
import type { PermissionKey, PermissionPolicyResponse, PermissionRole, PolicyRow } from "../types";

type PermissionsMatrixTableProps = {
  data: PermissionPolicyResponse | null;
  rows: PolicyRow[];
  onToggle: (role: PermissionRole, permission: PermissionKey, checked: boolean) => void;
};

export function PermissionsMatrixTable({ data, rows, onToggle }: PermissionsMatrixTableProps) {
  const columns: ColumnsType<PolicyRow> = [
    {
      title: "角色",
      dataIndex: "role",
      fixed: "left",
      width: 180,
      render: (role: PermissionRole) => <Tag color="blue">{ROLE_LABEL[role]}</Tag>
    },
    ...((data?.permissions ?? []).map((permission) => ({
      title: permission,
      key: permission,
      width: 160,
      render: (_value: unknown, row: PolicyRow) => (
        <Switch
          checked={row.values[permission]}
          onChange={(checked) => onToggle(row.role, permission, checked)}
        />
      )
    })) as ColumnsType<PolicyRow>)
  ];

  return (
    <Table<PolicyRow>
      rowKey="role"
      dataSource={rows}
      pagination={false}
      scroll={{ x: 1200 }}
      columns={columns}
    />
  );
}
