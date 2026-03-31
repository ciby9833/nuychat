/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 单元格排班设置
 * 文件职责: 负责单个坐席在某一天的排班状态与班次模板编辑。
 * 主要交互文件:
 * - ./SchedulePane.tsx: 负责触发单元格展示与弹出层打开。
 * - ../helpers.ts: 提供星期文案、状态选项与标签配置。
 * - ../../../api.ts: 提供单个排班保存接口。
 */

import { Button, Popover, Radio, Select, Tooltip, Typography, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { upsertAgentShift } from "../../../api";
import { getDowShort, getShiftStatusOptions, getShiftStatusTagMap } from "../helpers";
import type { AgentShiftItem, ShiftScheduleItem } from "../types";

type ShiftCellPopoverProps = {
  agentId: string;
  date: string;
  currentShift: AgentShiftItem | undefined;
  schedules: ShiftScheduleItem[];
  onSaved: () => Promise<void>;
  compact?: boolean;
};

export function ShiftCellPopover({
  agentId,
  date,
  currentShift,
  schedules,
  onSaved,
  compact = false
}: ShiftCellPopoverProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(currentShift?.shiftId ?? null);
  const [status, setStatus] = useState<"scheduled" | "off" | "leave">(currentShift?.status ?? "scheduled");
  const dowShort = getDowShort();
  const shiftStatusOptions = getShiftStatusOptions();
  const shiftStatusTagMap = getShiftStatusTagMap();

  useEffect(() => {
    setShiftId(currentShift?.shiftId ?? null);
    setStatus(currentShift?.status ?? "scheduled");
  }, [currentShift]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertAgentShift({ agentId, shiftId: status === "scheduled" ? shiftId : null, shiftDate: date, status });
      void message.success(t("shiftsModule.shiftCell.saved"));
      setOpen(false);
      await onSaved();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const tag = currentShift ? shiftStatusTagMap[currentShift.status] : null;

  const popContent = (
    <div style={{ width: 240 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
        {date} ({dowShort[dayjs(date).isoWeekday() - 1]})
      </Typography.Text>
      <div style={{ marginBottom: 8 }}>
        <Radio.Group size="small" value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "off" | "leave")} optionType="button" buttonStyle="solid">
          {shiftStatusOptions.map((option) => <Radio.Button key={option.value} value={option.value}>{option.label}</Radio.Button>)}
        </Radio.Group>
      </div>
      {status === "scheduled" ? (
        <Select
          style={{ width: "100%", marginBottom: 8 }}
          placeholder={t("shiftsModule.shiftCell.selectTemplate")}
          allowClear
          value={shiftId}
          onChange={(value) => setShiftId(value ?? null)}
          options={schedules.filter((schedule) => schedule.isActive).map((schedule) => ({
            value: schedule.shiftId,
            label: `${schedule.name} (${schedule.startTime}-${schedule.endTime})`
          }))}
        />
      ) : null}
      <Button type="primary" size="small" block loading={saving} onClick={() => { void handleSave(); }}>
        {t("shiftsModule.shiftCell.save")}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <Popover content={popContent} title={t("shiftsModule.shiftCell.title")} trigger="click" open={open} onOpenChange={setOpen}>
        <Tooltip title={tag ? `${date} ${tag.label}${currentShift?.shiftName ? ` · ${currentShift.shiftName}` : ""}` : `${date} ${t("shiftsModule.schedule.unset")}`} mouseEnterDelay={0.3}>
          <div style={{ height: 20, width: "100%", cursor: "pointer", background: tag?.bg ?? "transparent", borderRadius: 3, border: `1px solid ${tag ? `${tag.dot}80` : "#f0f0f0"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {tag ? <div style={{ width: 6, height: 6, borderRadius: "50%", background: tag.dot }} /> : null}
          </div>
        </Tooltip>
      </Popover>
    );
  }

  const displayLabel = currentShift?.status === "scheduled" ? (currentShift.shiftName ?? t("shiftsModule.shiftCell.defaultScheduled")) : tag?.label;

  return (
    <Popover content={popContent} title={t("shiftsModule.shiftCell.title")} trigger="click" open={open} onOpenChange={setOpen}>
      <div
        style={{ cursor: "pointer", background: tag?.bg ?? "transparent", borderRadius: 4, padding: "4px 6px", minHeight: 28, fontSize: 12, textAlign: "center", border: "1px solid transparent", transition: "border-color 0.15s" }}
        onMouseEnter={(event) => { (event.currentTarget as HTMLDivElement).style.borderColor = "#1677ff"; }}
        onMouseLeave={(event) => { (event.currentTarget as HTMLDivElement).style.borderColor = "transparent"; }}
      >
        {displayLabel ? <span style={{ color: tag?.color }}>{displayLabel}</span> : <span style={{ color: "#bfbfbf" }}>-</span>}
      </div>
    </Popover>
  );
}
