// 作用: AI 座席新建/编辑侧边抽屉
// 菜单路径: 客户中心 -> AI 座席管理 -> 新增/编辑 AI 座席
// 作者：吴川

import { Button, Drawer, Form, Input, Select } from "antd";

import type { TenantAIAgent } from "../../../types";
import type { AISeatsFormValues } from "../types";

export function AISeatsDrawer({
  open,
  selected,
  form,
  busy,
  onClose,
  onSave
}: {
  open: boolean;
  selected: TenantAIAgent | null;
  form: ReturnType<typeof Form.useForm<AISeatsFormValues>>[0];
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Drawer
      title={selected ? `编辑 AI 座席 · ${selected.name}` : "新增 AI 座席"}
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入 AI 座席名称" }]}>
          <Input placeholder="售前 AI 客服 / 夜班 AI 客服" />
        </Form.Item>
        <Form.Item label="角色" name="roleLabel">
          <Input placeholder="售前顾问 / 售后客服 / 投诉专员" />
        </Form.Item>
        <Form.Item label="人格设定" name="personality">
          <Input.TextArea rows={3} placeholder="友好、耐心、专业、强同理心" />
        </Form.Item>
        <Form.Item label="服务场景" name="scenePrompt">
          <Input.TextArea rows={3} placeholder="售后咨询、退款问题、物流查询" />
        </Form.Item>
        <Form.Item label="系统提示词" name="systemPrompt">
          <Input.TextArea rows={5} placeholder="该 AI 座席的独立提示词/工作指令" />
        </Form.Item>
        <Form.Item label="说明" name="description">
          <Input.TextArea rows={4} placeholder="该 AI 客服实例的职责描述" />
        </Form.Item>
        <Form.Item label="状态" name="status" rules={[{ required: true, message: "请选择状态" }]}>
          <Select
            options={[
              { value: "draft", label: "draft" },
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" }
            ]}
          />
        </Form.Item>
        <Button type="primary" loading={busy} onClick={onSave}>
          保存
        </Button>
      </Form>
    </Drawer>
  );
}
