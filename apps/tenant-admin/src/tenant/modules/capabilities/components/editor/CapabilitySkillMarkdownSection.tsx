/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 新建/编辑能力 -> SKILL.md
 * 文件职责: 维护模型加载的主指令文档 SKILL.md。
 * 主要交互文件:
 * - ../../modals/CapabilityEditModal.tsx: 负责分步展示此区块。
 */
import { Form, Input, Typography } from "antd";
import { useTranslation } from "react-i18next";

const SKILL_TEMPLATE = `# 这个能力做什么

# 什么时候使用

# 什么时候不要使用

# 需要什么输入

# 返回什么结果

# 异常如何处理
`;

export function CapabilitySkillMarkdownSection() {
  const { t } = useTranslation();
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t("aiCapabilities.markdown.skillIntro")}
      </Typography.Paragraph>
      <Form.Item label="SKILL.md" name="skillMarkdown">
        <Input.TextArea rows={28} placeholder={SKILL_TEMPLATE} />
      </Form.Item>
    </>
  );
}
