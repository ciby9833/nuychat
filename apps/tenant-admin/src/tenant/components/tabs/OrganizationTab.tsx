// 用于组织架构管理，包含部门和团队的增删改查，以及团队成员管理功能
// 菜单路径：客户中心 -> 组织架构
// 作者：吴川
import { PlusOutlined, TeamOutlined, UserDeleteOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addTeamMember,
  createDepartment,
  createTeam,
  listAgents,
  listDepartments,
  listTeams,
  removeTeamMember
} from "../../api";
import type { AgentProfile, DepartmentItem, TeamItem } from "../../types";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Modal to create a new department */
function NewDepartmentModal({
  open,
  departments,
  onClose,
  onCreated
}: {
  open: boolean;
  departments: DepartmentItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form] = Form.useForm<{ code: string; name: string; parentDepartmentId?: string }>();
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createDepartment(values);
      message.success("部门已创建");
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="新建部门"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText="创建"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="部门编码" name="code" rules={[{ required: true, message: "请输入部门编码" }]}
          extra="小写字母 + 连字符，如 after-sales">
          <Input placeholder="after-sales" />
        </Form.Item>
        <Form.Item label="部门名称" name="name" rules={[{ required: true, message: "请输入部门名称" }]}>
          <Input placeholder="售后部" />
        </Form.Item>
        <Form.Item label="父部门（可选）" name="parentDepartmentId">
          <Select
            allowClear
            placeholder="顶级部门"
            options={departments.map((d) => ({ value: d.departmentId, label: `${d.name} (${d.code})` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Modal to create a new team */
function NewTeamModal({
  open,
  departments,
  agents,
  defaultDepartmentId,
  onClose,
  onCreated
}: {
  open: boolean;
  departments: DepartmentItem[];
  agents: AgentProfile[];
  defaultDepartmentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form] = Form.useForm<{ departmentId: string; code: string; name: string; supervisorAgentId?: string }>();
  const [saving, setSaving] = useState(false);

  // Pre-fill department when a department is selected in the left panel
  useEffect(() => {
    if (open && defaultDepartmentId) {
      form.setFieldValue("departmentId", defaultDepartmentId);
    }
  }, [open, defaultDepartmentId, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await createTeam(values);
      message.success("团队已创建");
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="新建团队"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={() => { void handleOk(); }}
      okText="创建"
      cancelText="取消"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item label="所属部门" name="departmentId" rules={[{ required: true, message: "请选择部门" }]}>
          <Select
            options={departments.map((d) => ({ value: d.departmentId, label: `${d.name} (${d.code})` }))}
          />
        </Form.Item>
        <Form.Item label="团队编码" name="code" rules={[{ required: true, message: "请输入团队编码" }]}
          extra="如 after-sales-a">
          <Input placeholder="after-sales-a" />
        </Form.Item>
        <Form.Item label="团队名称" name="name" rules={[{ required: true, message: "请输入团队名称" }]}>
          <Input placeholder="售后一组" />
        </Form.Item>
        <Form.Item label="主管坐席（可选）" name="supervisorAgentId">
          <Select
            allowClear
            showSearch
            placeholder="无主管"
            optionFilterProp="label"
            options={agents.map((a) => ({ value: a.agentId, label: `${a.displayName} (${a.email})` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OrganizationTab() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [depts, tms, ags] = await Promise.all([listDepartments(), listTeams(), listAgents()]);
      setDepartments(depts);
      setTeams(tms);
      setAgents(ags);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Teams filtered to the selected department (or all if none selected)
  const visibleTeams = useMemo(
    () => selectedDeptId ? teams.filter((t) => t.departmentId === selectedDeptId) : teams,
    [teams, selectedDeptId]
  );

  const selectedDept = useMemo(
    () => departments.find((d) => d.departmentId === selectedDeptId) ?? null,
    [departments, selectedDeptId]
  );

  const handleRemoveMember = async (teamId: string, agentId: string) => {
    try {
      await removeTeamMember(teamId, agentId);
      message.success("成员已移除");
      await reload();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const handleAddMember = async (teamId: string, agentId: string) => {
    try {
      await addTeamMember(teamId, { agentId, isPrimary: true });
      message.success("成员已加入");
      await reload();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  return (
    <>
      <Row gutter={16} style={{ height: "100%" }}>
        {/* ── Left: Department panel ─────────────────────────────────────────── */}
        <Col xs={24} md={8} lg={7}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #f0f0f0",
              borderRadius: 8,
              overflow: "hidden"
            }}
          >
            {/* Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <Typography.Text strong>部门列表</Typography.Text>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowDeptModal(true)}
              >
                新建部门
              </Button>
            </div>

            {/* "全部" pill */}
            <div
              onClick={() => setSelectedDeptId(null)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background: selectedDeptId === null ? "#e6f4ff" : "transparent",
                borderBottom: "1px solid #f0f0f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <Typography.Text style={{ color: selectedDeptId === null ? "#1677ff" : undefined }}>
                全部部门
              </Typography.Text>
              <Tag>{teams.length} 团队</Tag>
            </div>

            {/* Department rows */}
            {loading && departments.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center" }}>
                <Typography.Text type="secondary">加载中…</Typography.Text>
              </div>
            ) : (
              departments.map((dept) => {
                const isSelected = dept.departmentId === selectedDeptId;
                const deptTeams = teams.filter((t) => t.departmentId === dept.departmentId);
                return (
                  <div
                    key={dept.departmentId}
                    onClick={() => setSelectedDeptId(isSelected ? null : dept.departmentId)}
                    style={{
                      padding: "10px 16px",
                      cursor: "pointer",
                      background: isSelected ? "#e6f4ff" : "transparent",
                      borderBottom: "1px solid #f0f0f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "background 0.15s"
                    }}
                  >
                    <div>
                      <Typography.Text
                        strong={isSelected}
                        style={{ color: isSelected ? "#1677ff" : undefined, display: "block" }}
                      >
                        {dept.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dept.code}</Typography.Text>
                    </div>
                    <Tag>{deptTeams.length} 团队</Tag>
                  </div>
                );
              })
            )}

            {!loading && departments.length === 0 && (
              <div style={{ padding: 24, textAlign: "center" }}>
                <Typography.Text type="secondary">暂无部门，点击新建部门开始</Typography.Text>
              </div>
            )}
          </div>
        </Col>

        {/* ── Right: Teams + Members panel ──────────────────────────────────── */}
        <Col xs={24} md={16} lg={17}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #f0f0f0",
              borderRadius: 8,
              overflow: "hidden"
            }}
          >
            {/* Header */}
            <div style={{
              padding: "14px 16px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <Space>
                <TeamOutlined />
                <Typography.Text strong>
                  {selectedDept ? `${selectedDept.name} 的团队` : "所有团队"}
                </Typography.Text>
                <Tag color="blue">{visibleTeams.length}</Tag>
              </Space>
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowTeamModal(true)}
              >
                新建团队
              </Button>
            </div>

            {/* Teams table */}
            <Table<TeamItem>
              rowKey="teamId"
              loading={loading}
              dataSource={visibleTeams}
              pagination={visibleTeams.length > 8 ? { pageSize: 8, size: "small" } : false}
              locale={{ emptyText: selectedDeptId ? "该部门暂无团队，点击新建团队" : "暂无团队" }}
              style={{ padding: "0 8px" }}
              columns={[
                {
                  title: "团队",
                  key: "team",
                  render: (_, row) => (
                    <div>
                      <Typography.Text strong>{row.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                        {row.code}
                      </Typography.Text>
                      {!selectedDeptId && (
                        <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>{row.departmentName}</Tag>
                      )}
                    </div>
                  )
                },
                {
                  title: "主管",
                  dataIndex: "supervisorName",
                  width: 140,
                  render: (value: string | null) =>
                    value ? <Tag color="purple">{value}</Tag> : <Typography.Text type="secondary">—</Typography.Text>
                },
                {
                  title: "成员",
                  key: "members",
                  render: (_, row) => {
                    // Agents NOT yet in this team, for the add-member select
                    const memberIds = new Set(row.members.map((m) => m.agentId));
                    const available = agents.filter((a) => !memberIds.has(a.agentId));

                    return (
                      <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        {/* Member chips with remove */}
                        {row.members.length > 0 ? (
                          <Space wrap>
                            {row.members.map((member) => (
                              <Tooltip key={member.agentId} title={`移除 ${member.displayName}`}>
                                <Tag
                                  icon={<UserDeleteOutlined />}
                                  closable
                                  color={member.isPrimary ? "geekblue" : "default"}
                                  onClose={(e) => {
                                    e.preventDefault();
                                    void handleRemoveMember(row.teamId, member.agentId);
                                  }}
                                  style={{ cursor: "pointer" }}
                                >
                                  {member.displayName}
                                </Tag>
                              </Tooltip>
                            ))}
                          </Space>
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无成员</Typography.Text>
                        )}

                        {/* Inline add-member select */}
                        {available.length > 0 && (
                          <Select
                            showSearch
                            size="small"
                            placeholder="＋ 添加成员"
                            value={null}
                            style={{ width: 220 }}
                            optionFilterProp="label"
                            options={available.map((a) => ({
                              value: a.agentId,
                              label: `${a.displayName} (${a.email})`
                            }))}
                            onChange={(agentId) => {
                              if (agentId) void handleAddMember(row.teamId, String(agentId));
                            }}
                          />
                        )}
                      </Space>
                    );
                  }
                }
              ]}
            />
          </div>
        </Col>
      </Row>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      <NewDepartmentModal
        open={showDeptModal}
        departments={departments}
        onClose={() => setShowDeptModal(false)}
        onCreated={() => { void reload(); }}
      />

      <NewTeamModal
        open={showTeamModal}
        departments={departments}
        agents={agents}
        defaultDepartmentId={selectedDeptId}
        onClose={() => setShowTeamModal(false)}
        onCreated={() => { void reload(); }}
      />
    </>
  );
}
