/**
 * 菜单路径与名称: 客户中心 -> Supervisor / 主管工作台 -> 广播通知
 * 文件职责: 承载广播通知输入与确认弹窗。
 * 主要交互文件:
 * - ../SupervisorTab.tsx: 负责打开弹窗与提交广播。
 * - ../hooks/useSupervisorData.ts: 管理广播内容与弹窗开关状态。
 */

import { Input, Modal } from "antd";
import { useTranslation } from "react-i18next";

type SupervisorBroadcastModalProps = {
  open: boolean;
  saving: boolean;
  text: string;
  onCancel: () => void;
  onOk: () => void;
  onTextChange: (value: string) => void;
};

export function SupervisorBroadcastModal({
  open,
  saving,
  text,
  onCancel,
  onOk,
  onTextChange
}: SupervisorBroadcastModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      title={t("supervisorModule.broadcastModal.title")}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okButtonProps={{ loading: saving }}
      destroyOnHidden
    >
      <Input.TextArea rows={4} value={text} placeholder={t("supervisorModule.broadcastModal.placeholder")} onChange={(event) => onTextChange(event.target.value)} />
    </Modal>
  );
}
