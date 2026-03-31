/**
 * 菜单路径与名称: 客户中心 -> Customers / 客户管理 -> 客户标签管理
 * 文件职责: 提供单个客户的标签分配弹窗。
 * 主要交互文件:
 * - ../CustomersTab.tsx
 * - ../hooks/useCustomersData.ts
 * - ../types.ts
 */

import { Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import type { CustomerListItem, CustomerTagItem } from "../types";

type CustomerTagsModalProps = {
  open: boolean;
  selectedCustomer: CustomerListItem | null;
  assignTagIds: string[];
  tags: CustomerTagItem[];
  onCancel: () => void;
  onOk: () => void;
  onChange: (values: string[]) => void;
};

export function CustomerTagsModal({
  open,
  selectedCustomer,
  assignTagIds,
  tags,
  onCancel,
  onOk,
  onChange
}: CustomerTagsModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t("customersModule.tagsModal.title", { name: selectedCustomer?.name ?? selectedCustomer?.reference ?? "-" })}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      destroyOnHidden
    >
      <Select
        mode="multiple"
        style={{ width: "100%" }}
        value={assignTagIds}
        onChange={onChange}
        options={tags.filter((tag) => tag.isActive).map((tag) => ({ value: tag.tagId, label: tag.name }))}
      />
    </Modal>
  );
}
