/**
 * 菜单路径与名称: 平台配置 -> AI 能力 -> 能力详情
 * 文件职责: 展示单个能力的详细信息，按 Skill Package 结构渲染 metadata、markdown 文档与 scripts。
 * 主要交互文件:
 * - ../pages/CapabilityRegistryPage.tsx: 负责决定何时展示详情卡片。
 * - ../types.ts: 提供 CapabilityRegistryDetail 类型。
 */
import { Card, Descriptions, Empty, List, Spin, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";

import type { CapabilityRegistryDetail } from "../types";

type Props = {
  detail: CapabilityRegistryDetail | null;
  loading: boolean;
};

export function CapabilityDetailCard({ detail, loading }: Props) {
  const { t } = useTranslation();
  if (loading) return <Spin />;
  if (!detail) return <Empty description={t("aiCapabilities.detail.empty")} />;

  return (
    <>
      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label={t("aiCapabilities.detail.name")}>{detail.name}</Descriptions.Item>
        <Descriptions.Item label={t("aiCapabilities.detail.code")}>{detail.code}</Descriptions.Item>
        <Descriptions.Item label={t("aiCapabilities.detail.category")}>{detail.category}</Descriptions.Item>
        <Descriptions.Item label={t("aiCapabilities.detail.status")}>
          <Tag color={detail.status === "active" ? "green" : detail.status === "draft" ? "orange" : "default"}>{t(`aiCapabilities.status.${detail.status}`, { defaultValue: detail.status })}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t("aiCapabilities.detail.description")} span={2}>{detail.description || "-"}</Descriptions.Item>
      </Descriptions>
      <Card size="small" title="SKILL.md" style={{ marginTop: 16 }}>
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
          {detail.skillMarkdown || t("aiCapabilities.detail.unmaintained")}
        </Typography.Paragraph>
      </Card>
      <Card size="small" title="FORMS.md" style={{ marginTop: 16 }}>
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
          {detail.formsMarkdown || t("aiCapabilities.detail.unmaintained")}
        </Typography.Paragraph>
      </Card>
      <Card size="small" title="REFERENCE.md" style={{ marginTop: 16 }}>
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
          {detail.referenceMarkdown || t("aiCapabilities.detail.unmaintained")}
        </Typography.Paragraph>
      </Card>
      <Card size="small" title="Scripts" style={{ marginTop: 16 }}>
        <List
          dataSource={detail.scripts}
          locale={{ emptyText: t("aiCapabilities.detail.scriptsEmpty") }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={<>{item.name} <Tag>{item.language}</Tag> {item.enabled ? <Tag color="green">{t("aiCapabilities.detail.enabled")}</Tag> : <Tag>{t("aiCapabilities.detail.disabled")}</Tag>}</>}
                description={
                  <>
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {t("aiCapabilities.detail.fileName")}：{item.fileName} | {t("aiCapabilities.detail.scriptKey")}：{item.scriptKey}
                    </Typography.Paragraph>
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {t("aiCapabilities.detail.requirements")}：{item.requirements.length > 0 ? item.requirements.join(", ") : t("aiCapabilities.detail.none")}
                    </Typography.Paragraph>
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {t("aiCapabilities.detail.envBindings")}：{item.envBindings.length > 0 ? item.envBindings.map((entry) => entry.envKey).join(", ") : t("aiCapabilities.detail.none")}
                    </Typography.Paragraph>
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                      {item.sourceCode}
                    </Typography.Paragraph>
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </>
  );
}
