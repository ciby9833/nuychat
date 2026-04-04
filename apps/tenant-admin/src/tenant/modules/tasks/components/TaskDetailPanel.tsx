/**
 * 菜单路径与名称: 客户中心 -> Tasks / 任务管理 -> 任务详情
 * 文件职责: 展示右侧任务详情、负责人/状态/截止时间编辑与评论区。
 * 主要交互文件:
 * - ../TasksTab.tsx
 * - ../helpers.ts
 * - ../hooks/useTasksData.ts
 */

import { Button, DatePicker, Form, Input, List, Select, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";

import { getStatusOptions } from "../helpers";
import type { AdminTaskDetail, AdminTaskItem, AgentProfile } from "../types";

type TaskDetailPanelProps = {
  detail: AdminTaskDetail | null;
  selectedTask: AdminTaskItem | null;
  agents: AgentProfile[];
  comment: string;
  saving: boolean;
  onCommentChange: (value: string) => void;
  onPatch: (patch: { status?: string; assigneeAgentId?: string | null; dueAt?: string | null }) => void;
  onComment: () => void;
  onOpenConversation: (conversationId: string | null) => void;
};

export function TaskDetailPanel({
  detail,
  selectedTask,
  agents,
  comment,
  saving,
  onCommentChange,
  onPatch,
  onComment,
  onOpenConversation
}: TaskDetailPanelProps) {
  const { t } = useTranslation();

  if (!detail || !selectedTask) {
    return <Typography.Text type="secondary">{t("tasksModule.detail.empty")}</Typography.Text>;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={5} style={{ marginBottom: 4 }}>{selectedTask.title}</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t("tasksModule.detail.casePrefix", { value: selectedTask.caseTitle || selectedTask.caseId.slice(0, 8) })}
          {" · "}
          {t("tasksModule.detail.customerPrefix", { value: selectedTask.customerName || selectedTask.customerRef || t("tasksModule.detail.emptyValue") })}
        </Typography.Paragraph>
        <Space size={8} style={{ marginTop: 8 }} wrap>
          <Typography.Text type="secondary">
            {t("tasksModule.detail.conversationPrefix", {
              value: selectedTask.conversationId ? selectedTask.conversationId.slice(0, 8) : t("tasksModule.detail.emptyValue")
            })}
          </Typography.Text>
          {selectedTask.conversationId ? (
            <Button type="link" size="small" style={{ padding: 0, height: "auto" }} onClick={() => onOpenConversation(selectedTask.conversationId)}>
              {t("tasksModule.detail.openConversation")}
            </Button>
          ) : null}
        </Space>
      </div>

      <Form layout="vertical">
        <Form.Item label={t("tasksModule.detail.owner")}>
          <Select
            value={selectedTask.ownerAgentId ?? ""}
            options={[
              { value: "", label: t("tasksModule.detail.unassigned") },
              ...agents.map((agent) => ({
                value: agent.agentId,
                label: `${agent.displayName}${agent.employeeNo ? ` #${agent.employeeNo}` : ""}`
              }))
            ]}
            onChange={(value) => onPatch({ assigneeAgentId: value || null })}
          />
        </Form.Item>
        <Form.Item label={t("tasksModule.detail.status")}>
          <Select
            value={selectedTask.status}
            options={getStatusOptions().filter((item) => item.value)}
            onChange={(value) => onPatch({ status: value })}
          />
        </Form.Item>
        <Form.Item label={t("tasksModule.detail.dueAt")}>
          <DatePicker
            showTime
            style={{ width: "100%" }}
            value={selectedTask.dueAt ? dayjs(selectedTask.dueAt) : null}
            onChange={(value) => onPatch({ dueAt: value ? value.toISOString() : null })}
          />
        </Form.Item>
      </Form>

      {selectedTask.description ? (
        <div>
          <Typography.Text strong>{t("tasksModule.detail.description")}</Typography.Text>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedTask.description}</div>
        </div>
      ) : null}

      {selectedTask.sourceMessagePreview ? (
        <div>
          <Typography.Text strong>{t("tasksModule.detail.sourceMessage")}</Typography.Text>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{selectedTask.sourceMessagePreview}</div>
        </div>
      ) : null}

      <div>
        <Typography.Text strong>{t("tasksModule.detail.comments")}</Typography.Text>
        <List
          style={{ marginTop: 8, border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}
          dataSource={detail.comments}
          locale={{ emptyText: t("tasksModule.detail.noComments") }}
          renderItem={(item) => (
            <List.Item style={{ paddingInline: 0 }}>
              <List.Item.Meta
                title={`${item.authorName || item.authorType}${item.authorEmployeeNo ? ` #${item.authorEmployeeNo}` : ""}`}
                description={
                  <div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{item.body}</div>
                    <Typography.Text type="secondary">{dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </div>

      <Input.TextArea
        rows={4}
        placeholder={t("tasksModule.detail.commentPlaceholder")}
        value={comment}
        onChange={(event) => onCommentChange(event.target.value)}
      />
      <Space>
        <Button type="primary" loading={saving} onClick={onComment}>
          {t("tasksModule.detail.replyTask")}
        </Button>
        {selectedTask.status !== "done" ? (
          <Button loading={saving} onClick={() => onPatch({ status: "done" })}>
            {t("tasksModule.detail.finishTask")}
          </Button>
        ) : null}
      </Space>
    </Space>
  );
}
