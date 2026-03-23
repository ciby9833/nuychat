// 用于排班管理，包含班次定义、周/月视图排班表、批量排班工具等功能
// 菜单路径：客户中心 -> 排班管理   
// 作者：吴川
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CoffeeOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WifiOutlined
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Radio,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  message
} from "antd";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  bulkUpsertAgentShifts,
  createShiftSchedule,
  deleteShiftSchedule,
  endAgentBreak,
  getAgentPresence,
  listAgentShifts,
  listAgents,
  listDepartments,
  listShiftSchedules,
  listTeams,
  startAgentBreak,
  updateShiftSchedule,
  upsertAgentShift
} from "../../api";
import type {
  AgentPresenceResponse,
  AgentProfile,
  AgentShiftItem,
  DepartmentItem,
  ShiftScheduleItem,
  TeamItem
} from "../../types";

dayjs.extend(isoWeek);

// ─── constants & helpers ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  online: "#52c41a", busy: "#faad14", away: "#d48806", offline: "#d9d9d9"
};
const STATUS_LABELS: Record<string, string> = {
  online: "在线", busy: "忙碌", away: "离开", offline: "离线"
};

const SHIFT_STATUS_OPTS = [
  { value: "scheduled", label: "正常排班" },
  { value: "off",       label: "休息"     },
  { value: "leave",     label: "请假"     }
];

const BREAK_TYPE_OPTS = [
  { value: "break",    label: "工间休息" },
  { value: "lunch",    label: "午餐休息" },
  { value: "training", label: "培训学习" }
];

const SHIFT_STATUS_TAG: Record<string, { color: string; bg: string; label: string; dot: string }> = {
  scheduled: { color: "#1677ff", bg: "#e6f4ff", label: "排班", dot: "#1677ff" },
  off:       { color: "#595959", bg: "#f5f5f5", label: "休",   dot: "#bfbfbf" },
  leave:     { color: "#d46b08", bg: "#fff7e6", label: "假",   dot: "#fa8c16" }
};

function weekDays(startDate: string): string[] {
  // Always start from Monday of the ISO week containing startDate
  const mon = dayjs(startDate).isoWeekday(1);
  return Array.from({ length: 7 }, (_, i) => mon.add(i, "day").format("YYYY-MM-DD"));
}

function monthDays(anchorDate: string): string[] {
  const m = dayjs(anchorDate).startOf("month");
  return Array.from({ length: m.daysInMonth() }, (_, i) =>
    m.add(i, "day").format("YYYY-MM-DD")
  );
}

const DAY_SHORT = ["一", "二", "三", "四", "五", "六", "日"];
const DOW_SHORT = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]; // isoWeekday 1-7

function isWeekendDate(dateStr: string) {
  const dow = dayjs(dateStr).isoWeekday(); // 1=Mon … 7=Sun
  return dow >= 6;
}

// ─── Tab 1: Shift definitions ──────────────────────────────────────────────

type ShiftFormValues = {
  code: string;
  name: string;
  startTime: dayjs.Dayjs;
  endTime: dayjs.Dayjs;
  timezone: string;
};

