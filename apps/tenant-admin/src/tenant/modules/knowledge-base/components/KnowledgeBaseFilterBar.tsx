import { Button, Card, Input, Select, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";

type KnowledgeBaseFilterBarProps = {
  total: number;
  search: string;
  catFilter: string;
  categories: string[];
  error: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
};

export function KnowledgeBaseFilterBar({
  total,
  search,
  catFilter,
  categories,
  error,
  onSearchChange,
  onCategoryChange,
  onCreate,
  onRefresh
}: KnowledgeBaseFilterBarProps) {
  const { t } = useTranslation();

  return (
    <Card title={t("kb.queryModule")} extra={<Tag color="blue">{t("common.total")} {total}</Tag>}>
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
          options={[{ value: "all", label: t("kb.allCategories") }, ...categories.map((category) => ({ value: category, label: category }))]}
          onChange={(value) => onCategoryChange(value === "all" ? "" : value)}
        />
        <Button type="primary" onClick={onCreate}>{t("kb.addArticle")}</Button>
        <Button onClick={onRefresh}>{t("common.refresh")}</Button>
        {error ? <Tag color="red">{error}</Tag> : null}
      </Space>
    </Card>
  );
}
