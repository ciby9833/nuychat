import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message
} from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createSlaDefinition,
  createSlaTriggerPolicy,
  listSlaBreaches,
  listSlaDefinitions,
  listSlaTriggerPolicies,
  patchSlaBreachStatus,
  patchSlaDefinition,
  patchSlaTriggerPolicy
} from "../../api";
import type {
  SlaBreachItem,
  SlaBreachListResponse,
  SlaDefinitionItem,
  SlaTriggerAction,
  SlaTriggerPolicyItem
} from "../../types";

type BreachFilter = {
  status?: "open" | "acknowledged" | "resolved";
  metric?: string;
  from?: string;
  to?: string;
};

const ACTION_OPTIONS = [
  { value: "alert", label: "提醒" },
  { value: "escalate", label: "升级" },
  { value: "reassign", label: "重新分配" },
  { value: "close_case", label: "关闭事项" }
] as const;

const FOLLOW_UP_CLOSE_MODES = [
  { value: "waiting_customer", label: "等待客户" },
  { value: "semantic", label: "语义结束" }
] as const;

export function SlaTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [definitions, setDefinitions] = useState<SlaDefinitionItem[]>([]);
  const [triggerPolicies, setTriggerPolicies] = useState<SlaTriggerPolicyItem[]>([]);
  const [breaches, setBreaches] = useState<SlaBreachListResponse | null>(null);
  const [filters, setFilters] = useState<BreachFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<SlaDefinitionItem | null>(null);
  const [editingTriggerPolicy, setEditingTriggerPolicy] = useState<SlaTriggerPolicyItem | null>(null);
  const [definitionForm] = Form.useForm<{
    name: string;
    priority: string;
    firstResponseTargetSec: number;
    assignmentAcceptTargetSec: number | null;
    followUpTargetSec: number | null;
    resolutionTargetSec: number;
  }>();
  const [triggerForm] = Form.useForm<{
    name: string;
    priority: string;
    firstResponseActions: SlaTriggerAction[];
    assignmentAcceptActions: SlaTriggerAction[];
    followUpActions: SlaTriggerAction[];
    resolutionActions: SlaTriggerAction[];
  }>();

  const load = useCallback(async (nextFilters: BreachFilter = filters) => {
    setLoading(true);
    try {
      const [nextDefinitions, nextTriggerPolicies, nextBreaches] = await Promise.all([
        listSlaDefinitions(),
        listSlaTriggerPolicies(),
        listSlaBreaches({ ...nextFilters, page: 1, pageSize: 20 })
      ]);
      setDefinitions(nextDefinitions);
      setTriggerPolicies(nextTriggerPolicies);
      setBreaches(nextBreaches);
    } catch (error) {
      message.error(`加载 SLA 数据失败: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = breaches?.summary ?? { total: 0, open: 0, acknowledged: 0, resolved: 0, avgBreachSec: 0 };

  const openCreateDefinition = () => {
    setEditingDefinition(null);
    definitionForm.setFieldsValue({
      name: "",
      priority: "standard",
      firstResponseTargetSec: 300,
      assignmentAcceptTargetSec: 300,
      followUpTargetSec: 1800,
      resolutionTargetSec: 7200
    });
    setDefinitionOpen(true);
  };

  const openEditDefinition = (item: SlaDefinitionItem) => {
    setEditingDefinition(item);
    definitionForm.setFieldsValue({
      name: item.name,
      priority: item.priority,
      firstResponseTargetSec: item.firstResponseTargetSec,
      assignmentAcceptTargetSec: item.assignmentAcceptTargetSec,
      followUpTargetSec: item.followUpTargetSec,
      resolutionTargetSec: item.resolutionTargetSec
    });
    setDefinitionOpen(true);
  };

  const openCreateTriggerPolicy = () => {
    setEditingTriggerPolicy(null);
    triggerForm.setFieldsValue({
      name: "",
      priority: "standard",
      firstResponseActions: [{ type: "alert" }],
      assignmentAcceptActions: [{ type: "alert" }, { type: "reassign" }],
      followUpActions: [{ type: "alert" }],
      resolutionActions: [{ type: "alert" }]
    });
    setTriggerOpen(true);
  };

  const openEditTriggerPolicy = (item: SlaTriggerPolicyItem) => {
    setEditingTriggerPolicy(item);
    triggerForm.setFieldsValue({
      name: item.name,
      priority: item.priority,
      firstResponseActions: item.firstResponseActions,
      assignmentAcceptActions: item.assignmentAcceptActions,
      followUpActions: item.followUpActions,
      resolutionActions: item.resolutionActions
    });
    setTriggerOpen(true);
  };

  const onSaveDefinition = async () => {
    const values = await definitionForm.validateFields();
    setSaving(true);
    try {
      if (editingDefinition) {
        await patchSlaDefinition(editingDefinition.definitionId, values);
        message.success("SLA 定义更新成功");
      } else {
        await createSlaDefinition(values);
        message.success("SLA 定义创建成功");
      }
      setDefinitionOpen(false);
      setEditingDefinition(null);
      await load();
    } catch (error) {
      message.error(`保存失败: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onSaveTriggerPolicy = async () => {
    const values = await triggerForm.validateFields();
    setSaving(true);
    try {
      if (editingTriggerPolicy) {
        await patchSlaTriggerPolicy(editingTriggerPolicy.triggerPolicyId, values);
        message.success("触发策略更新成功");
      } else {
        await createSlaTriggerPolicy(values);
        message.success("触发策略创建成功");
      }
      setTriggerOpen(false);
      setEditingTriggerPolicy(null);
      await load();
    } catch (error) {
      message.error(`保存失败: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onToggleDefinition = async (item: SlaDefinitionItem) => {
    setSaving(true);
    try {
      await patchSlaDefinition(item.definitionId, { isActive: !item.isActive });
      await load();
    } catch (error) {
      message.error(`更新失败: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onToggleTriggerPolicy = async (item: SlaTriggerPolicyItem) => {
    setSaving(true);
    try {
      await patchSlaTriggerPolicy(item.triggerPolicyId, { isActive: !item.isActive });
      await load();
    } catch (error) {
      message.error(`更新失败: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onUpdateBreachStatus = async (item: SlaBreachItem, status: "open" | "acknowledged" | "resolved") => {
    try {
      await patchSlaBreachStatus(item.breachId, status);
      await load(filters);
    } catch (error) {
      message.error(`更新违约状态失败: ${(error as Error).message}`);
    }
  };

  const definitionColumns = useMemo(
    () => [
      { title: "定义名称", dataIndex: "name", key: "name" },
      { title: "优先级", dataIndex: "priority", key: "priority", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
      { title: "首响时限(秒)", dataIndex: "firstResponseTargetSec", key: "firstResponseTargetSec" },
      { title: "接手时限(秒)", dataIndex: "assignmentAcceptTargetSec", key: "assignmentAcceptTargetSec", render: (value: number | null) => value ?? "-" },
      { title: "跟进时限(秒)", dataIndex: "followUpTargetSec", key: "followUpTargetSec", render: (value: number | null) => value ?? "-" },
      { title: "解决时限(秒)", dataIndex: "resolutionTargetSec", key: "resolutionTargetSec" },
      { title: "状态", dataIndex: "isActive", key: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "生效中" : "已停用"}</Tag> },
      {
        title: "操作",
        key: "actions",
        render: (_: unknown, row: SlaDefinitionItem) => (
          <Space>
            <Button size="small" onClick={() => void onToggleDefinition(row)} loading={saving}>
              {row.isActive ? "停用" : "启用"}
            </Button>
            <Button size="small" onClick={() => openEditDefinition(row)}>
              编辑
            </Button>
          </Space>
        )
      }
    ],
    [saving]
  );

  const triggerColumns = useMemo(
    () => [
      { title: "策略名称", dataIndex: "name", key: "name" },
      { title: "优先级", dataIndex: "priority", key: "priority", render: (value: string) => <Tag>{value.toUpperCase()}</Tag> },
      { title: "首响违约动作", dataIndex: "firstResponseActions", key: "firstResponseActions", render: renderActionTags },
      { title: "未接手违约动作", dataIndex: "assignmentAcceptActions", key: "assignmentAcceptActions", render: renderActionTags },
      { title: "跟进违约动作", dataIndex: "followUpActions", key: "followUpActions", render: renderActionTags },
      { title: "解决违约动作", dataIndex: "resolutionActions", key: "resolutionActions", render: renderActionTags },
      { title: "状态", dataIndex: "isActive", key: "isActive", render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "生效中" : "已停用"}</Tag> },
      {
        title: "操作",
        key: "actions",
        render: (_: unknown, row: SlaTriggerPolicyItem) => (
          <Space>
            <Button size="small" onClick={() => void onToggleTriggerPolicy(row)} loading={saving}>
              {row.isActive ? "停用" : "启用"}
            </Button>
            <Button size="small" onClick={() => openEditTriggerPolicy(row)}>
              编辑
            </Button>
          </Space>
        )
      }
    ],
    [saving]
  );

  const breachColumns = useMemo(
    () => [
      { title: "触发时间", dataIndex: "createdAt", key: "createdAt", render: (v: string) => dayjs(v).format("MM-DD HH:mm:ss") },
      { title: "指标", dataIndex: "metric", key: "metric", render: (value: string) => <Tag>{value}</Tag> },
      { title: "SLA 定义", dataIndex: "definitionName", key: "definitionName", render: (v: string | null) => v ?? "-" },
      { title: "动作策略", dataIndex: "triggerPolicyName", key: "triggerPolicyName", render: (v: string | null) => v ?? "-" },
      { title: "坐席", dataIndex: "agentName", key: "agentName", render: (v: string | null) => v ?? "-" },
      { title: "事项ID", dataIndex: "caseId", key: "caseId", render: (v: string | null) => (v ? <code>{v.slice(0, 8)}</code> : "-") },
      { title: "会话ID", dataIndex: "conversationId", key: "conversationId", render: (v: string | null) => (v ? <code>{v.slice(0, 8)}</code> : "-") },
      { title: "目标(秒)", dataIndex: "targetSec", key: "targetSec" },
      { title: "实际(秒)", dataIndex: "actualSec", key: "actualSec" },
      { title: "超时(秒)", dataIndex: "breachSec", key: "breachSec" },
      { title: "严重度", dataIndex: "severity", key: "severity", render: (value: "warning" | "critical") => <Tag color={value === "critical" ? "red" : "orange"}>{value}</Tag> },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        render: (value: "open" | "acknowledged" | "resolved") => value === "open" ? <Tag color="red">OPEN</Tag> : value === "acknowledged" ? <Tag color="blue">ACK</Tag> : <Tag color="green">RESOLVED</Tag>
      },
      {
        title: "处置",
        key: "actions",
        render: (_: unknown, row: SlaBreachItem) => (
          <Space>
            <Button size="small" disabled={row.status !== "open"} onClick={() => void onUpdateBreachStatus(row, "acknowledged")}>确认</Button>
            <Button size="small" type="primary" ghost disabled={row.status === "resolved"} onClick={() => void onUpdateBreachStatus(row, "resolved")}>解决</Button>
          </Space>
        )
      }
    ],
    []
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={16}>
        <Col xs={24} md={6}><Card><Statistic title="违约总数" value={summary.total} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="待处理" value={summary.open} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="已确认" value={summary.acknowledged} /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="平均超时(秒)" value={summary.avgBreachSec} /></Card></Col>
      </Row>

      <Card title="SLA 违约查询" extra={<Button onClick={() => void load(filters)}>刷新</Button>}>
        <Space wrap size={12}>
          <Select allowClear style={{ width: 160 }} placeholder="违约状态" value={filters.status} options={[{ value: "open", label: "待处理" }, { value: "acknowledged", label: "已确认" }, { value: "resolved", label: "已解决" }]} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
          <Select allowClear style={{ width: 180 }} placeholder="指标" value={filters.metric} options={[{ value: "first_response", label: "首响超时" }, { value: "assignment_accept", label: "未接手超时" }, { value: "follow_up", label: "跟进超时" }, { value: "resolution", label: "解决超时" }]} onChange={(value) => setFilters((prev) => ({ ...prev, metric: value }))} />
          <DatePicker style={{ width: 140 }} value={filters.from ? dayjs(filters.from) : null} onChange={(value) => setFilters((prev) => ({ ...prev, from: value ? value.format("YYYY-MM-DD") : undefined }))} />
          <DatePicker style={{ width: 140 }} value={filters.to ? dayjs(filters.to) : null} onChange={(value) => setFilters((prev) => ({ ...prev, to: value ? value.format("YYYY-MM-DD") : undefined }))} />
          <Button type="primary" onClick={() => void load(filters)} loading={loading}>查询</Button>
        </Space>
      </Card>

      <Card title="SLA 定义" extra={<Button type="primary" onClick={openCreateDefinition}>新建 SLA 定义</Button>}>
        <Table<SlaDefinitionItem> rowKey="definitionId" loading={loading || saving} pagination={false} dataSource={definitions} columns={definitionColumns} />
      </Card>

      <Card title="触发策略" extra={<Button type="primary" onClick={openCreateTriggerPolicy}>新建触发策略</Button>}>
        <Table<SlaTriggerPolicyItem> rowKey="triggerPolicyId" loading={loading || saving} pagination={false} dataSource={triggerPolicies} columns={triggerColumns} />
      </Card>

      <Card title="SLA 违约列表">
        <Table<SlaBreachItem>
          rowKey="breachId"
          loading={loading}
          dataSource={breaches?.items ?? []}
          columns={breachColumns}
          pagination={{
            current: breaches?.page ?? 1,
            pageSize: breaches?.pageSize ?? 20,
            total: breaches?.total ?? 0,
            onChange: (page, pageSize) => {
              void (async () => {
                setLoading(true);
                try {
                  const data = await listSlaBreaches({ ...filters, page, pageSize });
                  setBreaches(data);
                } finally {
                  setLoading(false);
                }
              })();
            }
          }}
        />
      </Card>

      <Modal title={editingDefinition ? "编辑 SLA 定义" : "新建 SLA 定义"} open={definitionOpen} onCancel={() => { setDefinitionOpen(false); setEditingDefinition(null); }} onOk={() => void onSaveDefinition()} okButtonProps={{ loading: saving }} destroyOnHidden>
        <Form form={definitionForm} layout="vertical">
          <Form.Item name="name" label="定义名称" rules={[{ required: true, message: "请输入定义名称" }]}><Input /></Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select options={[{ value: "vip", label: "VIP" }, { value: "standard", label: "STANDARD" }]} /></Form.Item>
          <Form.Item name="firstResponseTargetSec" label="首响时限(秒)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="assignmentAcceptTargetSec" label="接手时限(秒)" extra="已分配但尚未真正接手的最长允许时长。"><InputNumber min={1} style={{ width: "100%" }} placeholder="留空表示不监控未接手" /></Form.Item>
          <Form.Item name="followUpTargetSec" label="跟进时限(秒)" extra="已处理过后，进入等待客户/等待关闭阶段的最长允许时长。"><InputNumber min={1} style={{ width: "100%" }} placeholder="留空表示不监控跟进超时" /></Form.Item>
          <Form.Item name="resolutionTargetSec" label="解决时限(秒)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingTriggerPolicy ? "编辑触发策略" : "新建触发策略"} open={triggerOpen} onCancel={() => { setTriggerOpen(false); setEditingTriggerPolicy(null); }} onOk={() => void onSaveTriggerPolicy()} okButtonProps={{ loading: saving }} destroyOnHidden width={720}>
        <Form form={triggerForm} layout="vertical">
          <Form.Item name="name" label="策略名称" rules={[{ required: true, message: "请输入策略名称" }]}><Input /></Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{ required: true }]}><Select options={[{ value: "vip", label: "VIP" }, { value: "standard", label: "STANDARD" }]} /></Form.Item>
          <Form.List name="firstResponseActions">{(fields, { add, remove }) => renderActionEditor("首响违约动作", fields, add, remove)}</Form.List>
          <Form.List name="assignmentAcceptActions">{(fields, { add, remove }) => renderActionEditor("未接手违约动作", fields, add, remove)}</Form.List>
          <Form.List name="followUpActions">{(fields, { add, remove }) => renderActionEditor("跟进违约动作", fields, add, remove, true)}</Form.List>
          <Form.List name="resolutionActions">{(fields, { add, remove }) => renderActionEditor("解决违约动作", fields, add, remove)}</Form.List>
        </Form>
      </Modal>
    </Space>
  );
}

function renderActionTags(actions: SlaTriggerAction[]) {
  if (!actions.length) return "-";
  return (
    <Space wrap>
      {actions.map((action, index) => (
        <Tag key={`${action.type}-${action.mode ?? "none"}-${index}`}>
          {action.type === "close_case" && action.mode ? `关闭(${action.mode})` : action.type}
        </Tag>
      ))}
    </Space>
  );
}

function renderActionEditor(
  label: string,
  fields: Array<{ key: number; name: number }>,
  add: (defaultValue?: SlaTriggerAction, index?: number) => void,
  remove: (index: number) => void,
  allowCloseMode = false
) {
  return (
    <Card size="small" title={label} style={{ marginBottom: 12 }} extra={<Button size="small" onClick={() => add({ type: "alert" })}>添加动作</Button>}>
      <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => (
          <Space key={field.key} align="start" style={{ width: "100%" }} wrap>
            <Form.Item name={[field.name, "type"]} rules={[{ required: true }]} style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
              <Select options={[...ACTION_OPTIONS]} style={{ width: "100%" }} popupMatchSelectWidth={false} />
            </Form.Item>
            {allowCloseMode ? (
              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const type = getFieldValue(["followUpActions", field.name, "type"]);
                  if (type !== "close_case") return null;
                  return (
                    <Form.Item name={[field.name, "mode"]} rules={[{ required: true }]} style={{ minWidth: 220, marginBottom: 0 }}>
                      <Select options={[...FOLLOW_UP_CLOSE_MODES]} style={{ width: "100%" }} popupMatchSelectWidth={false} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            ) : null}
            <Button danger onClick={() => remove(field.name)}>删除</Button>
          </Space>
        ))}
      </Space>
    </Card>
  );
}
