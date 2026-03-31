/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力 -> 基本信息
 * 文件职责: 维护能力包的基础 metadata，包括名称、编码、分类、状态和说明。
 * 主要交互文件:
 * - ../../modals/CapabilityEditModal.tsx: 负责分步展示此区块。
 * - ../../types.ts: 由上层表单提交为 CapabilityRegistryInput。
 */
import { Form, Input, Select, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

export function CapabilityMetadataSection() {
  const { t } = useTranslation();
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t("aiCapabilities.metadata.intro")}
      </Typography.Paragraph>
      <Form.Item label={t("aiCapabilities.metadata.name")} name="name" rules={[{ required: true, message: t("aiCapabilities.metadata.nameRequired") }]}>
        <Input placeholder={t("aiCapabilities.metadata.namePlaceholder")} />
      </Form.Item>
      <Form.Item label={t("aiCapabilities.metadata.code")} name="code" rules={[{ required: true, message: t("aiCapabilities.metadata.codeRequired") }]}>
        <Input placeholder={t("aiCapabilities.metadata.codePlaceholder")} />
      </Form.Item>
      <Space style={{ width: "100%" }} size="middle" align="start">
        <Form.Item label={t("aiCapabilities.metadata.category")} name="category" style={{ flex: 1 }}>
          <Input placeholder={t("aiCapabilities.metadata.categoryPlaceholder")} />
        </Form.Item>
        <Form.Item label={t("aiCapabilities.metadata.status")} name="status" style={{ width: 180 }}>
          <Select
            options={[
              { value: "active", label: t("aiCapabilities.status.active") },
              { value: "draft", label: t("aiCapabilities.status.draft") },
              { value: "inactive", label: t("aiCapabilities.status.inactive") }
            ]}
          />
        </Form.Item>
      </Space>
      <Form.Item label={t("aiCapabilities.metadata.description")} name="description">
        <Input.TextArea rows={6} placeholder={t("aiCapabilities.metadata.descriptionPlaceholder")} />
      </Form.Item>
    </Space>
  );
}
