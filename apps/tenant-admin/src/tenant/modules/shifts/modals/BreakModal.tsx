/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 发起休息
 * 文件职责: 为指定坐席发起休息，设置休息类型与备注。
 * 主要交互文件:
 * - ../components/PresencePane.tsx: 负责打开弹窗并传入坐席信息。
 * - ../helpers.ts: 提供休息类型选项。
 * - ../../../api.ts: 提供发起休息接口。
 */

import { CoffeeOutlined } from "@ant-design/icons";
import { Input, Modal, Radio, Space, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { startAgentBreak } from "../../../api";
import { getBreakTypeOptions } from "../helpers";

type BreakModalProps = {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function BreakModal({ agentId, agentName, open, onClose, onSaved }: BreakModalProps) {
  const { t } = useTranslation();
  const [breakType, setBreakType] = useState<"break" | "lunch" | "training">("break");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const breakTypeOptions = getBreakTypeOptions();

  useEffect(() => {
    if (open) {
      setBreakType("break");
      setNote("");
    }
  }, [open]);

  const handleStart = async () => {
    setSaving(true);
    try {
      await startAgentBreak({ agentId, breakType, note: note || undefined });
      void message.success(t("shiftsModule.breakModal.started", { name: agentName }));
      onClose();
      await onSaved();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<Space><CoffeeOutlined />{t("shiftsModule.breakModal.title", { name: agentName })}</Space>}
      open={open}
      onCancel={onClose}
      onOk={() => { void handleStart(); }}
      okText={t("shiftsModule.breakModal.confirm")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
      width={360}
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>{t("shiftsModule.breakModal.breakType")}</Typography.Text>
        <Radio.Group value={breakType} onChange={(event) => setBreakType(event.target.value as "break" | "lunch" | "training")} optionType="button" buttonStyle="solid">
          {breakTypeOptions.map((option) => <Radio.Button key={option.value} value={option.value}>{option.label}</Radio.Button>)}
        </Radio.Group>
      </div>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>{t("shiftsModule.breakModal.note")}</Typography.Text>
        <Input placeholder={t("shiftsModule.breakModal.notePlaceholder")} value={note} onChange={(event) => setNote(event.target.value)} maxLength={100} />
      </div>
    </Modal>
  );
}