function ShiftDefinitionsPane({
  schedules, loading, onReload
}: {
  schedules: ShiftScheduleItem[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<ShiftScheduleItem | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form] = Form.useForm<ShiftFormValues>();

  const openCreate = () => { setEditTarget(null); form.resetFields(); setModalOpen(true); };
  const openEdit   = (row: ShiftScheduleItem) => {
    setEditTarget(row);
    form.setFieldsValue({
      code:      row.code,
      name:      row.name,
      startTime: dayjs(row.startTime, "HH:mm"),
      endTime:   dayjs(row.endTime,   "HH:mm"),
      timezone:  row.timezone
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      if (editTarget) {
        await updateShiftSchedule(editTarget.shiftId, {
          name:      v.name,
          startTime: v.startTime.format("HH:mm"),
          endTime:   v.endTime.format("HH:mm"),
          timezone:  v.timezone || "Asia/Shanghai"
        });
        message.success("班次已更新");
      } else {
        await createShiftSchedule({
          code:      v.code,
          name:      v.name,
          startTime: v.startTime.format("HH:mm"),
          endTime:   v.endTime.format("HH:mm"),
          timezone:  v.timezone || "Asia/Shanghai"
        });
        message.success("班次已创建");
      }
      form.resetFields(); setModalOpen(false); setEditTarget(null);
      await onReload();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (row: ShiftScheduleItem) => {
    setDeletingId(row.shiftId);
    try {
      await deleteShiftSchedule(row.shiftId);
      message.success("班次已停用");
      await onReload();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setDeletingId(null); }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <ClockCircleOutlined />
          <Typography.Text strong>班次模板</Typography.Text>
          <Tag>{schedules.length} 个</Tag>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建班次</Button>
      </div>

      <Table<ShiftScheduleItem>
        rowKey="shiftId" loading={loading} dataSource={schedules}
        pagination={false} locale={{ emptyText: '暂无班次，点击"新建班次"开始' }}
        columns={[
          {
            title: "班次名称", key: "name",
            render: (_, r) => (
              <Space>
                <Typography.Text strong>{r.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.code}</Typography.Text>
              </Space>
            )
          },
          {
            title: "工作时间", key: "time",
            render: (_, r) => (
              <Tag color="blue" icon={<ClockCircleOutlined />}>{r.startTime} — {r.endTime}</Tag>
            )
          },
          {
            title: "时区", dataIndex: "timezone",
            render: (v: string) => <Typography.Text type="secondary">{v}</Typography.Text>
          },
          {
            title: "状态", dataIndex: "isActive", width: 80,
            render: (v: boolean) => v ? <Badge status="success" text="启用" /> : <Badge status="default" text="停用" />
          },
          {
            title: "操作", key: "action", width: 100,
            render: (_, r) => (
              <Space size={4}>
                <Tooltip title="编辑">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                </Tooltip>
                <Popconfirm
                  title="停用班次"
                  description="停用后不再可选，历史排班不受影响。"
                  onConfirm={() => { void handleDelete(r); }}
                  okText="停用" cancelText="取消" okButtonProps={{ danger: true }}
                  disabled={!r.isActive}
                >
                  <Tooltip title={r.isActive ? "停用" : "已停用"}>
                    <Button size="small" danger icon={<DeleteOutlined />}
                      loading={deletingId === r.shiftId} disabled={!r.isActive} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />

      <Modal
        title={editTarget ? "编辑班次" : "新建班次"}
        open={modalOpen}
        onCancel={() => { form.resetFields(); setEditTarget(null); setModalOpen(false); }}
        onOk={() => { void handleSave(); }}
        okText={editTarget ? "保存" : "创建"} cancelText="取消"
        confirmLoading={saving} destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="班次编码" name="code"
            rules={[{ required: true, message: "请输入编码" }, { pattern: /^[a-z0-9_-]+$/, message: "小写字母、数字、连字符" }]}
            extra="如 morning、afternoon、night"
          >
            <Input placeholder="morning" disabled={Boolean(editTarget)} />
          </Form.Item>
          <Form.Item label="班次名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="早班" />
          </Form.Item>
          <Space size={16}>
            <Form.Item label="开始时间" name="startTime" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item label="结束时间" name="endTime" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
          </Space>
          <Form.Item label="时区" name="timezone" initialValue="Asia/Shanghai">
            <Select options={[
              { value: "Asia/Shanghai", label: "Asia/Shanghai (CST, UTC+8)" },
              { value: "Asia/Jakarta",  label: "Asia/Jakarta (WIB, UTC+7)"  },
              { value: "Asia/Tokyo",    label: "Asia/Tokyo (JST, UTC+9)"    },
              { value: "UTC",           label: "UTC"                         }
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ─── Single-cell shift popover (week view) ─────────────────────────────────

function ShiftCellPopover({
  agentId, date, currentShift, schedules, onSaved, compact = false
}: {
  agentId: string;
  date: string;
  currentShift: AgentShiftItem | undefined;
  schedules: ShiftScheduleItem[];
  onSaved: () => Promise<void>;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen]     = useState(false);
  const [shiftId, setShiftId] = useState<string | null>(currentShift?.shiftId ?? null);
  const [status, setStatus]   = useState<"scheduled" | "off" | "leave">(currentShift?.status ?? "scheduled");

  // sync state when currentShift changes (e.g. after reload)
  useEffect(() => {
    setShiftId(currentShift?.shiftId ?? null);
    setStatus(currentShift?.status ?? "scheduled");
  }, [currentShift]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertAgentShift({ agentId, shiftId: status === "scheduled" ? shiftId : null, shiftDate: date, status });
      message.success("排班已保存");
      setOpen(false);
      await onSaved();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setSaving(false); }
  };

  const tag = currentShift ? SHIFT_STATUS_TAG[currentShift.status] : null;

  const popContent = (
    <div style={{ width: 240 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
        {date} ({DOW_SHORT[dayjs(date).isoWeekday() - 1]})
      </Typography.Text>
      <div style={{ marginBottom: 8 }}>
        <Radio.Group size="small" value={status}
          onChange={(e) => setStatus(e.target.value as "scheduled" | "off" | "leave")}
          optionType="button" buttonStyle="solid"
        >
          {SHIFT_STATUS_OPTS.map((o) => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
        </Radio.Group>
      </div>
      {status === "scheduled" && (
        <Select style={{ width: "100%", marginBottom: 8 }} placeholder="选择班次模板" allowClear
          value={shiftId} onChange={(v) => setShiftId(v ?? null)}
          options={schedules.filter((s) => s.isActive).map((s) => ({
            value: s.shiftId, label: `${s.name}（${s.startTime}–${s.endTime}）`
          }))}
        />
      )}
      <Button type="primary" size="small" block loading={saving} onClick={() => { void handleSave(); }}>
        保存
      </Button>
    </div>
  );

  // ── compact mode (month view) ───────────────────────────────────────────
  if (compact) {
    return (
      <Popover content={popContent} title="设置排班" trigger="click" open={open} onOpenChange={setOpen}>
        <Tooltip title={tag ? `${date} ${tag.label}${currentShift?.shiftName ? ` · ${currentShift.shiftName}` : ""}` : `${date} 未设置`} mouseEnterDelay={0.3}>
          <div style={{
            height: 20, width: "100%", cursor: "pointer",
            background: tag?.bg ?? "transparent",
            borderRadius: 3,
            border: `1px solid ${tag ? tag.dot + "80" : "#f0f0f0"}`,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            {tag && <div style={{ width: 6, height: 6, borderRadius: "50%", background: tag.dot }} />}
          </div>
        </Tooltip>
      </Popover>
    );
  }

  // ── full mode (week view) ───────────────────────────────────────────────
  const displayLabel = currentShift?.status === "scheduled"
    ? (currentShift.shiftName ?? "排班")
    : tag?.label;

  return (
    <Popover content={popContent} title="设置排班" trigger="click" open={open} onOpenChange={setOpen}>
      <div style={{
        cursor: "pointer", background: tag?.bg ?? "transparent",
        borderRadius: 4, padding: "4px 6px", minHeight: 28, fontSize: 12,
        textAlign: "center", border: "1px solid transparent", transition: "border-color 0.15s"
      }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#1677ff"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "transparent"; }}
      >
        {displayLabel
          ? <span style={{ color: tag?.color }}>{displayLabel}</span>
          : <span style={{ color: "#bfbfbf" }}>—</span>
        }
      </div>
    </Popover>
  );
}

// ─── Bulk scheduling modal ─────────────────────────────────────────────────

function BulkScheduleModal({
  open, agents, selectedAgentIds, schedules, allDates, viewMode, onClose, onSaved
}: {
  open: boolean;
  agents: AgentProfile[];
  selectedAgentIds: string[];
  schedules: ShiftScheduleItem[];
  allDates: string[];
  viewMode: "week" | "month";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus]               = useState<"scheduled" | "off" | "leave">("scheduled");
  const [shiftId, setShiftId]             = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [saving, setSaving]               = useState(false);

  useEffect(() => {
    if (open) { setStatus("scheduled"); setShiftId(null); setSelectedDates([...allDates]); }
  }, [open, allDates]);

  const toggleDate = (d: string) =>
    setSelectedDates((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const handleApply = async () => {
    if (selectedDates.length === 0) { message.warning("请选择至少一个日期"); return; }
    setSaving(true);
    try {
      const items = selectedAgentIds.flatMap((agentId) =>
        selectedDates.map((shiftDate) => ({ agentId, shiftId: status === "scheduled" ? shiftId : null, shiftDate, status }))
      );
      const result = await bulkUpsertAgentShifts(items);
      message.success(`已批量保存 ${result.saved} 条排班`);
      onClose();
      await onSaved();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setSaving(false); }
  };

  const agentNames = agents.filter((a) => selectedAgentIds.includes(a.agentId)).map((a) => a.displayName);
  const workDays   = allDates.filter((d) => !isWeekendDate(d));

  // ── month view: calendar grid ───────────────────────────────────────────
  const renderDateSelector = () => {
    if (viewMode === "week") {
      // Chip row for 7 days
      return (
        <Space wrap>
          {allDates.map((date, i) => {
            const checked  = selectedDates.includes(date);
            const weekend  = isWeekendDate(date);
            return (
              <Tag key={date}
                color={checked ? (weekend ? "orange" : "blue") : "default"}
                style={{ cursor: "pointer", userSelect: "none", padding: "2px 10px" }}
                onClick={() => toggleDate(date)}
              >
                {DOW_SHORT[i]} {dayjs(date).format("M/D")}
              </Tag>
            );
          })}
        </Space>
      );
    }

    // Month: render a 7-col calendar grid
    const firstDow = dayjs(allDates[0]).isoWeekday(); // 1=Mon
    const headerRow = DAY_SHORT.map((d, i) => (
      <div key={d} style={{
        width: 36, textAlign: "center", fontSize: 11,
        color: i >= 5 ? "#fa8c16" : "#8c8c8c", fontWeight: 500
      }}>{d}</div>
    ));
    const blanks = Array.from({ length: firstDow - 1 }, (_, i) => (
      <div key={`blank-${i}`} style={{ width: 36 }} />
    ));
    const dateCells = allDates.map((date) => {
      const checked  = selectedDates.includes(date);
      const weekend  = isWeekendDate(date);
      const isToday  = date === dayjs().format("YYYY-MM-DD");
      return (
        <Tooltip key={date} title={date}>
          <div
            onClick={() => toggleDate(date)}
            style={{
              width: 36, height: 28, cursor: "pointer", borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, userSelect: "none",
              background: checked ? (weekend ? "#fff7e6" : "#e6f4ff") : "transparent",
              border: checked ? `1px solid ${weekend ? "#fa8c16" : "#1677ff"}` : "1px solid transparent",
              color: isToday ? "#1677ff" : weekend ? "#fa8c16" : undefined,
              fontWeight: isToday ? 700 : 400,
              transition: "all 0.12s"
            }}
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
      title={<Space><CheckSquareOutlined />批量排班</Space>}
      open={open} onCancel={onClose}
      onOk={() => { void handleApply(); }}
      okText="批量应用" cancelText="取消"
      confirmLoading={saving} destroyOnHidden
      width={viewMode === "month" ? 520 : 480}
    >
      {/* Selected agents */}
      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>已选坐席：</Typography.Text>
        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {agentNames.map((name) => <Tag key={name}>{name}</Tag>)}
          {agentNames.length === 0 && <Typography.Text type="secondary">（无）</Typography.Text>}
        </div>
      </div>

      {/* Date selector */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>应用到日期：</Typography.Text>
          <Space size={4}>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates([...allDates])}>全选</Button>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates(workDays)}>仅工作日</Button>
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setSelectedDates([])}>清空</Button>
          </Space>
        </div>
        {renderDateSelector()}
        <div style={{ marginTop: 6 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            已选 {selectedDates.length} / {allDates.length} 天
          </Typography.Text>
        </div>
      </div>

      {/* Shift type */}
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>排班类型：</Typography.Text>
        <Radio.Group value={status} onChange={(e) => setStatus(e.target.value as "scheduled" | "off" | "leave")}
          optionType="button" buttonStyle="solid"
        >
          {SHIFT_STATUS_OPTS.map((o) => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
        </Radio.Group>
      </div>

      {status === "scheduled" && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>班次模板（可选）：</Typography.Text>
          <Select style={{ width: "100%" }} placeholder="选择班次模板" allowClear
            value={shiftId} onChange={(v) => setShiftId(v ?? null)}
            options={schedules.filter((s) => s.isActive).map((s) => ({
              value: s.shiftId, label: `${s.name}（${s.startTime}–${s.endTime}）`
            }))}
          />
        </div>
      )}
    </Modal>
  );
}

// ─── Schedule pane (week + month, dept/team filter) ────────────────────────

function SchedulePane({
  agents, agentShifts, schedules, departments, teams,
  fromDate, viewMode, loading,
  onChangeDate, onChangeViewMode, onReload
}: {
  agents: AgentProfile[];
  agentShifts: AgentShiftItem[];
  schedules: ShiftScheduleItem[];
  departments: DepartmentItem[];
  teams: TeamItem[];
  fromDate: string;
  viewMode: "week" | "month";
  loading: boolean;
  onChangeDate: (date: string) => void;
  onChangeViewMode: (mode: "week" | "month") => void;
  onReload: () => Promise<void>;
}) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkModalOpen, setBulkModalOpen]     = useState(false);

  // ── filter state ──────────────────────────────────────────────────────
  const [filterSearch, setFilterSearch]     = useState("");
  const [filterDeptId, setFilterDeptId]     = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId]     = useState<string | null>(null);

  // When dept changes, clear team selection
  const handleDeptChange = (v: string | null) => { setFilterDeptId(v); setFilterTeamId(null); };

  // ── date range ────────────────────────────────────────────────────────
  const days = useMemo(() =>
    viewMode === "week" ? weekDays(fromDate) : monthDays(fromDate),
    [fromDate, viewMode]
  );

  const today = dayjs().format("YYYY-MM-DD");

  // ── team options filtered by dept ─────────────────────────────────────
  const teamOptions = useMemo(() => {
    return teams
      .filter((t) => t.isActive && (!filterDeptId || t.departmentId === filterDeptId))
      .map((t) => ({ value: t.teamId, label: t.name }));
  }, [teams, filterDeptId]);

  // ── agent-id sets from dept/team filters ──────────────────────────────
  const agentIdsByDept = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const team of teams) {
      if (!team.departmentId) continue;
      if (!map.has(team.departmentId)) map.set(team.departmentId, new Set());
      for (const m of team.members) map.get(team.departmentId)!.add(m.agentId);
    }
    return map;
  }, [teams]);

  const agentIdsByTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const team of teams) {
      map.set(team.teamId, new Set(team.members.map((m) => m.agentId)));
    }
    return map;
  }, [teams]);

  // ── filtered agents ───────────────────────────────────────────────────
  const filteredAgents = useMemo(() => {
    let list = agents;
    if (filterTeamId) {
      const ids = agentIdsByTeam.get(filterTeamId);
      if (ids) list = list.filter((a) => ids.has(a.agentId));
    } else if (filterDeptId) {
      const ids = agentIdsByDept.get(filterDeptId);
      if (ids) list = list.filter((a) => ids.has(a.agentId));
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase();
      list = list.filter((a) =>
        a.displayName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [agents, filterDeptId, filterTeamId, filterSearch, agentIdsByDept, agentIdsByTeam]);

  // ── reset row selection when agents list changes ──────────────────────
  useEffect(() => { setSelectedRowKeys([]); }, [filteredAgents]);

  // ── shift index: agentId → date → shift ──────────────────────────────
  const shiftIndex = useMemo(() => {
    const map = new Map<string, Map<string, AgentShiftItem>>();
    for (const s of agentShifts) {
      if (!map.has(s.agentId)) map.set(s.agentId, new Map());
      map.get(s.agentId)!.set(s.shiftDate, s);
    }
    return map;
  }, [agentShifts]);

  // ── navigation ─────────────────────────────────────────────────────────
  const isWeek = viewMode === "week";

  const prevDate  = isWeek
    ? dayjs(fromDate).subtract(7, "day").format("YYYY-MM-DD")
    : dayjs(fromDate).subtract(1, "month").startOf("month").format("YYYY-MM-DD");
  const nextDate  = isWeek
    ? dayjs(fromDate).add(7, "day").format("YYYY-MM-DD")
    : dayjs(fromDate).add(1, "month").startOf("month").format("YYYY-MM-DD");
  const resetDate = isWeek
    ? dayjs().isoWeekday(1).format("YYYY-MM-DD")
    : dayjs().startOf("month").format("YYYY-MM-DD");

  const periodLabel = isWeek
    ? `${dayjs(days[0]).format("M月D日")} — ${dayjs(days[days.length - 1]).format("M月D日")}`
    : dayjs(fromDate).format("YYYY年M月");

  // ── copy to next period ──────────────────────────────────────────────
  const handleCopyToNext = async () => {
    if (agentShifts.length === 0) { message.info("当前无排班数据可复制"); return; }
    const offset = isWeek ? { value: 7, unit: "day" as const } : { value: 1, unit: "month" as const };
    try {
      const items = agentShifts.map((s) => ({
        agentId:   s.agentId,
        shiftId:   s.shiftId ?? undefined,
        shiftDate: dayjs(s.shiftDate).add(offset.value, offset.unit).format("YYYY-MM-DD"),
        status:    s.status
      }));
      const result = await bulkUpsertAgentShifts(items);
      message.success(`已复制 ${result.saved} 条排班到${isWeek ? "下一周" : "下个月"}`);
      onChangeDate(nextDate);
    } catch (err) { message.error((err as Error).message); }
  };

  // ── columns ────────────────────────────────────────────────────────────
  const cellWidth = isWeek ? 90 : 40;

  const columns = [
    {
      title: (
        <Space>
          <Typography.Text strong style={{ fontSize: 13 }}>坐席</Typography.Text>
          {selectedRowKeys.length > 0 && <Tag color="blue">{selectedRowKeys.length}人</Tag>}
        </Space>
      ),
      key: "agent", width: 160, fixed: "left" as const,
      render: (_: unknown, agent: AgentProfile) => (
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>{agent.displayName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: "block" }}>{agent.email}</Typography.Text>
        </div>
      )
    },
    ...days.map((date) => {
      const dow       = dayjs(date).isoWeekday(); // 1=Mon
      const weekend   = dow >= 6;
      const isToday   = date === today;
      const weekendBg = weekend ? "#fffbe6" : undefined;

      return {
        title: (
          <div style={{ textAlign: "center" as const, lineHeight: 1.3 }}>
            <div style={{ fontSize: 10, color: weekend ? "#fa8c16" : "#8c8c8c" }}>
              {DAY_SHORT[dow - 1]}
            </div>
            <div style={{
              fontSize: isWeek ? 13 : 11,
              fontWeight: isToday ? 700 : 400,
              color: isToday ? "#1677ff" : weekend ? "#fa8c16" : undefined,
              background: isToday ? "#e6f4ff" : "transparent",
              borderRadius: 4, padding: "0 2px"
            }}>
              {isWeek ? dayjs(date).format("M/D") : dayjs(date).date()}
            </div>
          </div>
        ),
        key:   date,
        width: cellWidth,
        onHeaderCell: () => ({ style: { background: weekendBg, padding: isWeek ? undefined : "4px 2px" } }),
        onCell:       () => ({ style: { background: weekendBg, padding: isWeek ? undefined : "2px 2px" } }),
        render: (_: unknown, agent: AgentProfile) => (
          <ShiftCellPopover
            agentId={agent.agentId} date={date}
            currentShift={shiftIndex.get(agent.agentId)?.get(date)}
            schedules={schedules} onSaved={onReload}
            compact={!isWeek}
          />
        )
      };
    })
  ];

  const deptOptions = departments
    .filter((d) => d.isActive)
    .map((d) => ({ value: d.departmentId, label: d.name }));

  return (
    <>
      {/* ── Toolbar row 1: navigation + view toggle ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Radio.Group
            size="small" value={viewMode}
            onChange={(e) => onChangeViewMode(e.target.value as "week" | "month")}
            optionType="button" buttonStyle="solid"
          >
            <Radio.Button value="week"><ClockCircleOutlined /> 周</Radio.Button>
            <Radio.Button value="month"><CalendarOutlined /> 月</Radio.Button>
          </Radio.Group>

          <Button icon={<ArrowLeftOutlined />} size="small" onClick={() => onChangeDate(prevDate)}>
            {isWeek ? "上一周" : "上月"}
          </Button>
          <Typography.Text strong style={{ minWidth: 140, textAlign: "center" as const }}>{periodLabel}</Typography.Text>
          <Button icon={<ArrowRightOutlined />} size="small" onClick={() => onChangeDate(nextDate)}>
            {isWeek ? "下一周" : "下月"}
          </Button>
          <Button size="small"
            type={fromDate === resetDate ? "primary" : "default"}
            onClick={() => onChangeDate(resetDate)}
          >
            {isWeek ? "本周" : "本月"}
          </Button>
          <Popconfirm
            title={`复制到${isWeek ? "下一周" : "下个月"}`}
            description={`将当前所有排班数据复制到${isWeek ? "下一周" : "下个月"}（已有排班将被覆盖）。`}
            onConfirm={() => { void handleCopyToNext(); }}
            okText="确认复制" cancelText="取消"
          >
            <Button size="small">复制到{isWeek ? "下周" : "下月"}</Button>
          </Popconfirm>
        </Space>

        {/* Legend */}
        <Space size={8}>
          {Object.entries(SHIFT_STATUS_TAG).map(([k, v]) => (
            <Space key={k} size={4}>
              <span style={{ width: 10, height: 10, background: v.bg, border: `1px solid ${v.dot}80`, borderRadius: 2, display: "inline-block" }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{v.label}</Typography.Text>
            </Space>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>— 未设置</Typography.Text>
        </Space>
      </div>

      {/* ── Toolbar row 2: filter + bulk action ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Input
            size="small" allowClear
            prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
            placeholder="搜索坐席姓名 / 邮箱"
            style={{ width: 180 }}
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
          <Select
            size="small" allowClear placeholder="全部部门"
            style={{ width: 140 }}
            value={filterDeptId}
            onChange={handleDeptChange}
            options={deptOptions}
            suffixIcon={<TeamOutlined />}
          />
          <Select
            size="small" allowClear placeholder="全部团队"
            style={{ width: 140 }}
            value={filterTeamId}
            onChange={(v) => setFilterTeamId(v ?? null)}
            options={teamOptions}
            disabled={teamOptions.length === 0}
            suffixIcon={<TeamOutlined />}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            显示 {filteredAgents.length} / {agents.length} 人
          </Typography.Text>
        </Space>

        <Space>
          {selectedRowKeys.length > 0 && (
            <Button type="primary" size="small" icon={<CheckSquareOutlined />}
              onClick={() => setBulkModalOpen(true)}
            >
              批量排班（{selectedRowKeys.length}人）
            </Button>
          )}
          {selectedRowKeys.length > 0 && (
            <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
          )}
          {filteredAgents.length > 0 && selectedRowKeys.length === 0 && (
            <Button size="small"
              onClick={() => setSelectedRowKeys(filteredAgents.map((a) => a.agentId))}
            >
              全选当前 {filteredAgents.length} 人
            </Button>
          )}
        </Space>
      </div>

      <Table<AgentProfile>
        rowKey="agentId" loading={loading} dataSource={filteredAgents}
        columns={columns} pagination={false}
        scroll={{ x: 160 + cellWidth * days.length }}
        locale={{ emptyText: "暂无匹配坐席" }}
        size="small"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys, columnWidth: 40 }}
      />

      <BulkScheduleModal
        open={bulkModalOpen}
        agents={filteredAgents}
        selectedAgentIds={selectedRowKeys as string[]}
        schedules={schedules}
        allDates={days}
        viewMode={viewMode}
        onClose={() => setBulkModalOpen(false)}
        onSaved={onReload}
      />
    </>
  );
}

// ─── Break modal ─────────────────────────────────────────────────────────────

function BreakModal({
  agentId, agentName, open, onClose, onSaved
}: {
  agentId: string;
  agentName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [breakType, setBreakType] = useState<"break" | "lunch" | "training">("break");
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);

  useEffect(() => { if (open) { setBreakType("break"); setNote(""); } }, [open]);

  const handleStart = async () => {
    setSaving(true);
    try {
      await startAgentBreak({ agentId, breakType, note: note || undefined });
      message.success(`${agentName} 已进入休息`);
      onClose();
      await onSaved();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={<Space><CoffeeOutlined />发起休息 — {agentName}</Space>}
      open={open} onCancel={onClose}
      onOk={() => { void handleStart(); }}
      okText="确认" cancelText="取消"
      confirmLoading={saving} destroyOnHidden width={360}
    >
      <div style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>休息类型：</Typography.Text>
        <Radio.Group value={breakType}
          onChange={(e) => setBreakType(e.target.value as "break" | "lunch" | "training")}
          optionType="button" buttonStyle="solid"
        >
          {BREAK_TYPE_OPTS.map((o) => <Radio.Button key={o.value} value={o.value}>{o.label}</Radio.Button>)}
        </Radio.Group>
      </div>
      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>备注（可选）：</Typography.Text>
        <Input placeholder="如：处理紧急事项..." value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} />
      </div>
    </Modal>
  );
}

// ─── Tab 3: Real-time presence ─────────────────────────────────────────────

function PresencePane({
  presence, loading, onReload
}: {
  presence: AgentPresenceResponse | null;
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [endingId, setEndingId]   = useState<string | null>(null);
  const [breakModal, setBreakModal] = useState<{ agentId: string; agentName: string } | null>(null);

  const handleEndBreak = async (agentId: string) => {
    setEndingId(agentId);
    try {
      await endAgentBreak(agentId);
      message.success("已结束休息");
      await onReload();
    } catch (err) {
      message.error((err as Error).message);
    } finally { setEndingId(null); }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        {(["total", "online", "busy", "away", "offline"] as const).map((key) => (
          <div key={key} style={{
            background: "#fafafa", border: "1px solid #f0f0f0",
            borderRadius: 8, padding: "12px 20px", minWidth: 90, textAlign: "center"
          }}>
            <Statistic
              title={key === "total" ? "总坐席" : STATUS_LABELS[key]}
              value={presence?.summary[key as keyof typeof presence.summary] ?? 0}
              valueStyle={key !== "total" ? { color: STATUS_COLORS[key], fontSize: 22 } : { fontSize: 22 }}
              loading={loading}
            />
          </div>
        ))}
      </div>

      <Table
        rowKey="agentId" loading={loading} dataSource={presence?.items ?? []}
        pagination={false} locale={{ emptyText: "暂无坐席数据" }}
        columns={[
          {
            title: "坐席", key: "name",
            render: (_, row: AgentPresenceResponse["items"][number]) => (
              <div>
                <Typography.Text strong>{row.displayName}</Typography.Text>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{row.email}</Typography.Text>
              </div>
            )
          },
          {
            title: "状态", dataIndex: "status", width: 100,
            render: (v: string) => <Badge color={STATUS_COLORS[v] ?? "#d9d9d9"} text={STATUS_LABELS[v] ?? v} />
          },
          {
            title: "活跃会话", dataIndex: "activeConversations", width: 90,
            render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : <Typography.Text type="secondary">0</Typography.Text>
          },
          {
            title: "最后心跳", dataIndex: "lastSeenAt", width: 160,
            render: (v: string | null) => {
              if (!v) return <Typography.Text type="secondary">—</Typography.Text>;
              const diffMin = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
              const label = diffMin < 1 ? "刚刚" : diffMin < 60 ? `${diffMin}分钟前` : `${Math.floor(diffMin / 60)}小时前`;
              return <Tooltip title={new Date(v).toLocaleString()}><Typography.Text type="secondary">{label}</Typography.Text></Tooltip>;
            }
          },
          {
            title: "操作", key: "action", width: 130,
            render: (_, row: AgentPresenceResponse["items"][number]) => {
              if (row.status === "away") {
                return (
                  <Button size="small" loading={endingId === row.agentId}
                    onClick={() => { void handleEndBreak(row.agentId); }}
                  >结束休息</Button>
                );
              }
              return (
                <Button size="small" type="dashed" icon={<CoffeeOutlined />}
                  disabled={row.status === "offline"}
                  onClick={() => setBreakModal({ agentId: row.agentId, agentName: row.displayName })}
                >发起休息</Button>
              );
            }
          }
        ]}
      />

      {breakModal && (
        <BreakModal
          agentId={breakModal.agentId} agentName={breakModal.agentName}
          open={Boolean(breakModal)} onClose={() => setBreakModal(null)} onSaved={onReload}
        />
      )}
    </>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────

export function ShiftsTab() {
  const [loading, setLoading]       = useState(false);
  const [schedules, setSchedules]   = useState<ShiftScheduleItem[]>([]);
  const [agentShifts, setAgentShifts] = useState<AgentShiftItem[]>([]);
  const [presence, setPresence]     = useState<AgentPresenceResponse | null>(null);
  const [agents, setAgents]         = useState<AgentProfile[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams]           = useState<TeamItem[]>([]);
  const [activeTab, setActiveTab]   = useState("schedule");
  const [viewMode, setViewMode]     = useState<"week" | "month">("week");
  const [fromDate, setFromDate]     = useState(() =>
    dayjs().isoWeekday(1).format("YYYY-MM-DD")
  );

  // Reload shift data when fromDate / viewMode changes
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const from = viewMode === "month"
        ? dayjs(fromDate).startOf("month").format("YYYY-MM-DD")
        : fromDate;
      const to = viewMode === "month"
        ? dayjs(fromDate).endOf("month").format("YYYY-MM-DD")
        : dayjs(fromDate).add(6, "day").format("YYYY-MM-DD");

      const [s, p, a, sh] = await Promise.all([
        listShiftSchedules(),
        getAgentPresence(),
        listAgents(),
        listAgentShifts({ from, to })
      ]);
      setSchedules(s);
      setPresence(p);
      setAgents(a);
      setAgentShifts(sh);
    } catch (err) {
      message.error((err as Error).message);
    } finally { setLoading(false); }
  }, [fromDate, viewMode]);

  useEffect(() => { void reload(); }, [reload]);

  // Load org structure once (independent of date range)
  useEffect(() => {
    void Promise.all([listDepartments(), listTeams()])
      .then(([deps, tms]) => { setDepartments(deps); setTeams(tms); })
      .catch(() => {/* non-critical, ignore */});
  }, []);

  const handleChangeViewMode = (mode: "week" | "month") => {
    // Adjust fromDate anchor when switching modes
    if (mode === "month") {
      setFromDate(dayjs(fromDate).startOf("month").format("YYYY-MM-DD"));
    } else {
      setFromDate(dayjs(fromDate).isoWeekday(1).format("YYYY-MM-DD"));
    }
    setViewMode(mode);
  };

  return (
    <Tabs
      activeKey={activeTab} onChange={setActiveTab}
      tabBarExtraContent={
        <Button icon={<ReloadOutlined />} size="small" loading={loading}
          onClick={() => { void reload(); }}
        >刷新</Button>
      }
      items={[
        {
          key: "schedule",
          label: <Space><span>📅</span>排班表</Space>,
          children: (
            <SchedulePane
              agents={agents} agentShifts={agentShifts} schedules={schedules}
              departments={departments} teams={teams}
              fromDate={fromDate} viewMode={viewMode} loading={loading}
              onChangeDate={setFromDate}
              onChangeViewMode={handleChangeViewMode}
              onReload={reload}
            />
          )
        },
        {
          key: "definitions",
          label: (
            <Space>
              <ClockCircleOutlined />
              班次定义
              {schedules.length > 0 && <Tag>{schedules.length}</Tag>}
            </Space>
          ),
          children: (
            <ShiftDefinitionsPane schedules={schedules} loading={loading} onReload={reload} />
          )
        },
        {
          key: "presence",
          label: (
            <Space>
              <WifiOutlined />
              实时状态
              {(presence?.summary.online ?? 0) > 0 && (
                <Badge count={presence?.summary.online} color="#52c41a" />
              )}
            </Space>
          ),
          children: (
            <PresencePane presence={presence} loading={loading} onReload={reload} />
          )
        }
      ]}
    />
  );
}
