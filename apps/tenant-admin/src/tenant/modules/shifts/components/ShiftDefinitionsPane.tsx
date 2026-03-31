/**
 * 菜单路径与名称: 客户中心 -> Shifts / 排班管理 -> 班次定义
 * 文件职责: 维护班次模板列表，并处理新建、编辑、停用班次模板。
 * 主要交互文件:
 * - ../hooks/useShiftsData.ts: 提供班次模板列表与刷新动作。
 * - ../types.ts: 提供班次表单类型。
 * - ../../../api.ts: 提供班次创建、更新、停用接口。
 */

import { ClockCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Badge, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, TimePicker, Tooltip, Typography, message } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createShiftSchedule, deleteShiftSchedule, updateShiftSchedule } from "../../../api";
import type { ShiftFormValues, ShiftScheduleItem } from "../types";

type ShiftDefinitionsPaneProps = {
  schedules: ShiftScheduleItem[];
  loading: boolean;
  onReload: () => Promise<void>;
};

export function ShiftDefinitionsPane({ schedules, loading, onReload }: ShiftDefinitionsPaneProps) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShiftScheduleItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form] = Form.useForm<ShiftFormValues>();

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (row: ShiftScheduleItem) => {
    setEditTarget(row);
    form.setFieldsValue({
      code: row.code,
      name: row.name,
      startTime: dayjs(row.startTime, "HH:mm"),
      endTime: dayjs(row.endTime, "HH:mm"),
      timezone: row.timezone
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editTarget) {
        await updateShiftSchedule(editTarget.shiftId, {
          name: values.name,
          startTime: values.startTime.format("HH:mm"),
          endTime: values.endTime.format("HH:mm"),
          timezone: values.timezone || "Asia/Shanghai"
        });
        void message.success(t("shiftsModule.messages.shiftUpdated"));
      } else {
        await createShiftSchedule({
          code: values.code,
          name: values.name,
          startTime: values.startTime.format("HH:mm"),
          endTime: values.endTime.format("HH:mm"),
          timezone: values.timezone || "Asia/Shanghai"
        });
        void message.success(t("shiftsModule.messages.shiftCreated"));
      }
      form.resetFields();
      setModalOpen(false);
      setEditTarget(null);
      await onReload();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ShiftScheduleItem) => {
    setDeletingId(row.shiftId);
    try {
      await deleteShiftSchedule(row.shiftId);
      void message.success(t("shiftsModule.messages.shiftDisabled"));
      await onReload();
    } catch (err) {
      void message.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <ClockCircleOutlined />
          <Typography.Text strong>{t("shiftsModule.definitions.title")}</Typography.Text>
          <Tag>{t("shiftsModule.definitions.count", { count: schedules.length })}</Tag>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t("shiftsModule.definitions.create")}</Button>
      </div>

      <Table<ShiftScheduleItem>
        rowKey="shiftId"
        loading={loading}
        dataSource={schedules}
        pagination={false}
        locale={{ emptyText: t("shiftsModule.definitions.empty") }}
        columns={[
          {
            title: t("shiftsModule.definitions.name"),
            key: "name",
            render: (_, row) => (
              <Space>
                <Typography.Text strong>{row.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.code}</Typography.Text>
              </Space>
            )
          },
          {
            title: t("shiftsModule.definitions.workingHours"),
            key: "time",
            render: (_, row) => (
              <Tag color="blue" icon={<ClockCircleOutlined />}>{row.startTime} - {row.endTime}</Tag>
            )
          },
          {
            title: t("shiftsModule.definitions.timezone"),
            dataIndex: "timezone",
            render: (value: string) => <Typography.Text type="secondary">{value}</Typography.Text>
          },
          {
            title: t("shiftsModule.definitions.status"),
            dataIndex: "isActive",
            width: 80,
            render: (value: boolean) => value ? <Badge status="success" text={t("shiftsModule.definitions.enabled")} /> : <Badge status="default" text={t("shiftsModule.definitions.disabled")} />
          },
          {
            title: t("shiftsModule.definitions.actions"),
            key: "action",
            width: 100,
            render: (_, row) => (
              <Space size={4}>
                <Tooltip title={t("shiftsModule.definitions.edit")}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
                </Tooltip>
                <Popconfirm
                  title={t("shiftsModule.definitions.disableTitle")}
                  description={t("shiftsModule.definitions.disableDescription")}
                  onConfirm={() => { void handleDelete(row); }}
                  okText={t("shiftsModule.definitions.disableOk")}
                  cancelText={t("common.cancel")}
                  okButtonProps={{ danger: true }}
                  disabled={!row.isActive}
                >
                  <Tooltip title={row.isActive ? t("shiftsModule.definitions.disable") : t("shiftsModule.definitions.alreadyDisabled")}>
                    <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === row.shiftId} disabled={!row.isActive} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />

      <Modal
        title={editTarget ? t("shiftsModule.definitions.modalEditTitle") : t("shiftsModule.definitions.modalCreateTitle")}
        open={modalOpen}
        onCancel={() => { form.resetFields(); setEditTarget(null); setModalOpen(false); }}
        onOk={() => { void handleSave(); }}
        okText={editTarget ? t("shiftsModule.definitions.save") : t("shiftsModule.definitions.createOk")}
        cancelText={t("common.cancel")}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t("shiftsModule.definitions.code")} name="code" rules={[{ required: true, message: t("shiftsModule.definitions.codeRequired") }, { pattern: /^[a-z0-9_-]+$/, message: t("shiftsModule.definitions.codePattern") }]} extra={t("shiftsModule.definitions.codeExtra")}>
            <Input placeholder="morning" disabled={Boolean(editTarget)} />
          </Form.Item>
          <Form.Item label={t("shiftsModule.definitions.name")} name="name" rules={[{ required: true, message: t("shiftsModule.definitions.nameRequired") }]}>
            <Input placeholder={t("shiftsModule.definitions.namePlaceholder")} />
          </Form.Item>
          <Space size={16}>
            <Form.Item label={t("shiftsModule.definitions.startTime")} name="startTime" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item label={t("shiftsModule.definitions.endTime")} name="endTime" rules={[{ required: true }]}>
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
          </Space>
          <Form.Item label={t("shiftsModule.definitions.timezoneLabel")} name="timezone" initialValue="Asia/Shanghai">
            <Select options={[
              { value: "Asia/Shanghai", label: "Asia/Shanghai (CST, UTC+8)" },
              { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB, UTC+7)" },
              { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
              { value: "UTC", label: "UTC" }
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
