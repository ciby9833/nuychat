import { LockOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import {
  Button, Form, Input, Modal, Popconfirm,
  Select, Space, Table, Tag, Typography, message
} from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { patchMember, resetMemberPassword, resignMember } from "../../../api";
import type { MemberListItem } from "../../../types";
import { ResetPasswordModal } from "../modals/ResetPasswordModal";
import type { EditMemberForm } from "../types";
import { ROLE_COLOR, getActionErrorMessage, roleLabel, roleOptions } from "../types";

export function MembersPane({
  members,
  loading,
  onReload,
  onCreate,
  onEnableAgent
}: {
  members: MemberListItem[];
  loading: boolean;
  onReload: () => void;
  onCreate: () => void;
  onEnableAgent: () => void;
}) {
  const { t } = useTranslation();
  const [editMember, setEditMember] = useState<MemberListItem | null>(null);
  const [passwordMember, setPasswordMember] = useState<MemberListItem | null>(null);
  const [editForm] = Form.useForm<EditMemberForm>();
  const [saving, setSaving] = useState(false);
  const [resigningId, setResigningId] = useState<string | null>(null);

  const openEdit = (member: MemberListItem) => {
    setEditMember(member);
    editForm.setFieldsValue({
      role:        member.role,
      status:      member.status,
      displayName: member.displayName ?? "",
      employeeNo:  member.employeeNo ?? undefined,
      phone:       member.phone ?? undefined,
      idNumber:    member.idNumber ?? undefined
    });
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Typography.Text type="secondary">
          {t("agents.member.totalCount", { count: members.length })}
        </Typography.Text>
        <Space>
          <Button onClick={onReload} loading={loading}>{t("common.refresh")}</Button>
          <Button onClick={onEnableAgent}>{t("agents.enableBtn")}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>{t("agents.member.addMember")}</Button>
        </Space>
      </div>

      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
        <Table<MemberListItem>
          rowKey="membershipId"
          loading={loading}
          dataSource={members}
          pagination={members.length > 15 ? { pageSize: 15, size: "small" } : false}
          columns={[
            {
              title: t("agents.member.name"),
              render: (_, row) => (
                <Space>
                  <UserOutlined style={{ color: "#8c8c8c" }} />
                  <div>
                    <Typography.Text strong>{row.displayName ?? row.email}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {row.email}
                      {row.employeeNo ? ` / ${row.employeeNo}` : ""}
                      {row.phone ? ` / ${row.phone}` : ""}
                    </Typography.Text>
                  </div>
                </Space>
              )
            },
            { title: t("agents.role"), dataIndex: "role", width: 160, render: (value: string) => <Tag color={ROLE_COLOR[value] ?? "default"}>{roleLabel(value)}</Tag> },
            {
              title: t("agents.member.accountStatus"),
              dataIndex: "status",
              width: 120,
              render: (value: string, row: MemberListItem) => {
                if (row.resignedAt) return <Tag color="default">{t("agents.member.resigned")}</Tag>;
                return (
                  <Tag color={value === "active" ? "green" : value === "inactive" ? "default" : "red"}>
                    {value === "active" ? t("common.active") : value === "inactive" ? t("common.inactive") : value === "suspended" ? t("agents.member.suspended") : value}
                  </Tag>
                );
              }
            },
            {
              title: t("agents.member.agentProfile"),
              width: 120,
              render: (_, row) => row.agentId
                ? <Tag color="blue">{t("agents.member.agentEnabled")}</Tag>
                : <Tag>{t("agents.member.agentDisabled")}</Tag>
            },
            {
              title: t("common.action"),
              width: 280,
              render: (_, row) => (
                <Space wrap>
                  <Button size="small" onClick={() => openEdit(row)}>{t("common.edit")}</Button>
                  <Button size="small" icon={<LockOutlined />} onClick={() => setPasswordMember(row)}>
                    {t("agents.member.resetPassword")}
                  </Button>
                  {!row.resignedAt && (
                    <Popconfirm
                      title={t("agents.member.confirmResign")}
                      description={t("agents.member.resignDesc")}
                      okText={t("agents.member.confirmResignOk")}
                      okButtonProps={{ danger: true }}
                      cancelText={t("common.cancel")}
                      onConfirm={() => {
                        void (async () => {
                          setResigningId(row.membershipId);
                          try {
                            await resignMember(row.membershipId);
                            void message.success(t("agents.member.resignedSuccess", { name: row.displayName ?? row.email }));
                            onReload();
                          } catch (err) {
                            void message.error((err as Error).message);
                          } finally {
                            setResigningId(null);
                          }
                        })();
                      }}
                    >
                      <Button size="small" danger loading={resigningId === row.membershipId}>
                        {t("agents.member.resign")}
                      </Button>
                    </Popconfirm>
                  )}
                </Space>
              )
            }
          ]}
        />
      </div>

      <Modal
        title={`${t("agents.member.editTitle")}: ${editMember?.displayName ?? editMember?.email ?? ""}`}
        open={!!editMember}
        onCancel={() => setEditMember(null)}
        onOk={() => {
          void (async () => {
            if (!editMember) return;
            const values = await editForm.validateFields();
            setSaving(true);
            try {
              await patchMember(editMember.membershipId, {
                role:        values.role,
                status:      values.status,
                displayName: values.displayName.trim(),
                employeeNo:  values.employeeNo?.trim() || null,
                phone:       values.phone?.trim() || null,
                idNumber:    values.idNumber?.trim() || null
              });
              void message.success(t("agents.member.infoUpdated"));
              setEditMember(null);
              onReload();
            } catch (err) {
              void message.error(getActionErrorMessage(err, "member_upgrade"));
            } finally {
              setSaving(false);
            }
          })();
        }}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
        confirmLoading={saving}
        destroyOnHidden
        width={420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label={t("agents.member.name")} name="displayName" rules={[{ required: true, message: t("agents.member.nameRequired") }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t("agents.member.employeeNo")} name="employeeNo">
            <Input />
          </Form.Item>
          <Form.Item label={t("agents.member.phone")} name="phone">
            <Input placeholder="138xxxxxxxx" />
          </Form.Item>
          <Form.Item label={t("agents.member.idNumber")} name="idNumber">
            <Input placeholder={t("agents.member.idPlaceholder")} />
          </Form.Item>
          <Form.Item label={t("agents.role")} name="role">
            <Select options={roleOptions()} />
          </Form.Item>
          <Form.Item label={t("agents.member.accountStatus")} name="status">
            <Select options={[
              { value: "active",    label: t("common.active") },
              { value: "inactive",  label: t("common.inactive") },
              { value: "suspended", label: t("agents.member.suspended") }
            ]} />
          </Form.Item>
        </Form>
      </Modal>

      <ResetPasswordModal
        member={passwordMember}
        onClose={() => setPasswordMember(null)}
        onReset={async (password) => {
          if (!passwordMember) return;
          try {
            await resetMemberPassword(passwordMember.membershipId, password);
            void message.success(t("agents.member.passwordReset"));
          } catch (err) {
            void message.error((err as Error).message);
          }
        }}
      />
    </>
  );
}
