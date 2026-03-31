/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力 -> FORMS.md
 * 文件职责: 维护 FORMS.md，用于补充字段收集、映射和缺参澄清说明。
 * 主要交互文件:
 * - ../../modals/CapabilityEditModal.tsx: 负责分步展示此区块。
 */
import { Form, Input, Typography } from "antd";
import { useTranslation } from "react-i18next";

const FORMS_TEMPLATE = `# 需要收集哪些字段

# 每个字段从哪里来

# 缺少字段时怎么向客户澄清

# 字段格式要求
`;

export function CapabilityFormsMarkdownSection() {
  const { t } = useTranslation();
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t("aiCapabilities.markdown.formsIntro")}
      </Typography.Paragraph>
      <Form.Item label="FORMS.md" name="formsMarkdown">
        <Input.TextArea rows={16} placeholder={FORMS_TEMPLATE} />
      </Form.Item>
    </>
  );
}
