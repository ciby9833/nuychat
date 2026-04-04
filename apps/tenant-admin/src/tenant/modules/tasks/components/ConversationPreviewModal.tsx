import { Alert, Modal, Space, Spin, Tag, Typography } from "antd";

import { StructuredMessageContent } from "../../../components/StructuredMessageContent";
import type { HumanConversationDetail } from "../../../types";

type ConversationPreviewModalProps = {
  open: boolean;
  loading: boolean;
  detail: HumanConversationDetail | null;
  onClose: () => void;
};

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export function ConversationPreviewModal({
  open,
  loading,
  detail,
  onClose
}: ConversationPreviewModalProps) {
  return (
    <Modal
      open={open}
      title={detail?.conversation.caseTitle ?? detail?.conversation.customerName ?? detail?.conversation.customerRef ?? "会话预览"}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin />
        </div>
      ) : !detail ? (
        <Alert type="info" showIcon message="暂无会话内容可预览" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <Space wrap size={[8, 8]}>
              <Tag>{detail.conversation.channelType.toUpperCase()}</Tag>
              {detail.conversation.caseStatus ? <Tag color="blue">{detail.conversation.caseStatus}</Tag> : null}
              {detail.conversation.queueStatus ? <Tag color="gold">{detail.conversation.queueStatus}</Tag> : null}
              {detail.conversation.currentOwnerName ? <Tag color="green">{detail.conversation.currentOwnerName}</Tag> : null}
            </Space>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              会话 {detail.conversation.conversationId.slice(0, 8)}
              {detail.conversation.customerName || detail.conversation.customerRef
                ? ` · 客户 ${detail.conversation.customerName || detail.conversation.customerRef}`
                : ""}
            </Typography.Paragraph>
          </div>

          {detail.conversation.caseSummary ? (
            <Alert type="info" showIcon message={detail.conversation.caseSummary} />
          ) : null}

          <div style={{ maxHeight: 560, overflowY: "auto", paddingRight: 8 }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              {detail.messages.map((message) => (
                <div
                  key={message.messageId}
                  style={{
                    alignSelf: message.direction === "outbound" ? "flex-end" : "flex-start",
                    width: "100%"
                  }}
                >
                  <div
                    style={{
                      maxWidth: "82%",
                      marginLeft: message.direction === "outbound" ? "auto" : 0,
                      border: "1px solid #f0f0f0",
                      borderRadius: 12,
                      padding: 12,
                      background: message.direction === "outbound" ? "#f6ffed" : "#fff"
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#8c8c8c", marginBottom: 6 }}>
                      {message.senderName || message.senderType} · {formatTime(message.createdAt)}
                    </div>
                    {message.replyToPreview ? (
                      <div style={{ fontSize: 12, color: "#8c8c8c", borderLeft: "3px solid #d9d9d9", paddingLeft: 8, marginBottom: 8 }}>
                        {message.replyToPreview}
                      </div>
                    ) : null}
                    <StructuredMessageContent
                      structured={message.content?.structured}
                      fallbackText={message.preview}
                      attachments={message.content?.attachments}
                    />
                  </div>
                </div>
              ))}
            </Space>
          </div>
        </Space>
      )}
    </Modal>
  );
}
