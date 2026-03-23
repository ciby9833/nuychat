// 作用: 成员账号列表面板（成员表格 + 编辑弹窗 + 重置密码 + 离职操作）
// 菜单路径: 系统设置 -> 坐席与成员管理 -> 成员账号 Tab
// 作者：吴川

import { LockOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import { useState } from "react";

import { patchMember, resetMemberPassword, resignMember } from "../../../api";
import type { MemberListItem } from "../../../types";
import { ResetPasswordModal } from "../modals/ResetPasswordModal";
import type { EditMemberForm } from "../types";
import { ROLE_COLOR, ROLE_OPTIONS, getActionErrorMessage } from "../types";

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
  const [editMember, setEditMember] = useState<MemberListItem | null>(null);
  const [passwordMember, setPasswordMember] = useState<MemberListItem | null>(null);
  const [editForm] = Form.useForm<EditMemberForm>();
  const [saving, setSaving] = useState(false);
  const [resigningId, setResigningId] = useState<string | null>(null);

  const openEdit = (member: MemberListItem) => {
    setEditMember(member);
    editForm.setFieldsValue({
      role: member.role,
      status: member.status,
      displayName: member.displayName ?? "",
      employeeNo: member.employeeNo ?? undefined,
      phone: member.phone ?? undefined,
      idNumber: member.idNumber ?? undefined
    });
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Typography.Text type="secondary">共 {members.length} 位成员账号</Typography.Text>
        <Space>
          <Button onClick={onReload} loading={loading}>刷新</Button>
          <Button onClick={onEnableAgent}>启用接待资格</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>新增成员</Button>
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
              title: "成员",
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
            { title: "角色", dataIndex: "role", width: 160, render: (value: string) => <Tag color={ROLE_COLOR[value] ?? "default"}>{value}</Tag> },
            {
              title: "账号状态",
              dataIndex: "status",
              width: 120,
              render: (value: string, row: MemberListItem) => {
                if (row.resignedAt) return <Tag color="default">已离职</Tag>;
                return <Tag color={value === "active" ? "green" : value === "inactive" ? "default" : "red"}>
                  {value === "active" ? "正常" : value === "inactive" ? "停用" : value === "suspended" ? "封禁" : value}
                </Tag>;
              }
            },
            {
              title: "座席档案",
              width: 120,
              render: (_, row) => row.agentId ? <Tag color="blue">已启用</Tag> : <Tag>未启用</Tag>
            },
            {
              title: "操作",
              width: 280,
              render: (_, row) => (
                <Space wrap>
                  <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                  <Button size="small" icon={<LockOutlined />} onClick={() => setPasswordMember(row)}>重置密码</Button>
                  {!row.resignedAt && (
                    <Popconfirm
                      title="确认办理离职？"
                      description="账号将被停用，座席状态将设为离线，此操作不可自动撤销。"
                      okText="确认离职"
                      okButtonProps={{ danger: true }}
                      cancelText="取消"
                      onConfirm={() => {
                        void (async () => {
                          setResigningId(row.membershipId);
                          try {
                            await resignMember(row.membershipId);
                            message.success(`${row.displayName ?? row.email} 已办理离职`);
                            onReload();
                          } catch (err) {
                            message.error((err as Error).message);
                          } finally {
                            setResigningId(null);
                          }
                        })();
                      }}
                    >
                      <Button size="small" danger loading={resigningId === row.membershipId}>离职</Button>
                    </Popconfirm>
                  )}
                </Space>
              )
            }
          ]}
        />
      </div>

      <Modal
        title={`编辑成员: ${editMember?.displayName ?? editMember?.email ?? ""}`}
        open={!!editMember}
        onCancel={() => setEditMember(null)}
        onOk={() => {
          void (async () => {
            if (!editMember) return;
            const values = await editForm.validateFields();
            setSaving(true);
            try {
              await patchMember(editMember.membershipId, {
                role: values.role,
                status: values.status,
                displayName: values.displayName.trim(),
                employeeNo: values.employeeNo?.trim() || null,
                phone: values.phone?.trim() || null,
                idNumber: values.idNumber?.trim() || null
              });
              message.success("成员信息已更新");
              setEditMember(null);
              onReload();
            } catch (err) {
              message.error(getActionErrorMessage(err, "member_upgrade"));
            } finally {
              setSaving(false);
            }
          })();
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        destroyOnHidden
        width={420}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="姓名" name="displayName" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input />
          </Form.Item>
          <Form.Item label="工号" name="employeeNo">
            <Input />
          </Form.Item>
          <Form.Item label="手机号码" name="phone">
            <Input placeholder="138xxxxxxxx" />
          </Form.Item>
          <Form.Item label="证件号码" name="idNumber">
            <Input placeholder="身份证或其他证件号" />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item label="账号状态" name="status">
            <Select options={[
              { value: "active", label: "正常" },
              { value: "inactive", label: "停用" },
              { value: "suspended", label: "封禁" }
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
            message.success("密码已重置");
          } catch (err) {
            message.error((err as Error).message);
          }
        }}
      />
    </>
  );
}
