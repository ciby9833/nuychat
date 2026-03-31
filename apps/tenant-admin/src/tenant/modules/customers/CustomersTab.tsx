/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理
 * 文件职责: 客户模块主入口，负责串联客户筛选、标签库、分组规则、客户列表与标签/分组弹窗。
 * 主要交互文件:
 * - ./hooks/useCustomersData.ts: 负责客户、标签、分组数据加载，以及标签分配、标签创建、分组创建、状态切换等操作。
 * - ./components/CustomersFilterBar.tsx: 展示客户查询筛选栏。
 * - ./components/CustomerTagsCard.tsx: 展示标签库与标签创建表单。
 * - ./components/CustomerSegmentsTable.tsx: 展示分组规则与执行/启停操作。
 * - ./components/CustomersTable.tsx: 展示客户列表与分页。
 * - ./modals/CustomerTagsModal.tsx: 承载客户标签分配弹窗。
 * - ./modals/CustomerSegmentModal.tsx: 承载客户分组创建弹窗。
 * - ./types.ts: 统一导出 customers 模块使用的类型与表单类型。
 * - ../../api.ts: 提供客户、标签、分组相关接口能力。
 */

import { Space } from "antd";

import { CustomersFilterBar } from "./components/CustomersFilterBar";
import { CustomerSegmentsTable } from "./components/CustomerSegmentsTable";
import { CustomersTable } from "./components/CustomersTable";
import { CustomerTagsCard } from "./components/CustomerTagsCard";
import { useCustomersData } from "./hooks/useCustomersData";
import { CustomerSegmentModal } from "./modals/CustomerSegmentModal";
import { CustomerTagsModal } from "./modals/CustomerTagsModal";

export function CustomersTab() {
  const data = useCustomersData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <CustomersFilterBar
        loading={data.loading}
        filters={data.filters}
        tags={data.tags}
        segments={data.segments}
        onFiltersChange={(updater) => data.setFilters(updater)}
        onRefresh={() => { void data.load(data.filters); }}
        onOpenCreateSegment={() => data.setSegmentModalOpen(true)}
      />

      <CustomerTagsCard
        tags={data.tags}
        form={data.tagForm}
        onSubmitCreate={() => { void data.submitCreateTag(); }}
        onToggleTag={(tag) => { void data.toggleTagStatus(tag); }}
      />

      <CustomerSegmentsTable
        loading={data.loading}
        segments={data.segments}
        onRunSegment={(segment) => { void data.runSegment(segment); }}
        onToggleSegment={(segment) => { void data.toggleSegmentStatus(segment); }}
      />

      <CustomersTable
        loading={data.loading}
        customers={data.customers}
        onManageTags={data.openAssignModal}
        onPageChange={(page, pageSize) => { void data.loadCustomerPage(page, pageSize); }}
      />

      <CustomerTagsModal
        open={data.tagModalOpen}
        selectedCustomer={data.selectedCustomer}
        assignTagIds={data.assignTagIds}
        tags={data.tags}
        onCancel={() => data.setTagModalOpen(false)}
        onOk={() => { void data.submitAssignTags(); }}
        onChange={data.setAssignTagIds}
      />

      <CustomerSegmentModal
        open={data.segmentModalOpen}
        form={data.segmentForm}
        onCancel={() => data.setSegmentModalOpen(false)}
        onOk={() => { void data.submitCreateSegment(); }}
      />
    </Space>
  );
}
