/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力 -> REFERENCE.md
 * 文件职责: 维护 REFERENCE.md，用于补充 API 说明、错误码和字段字典。
 * 主要交互文件:
 * - ../../modals/CapabilityEditModal.tsx: 负责分步展示此区块。
 */
import { Form, Input, Typography } from "antd";
import { useTranslation } from "react-i18next";

const REFERENCE_TEMPLATE = `# 接口说明

# 请求参数

# 响应字段

# 错误码 / 异常说明
`;

export function CapabilityReferenceMarkdownSection() {
  const { t } = useTranslation();
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t("aiCapabilities.markdown.referenceIntro")}
      </Typography.Paragraph>
      <Form.Item label="REFERENCE.md" name="referenceMarkdown">
        <Input.TextArea rows={16} placeholder={REFERENCE_TEMPLATE} />
      </Form.Item>
    </>
  );
}
