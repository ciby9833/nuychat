/**
 * 菜单路径与名称: 客户中心 -> Permissions / 权限策略
 * 文件职责: 权限策略模块主入口，负责串联权限矩阵说明、角色权限开关表与保存动作。
 * 主要交互文件:
 * - ./hooks/usePermissionsData.ts: 负责权限策略加载、草稿态、矩阵数据派生与保存。
 * - ./components/PermissionsMatrixTable.tsx: 展示角色与权限维度的开关矩阵。
 * - ./helpers.ts: 提供角色标签映射。
 * - ../../api.ts: 提供权限策略查询与批量更新接口能力。
 */

import { Button, Card, Space, Typography } from "antd";

import { PermissionsMatrixTable } from "./components/PermissionsMatrixTable";
import { usePermissionsData } from "./hooks/usePermissionsData";

export function PermissionsTab() {
  const data = usePermissionsData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="权限策略（D2）"
        extra={<Button type="primary" loading={data.saving} onClick={() => { void data.onSave(); }}>保存变更</Button>}
        loading={data.loading}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          支持角色：tenant_admin / supervisor / senior_agent / agent / readonly。此矩阵用于控制 Tenant Admin 能访问和修改的模块。
        </Typography.Paragraph>
        <PermissionsMatrixTable
          data={data.data}
          rows={data.rows}
          onToggle={data.onToggle}
        />
      </Card>
    </Space>
  );
}
