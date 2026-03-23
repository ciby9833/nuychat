// 作用: 渠道配置编辑弹窗（Web/Webhook 配置表单）
// 菜单路径: 客户中心 -> 渠道配置 -> 编辑渠道
// 作者：吴川

import { Form, Input, Modal, Switch } from "antd";

import type { ChannelConfig } from "../../../types";
import type { ChannelFormValues } from "../types";

export function ChannelEditModal({
  editing,
  form,
  saving,
  onClose,
  onSave
}: {
  editing: ChannelConfig | null;
  form: ReturnType<typeof Form.useForm<ChannelFormValues>>[0];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const canEditIdentifier = editing?.channel_type !== "webhook";

  return (
    <Modal
      title={editing ? `编辑渠道配置 · ${editing.channel_type}` : "编辑渠道配置"}
      open={!!editing}
      onCancel={onClose}
      onOk={onSave}
      okButtonProps={{ loading: saving }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label="渠道ID" name="channel_id" rules={[{ required: true, message: "请输入渠道ID" }]}>
          <Input placeholder="例如：web-demo / whatsapp-demo" disabled={!canEditIdentifier} />
        </Form.Item>
        <Form.Item label="启用状态" name="is_active" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>

        {editing?.channel_type === "web" ? (
          <>
            <Form.Item label="Widget 名称" name="widget_name">
              <Input placeholder="例如：NuyChat Web" />
            </Form.Item>
            <Form.Item
              label="Web 标识 (publicChannelKey)"
              name="public_channel_key"
              rules={[{ required: true, message: "请输入 publicChannelKey" }]}
            >
              <Input placeholder="例如：demo-web-public" />
            </Form.Item>
            <Form.Item label="允许来源 (逗号分隔)" name="allowed_origins">
              <Input placeholder="例如：http://localhost:5176,https://www.example.com" />
            </Form.Item>
          </>
        ) : null}

        {editing?.channel_type === "webhook" ? (
          <>
            <Form.Item label="Verify Token" name="verify_token">
              <Input />
            </Form.Item>
            <Form.Item label="第三方出站回调地址" name="outbound_webhook_url">
              <Input placeholder="https://example.com/webhook/outbound" />
            </Form.Item>
            <Form.Item label="Webhook Secret" name="webhook_secret">
              <Input.Password />
            </Form.Item>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
