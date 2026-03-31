/**
 * 菜单路径与名称: 客户中心 -> Cases / 会话事项
 * 文件职责: 事项模块主入口，负责串联筛选条件、事项列表分页与数据刷新动作。
 * 主要交互文件:
 * - ./hooks/useCasesData.ts: 负责查询条件状态、列表请求、分页与错误提示。
 * - ./components/CasesFilterBar.tsx: 展示搜索与状态筛选栏。
 * - ./components/CasesTable.tsx: 展示事项列表与分页切换。
 * - ./types.ts: 统一导出事项列表相关类型。
 * - ../../api.ts: 提供 listConversationCases 接口请求。
 * - ../../types.ts: 当前事项类型源定义仍在租户公共类型文件中。
 */

import { Space } from "antd";

import { CasesFilterBar } from "./components/CasesFilterBar";
import { CasesTable } from "./components/CasesTable";
import { useCasesData } from "./hooks/useCasesData";

export function CasesTab() {
  const data = useCasesData();
  const normalizedSearch = data.search.trim() || undefined;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <CasesFilterBar
        loading={data.loading}
        search={data.search}
        status={data.status}
        onSearchChange={data.setSearch}
        onStatusChange={data.setStatus}
        onSubmit={() => { void data.load({ page: 1, status: data.status, search: normalizedSearch }); }}
      />

      <CasesTable
        loading={data.loading}
        data={data.data}
        onPageChange={(page, pageSize) => {
          void data.load({ page, pageSize, status: data.status, search: normalizedSearch });
        }}
      />
    </Space>
  );
}
