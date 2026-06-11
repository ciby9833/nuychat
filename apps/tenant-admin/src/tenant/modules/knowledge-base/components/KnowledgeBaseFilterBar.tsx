import { Badge, Button, Card, Input, Select, Space, Switch, Tag } from "antd";
import { useTranslation } from "react-i18next";

type KnowledgeBaseFilterBarProps = {
  total: number;
  needsReviewCount: number;
  search: string;
  catFilter: string;
  reviewFilter: boolean;
  categories: string[];
  error: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onReviewFilterChange: (value: boolean) => void;
  onCreate: () => void;
  onRefresh: () => void;
};

export function KnowledgeBaseFilterBar({
  total,
  needsReviewCount,
  search,
  catFilter,
  reviewFilter,
  categories,
  error,
  onSearchChange,
  onCategoryChange,
  onReviewFilterChange,
  onCreate,
  onRefresh
}: KnowledgeBaseFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("kb.queryModule")}
      extra={
        <Space>
          {needsReviewCount > 0 && (
            <Badge count={needsReviewCount} size="small">
              <Tag
                color="warning"
                style={{ cursor: "pointer" }}
                onClick={() => onReviewFilterChange(!reviewFilter)}
              >
                {t("kb.needsReview")}
              </Tag>
            </Badge>
          )}
          <Tag color="blue">{t("common.total")} {total}</Tag>
        </Space>
      }
    >
      <Space wrap>
        <Input.Search
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("kb.searchPlaceholder")}
          style={{ width: 300 }}
        />
        <Select
          value={catFilter || "all"}
          style={{ width: 180 }}
          options={[
            { value: "all", label: t("kb.allCategories") },
            ...categories.map((category) => ({ value: category, label: category }))
          ]}
          onChange={(value) => onCategoryChange(value === "all" ? "" : value)}
        />
        <Space size={6}>
          <Switch size="small" checked={reviewFilter} onChange={onReviewFilterChange} />
          <span style={{ fontSize: 13, color: reviewFilter ? "#fa8c16" : undefined }}>
            {t("kb.onlyNeedsReview")}
          </span>
        </Space>
        <Button type="primary" onClick={onCreate}>{t("kb.addArticle")}</Button>
        <Button onClick={onRefresh}>{t("common.refresh")}</Button>
        {error ? <Tag color="red">{error}</Tag> : null}
      </Space>
    </Card>
  );
}
