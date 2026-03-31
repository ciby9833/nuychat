/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 批量排班
 * 文件职责: 为选中的坐席批量设置多个日期的排班状态与班次模板。
 * 主要交互文件:
 * - ../components/SchedulePane.tsx: 负责打开弹窗并传入所选坐席与日期范围。
 * - ../helpers.ts: 提供日期文案、工作日判断与排班状态选项。
 * - ../../../api.ts: 提供批量保存排班接口。
 */

import { CheckSquareOutlined } from "@ant-design/icons";
import { Button, Modal, Radio, Select, Space, Tag, Tooltip, Typography, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { bulkUpsertAgentShifts } from "../../../api";
import { getDayShort, getDowShort, getShiftStatusOptions, isWeekendDate } from "../helpers";
import type { AgentProfile, ShiftScheduleItem } from "../types";

type BulkScheduleModalProps = {
  open: boolean;
  agents: AgentProfile[];
  selectedAgentIds: string[];
  schedules: ShiftScheduleItem[];
  allDates: string[];
  viewMode: "week" | "month";
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function BulkScheduleModal({
  open,
  agents,
  selectedAgentIds,
  schedules,
  allDates,
  viewMode,
  onClose,
  onSaved
}: BulkScheduleModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"scheduled" | "off" | "leave">("scheduled");
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dayShort = getDayShort();
  const dowShort = getDowShort();
  const shiftStatusOptions = getShiftStatusOptions();

  useEffect(() => {
    if (open) {
      setStatus("scheduled");
      setShiftId(null);
      setSelectedDates([...allDates]);
    }
  }, [open, allDates]);

  const toggleDate = (date: string) => {
    setSelectedDates((prev) => prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date]);
  };

  const handleApply = async () => {
    if (selectedDates.length === 0) {
      void message.warning(t("shiftsModule.bulkModal.selectOneDate"));
      return;
    }
    setSaving(true);
    try {
      const items = selectedAgentIds.flatMap((agentId) =>
        selectedDates.map((shiftDate) => ({ agentId, shiftId: status === "scheduled" ? shiftId : null, shiftDate, status }))
      );
      const result = await bulkUpsertAgentShifts(items);
      void message.success(t("shiftsModule.bulkModal.saved", { count: result.saved }));
      onClose();
      await onSaved();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const agentNames = agents.filter((agent) => selectedAgentIds.includes(agent.agentId)).map((agent) => agent.displayName);
  const workDays = allDates.filter((date) => !isWeekendDate(date));

  const renderDateSelector = () => {
    if (viewMode === "week") {
      return (
        <Space wrap>
          {allDates.map((date, index) => {
            const checked = selectedDates.includes(date);
            const weekend = isWeekendDate(date);
            return (
              <Tag
                key={date}
                color={checked ? (weekend ? "orange" : "blue") : "default"}
                style={{ cursor: "pointer", userSelect: "none", padding: "2px 10px" }}
                onClick={() => toggleDate(date)}
              >
                {dowShort[index]} {dayjs(date).format("M/D")}
              </Tag>
            );
          })}
        </Space>
      );
    }

    const firstDow = dayjs(allDates[0]).isoWeekday();
    const headerRow = dayShort.map((day, index) => (
      <div key={day} style={{ width: 36, textAlign: "center", fontSize: 11, color: index >= 5 ? "#fa8c16" : "#8c8c8c", fontWeight: 500 }}>{day}</div>
    ));
    const blanks = Array.from({ length: firstDow - 1 }, (_, index) => (
      <div key={`blank-${index}`} style={{ width: 36 }} />
    ));
    const dateCells = allDates.map((date) => {
      const checked = selectedDates.includes(date);
      const weekend = isWeekendDate(date);
      const isToday = date === dayjs().format("YYYY-MM-DD");
      return (
        <Tooltip key={date} title={date}>
          <div
            onClick={() => toggleDate(date)}
            style={{ width: 36, height: 28, cursor: "pointer", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, userSelect: "none", background: checked ? (weekend ? "#fff7e6" : "#e6f4ff") : "transparent", border: checked ? `1px solid ${weekend ? "#fa8c16" : "#1677ff"}` : "1px solid transparent", color: isToday ? "#1677ff" : weekend ? "#fa8c16" : undefined, fontWeight: isToday ? 700 : 400, transition: "all 0.12s" }}
          >
            {dayjs(date).date()}
          </div>
        </Tooltip>
      );
    });

    return (
      <div>
        <div style={{ display: "flex", marginBottom: 4 }}>{headerRow}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {blanks}
          {dateCells}
        </div>
      </div>
    );
  };

  return (
    <Modal
      title={<Space><CheckSquareOutlined />{t("shiftsModule.bulkModal.title")}</Space>}
      open={open}
      onCancel={onClose}
      onOk={() => { void handleApply(); }}
      okText={t("shiftsModule.bulkModal.apply")}
      cancelText={t("common.cancel")}
      confirmLoading={saving}
      destroyOnHidden
      width={viewMode === "month" ? 520 : 480}
    >
      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("shiftsModule.bulkModal.selectedAgents")}</Typography.Text>
        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {agentNames.map((name) => <Tag key={name}>{name}</Tag>)}
          {agentNames.length === 0 ? <Typography.Text type="secondary">{t("shiftsModule.bulkModal.none")}</Typography.Text> : null}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("shiftsModule.bulkModal.applyDates")}</Typography.Text>
          <Space size={4}>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates([...allDates])}>{t("shiftsModule.bulkModal.selectAll")}</Button>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates(workDays)}>{t("shiftsModule.bulkModal.workdaysOnly")}</Button>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates([])}>{t("shiftsModule.bulkModal.clear")}</Button>
          </Space>
        </div>
        {renderDateSelector()}
        <div style={{ marginTop: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {t("shiftsModule.bulkModal.selectedDays", { selected: selectedDates.length, total: allDates.length })}
          </Typography.Text>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>{t("shiftsModule.bulkModal.shiftType")}</Typography.Text>
        <Radio.Group value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "off" | "leave")} optionType="button" buttonStyle="solid">
          {shiftStatusOptions.map((option) => <Radio.Button key={option.value} value={option.value}>{option.label}</Radio.Button>)}
        </Radio.Group>
      </div>

      {status === "scheduled" ? (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>{t("shiftsModule.bulkModal.shiftTemplateOptional")}</Typography.Text>
          <Select
            style={{ width: "100%" }}
            placeholder={t("shiftsModule.bulkModal.selectTemplate")}
            allowClear
            value={shiftId}
            onChange={(value) => setShiftId(value ?? null)}
            options={schedules.filter((schedule) => schedule.isActive).map((schedule) => ({
              value: schedule.shiftId,
              label: `${schedule.name} (${schedule.startTime}-${schedule.endTime})`
            }))}
          />
        </div>
      ) : null}
    </Modal>
  );
}
