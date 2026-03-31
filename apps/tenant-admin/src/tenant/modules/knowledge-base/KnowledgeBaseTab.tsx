/**
 * 菜单路径与名称: 客户中心 -> Knowledge Base / 知识库
 * 文件职责: 知识库模块主入口，负责串联检索筛选、文章列表与文章编辑抽屉。
 * 主要交互文件:
 * - ./hooks/useKnowledgeBaseData.ts: 负责知识条目查询、创建、编辑、停用以及抽屉状态。
 * - ./components/KnowledgeBaseFilterBar.tsx: 展示搜索、分类筛选、创建与刷新入口。
 * - ./components/KnowledgeBaseTable.tsx: 展示知识条目列表与编辑/停用操作。
 * - ./components/KnowledgeBaseEditorDrawer.tsx: 承载知识条目创建与编辑表单。
 * - ./types.ts: 统一导出知识库模块使用的类型。
 * - ../../api.ts: 通过通用 api() 访问知识库相关后端接口。
 */

import { Space } from "antd";

import { KnowledgeBaseEditorDrawer } from "./components/KnowledgeBaseEditorDrawer";
import { KnowledgeBaseFilterBar } from "./components/KnowledgeBaseFilterBar";
import { KnowledgeBaseTable } from "./components/KnowledgeBaseTable";
import { useKnowledgeBaseData } from "./hooks/useKnowledgeBaseData";

export function KnowledgeBaseTab() {
  const data = useKnowledgeBaseData();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <KnowledgeBaseFilterBar
        total={data.total}
        search={data.search}
        catFilter={data.catFilter}
        categories={data.categories}
        error={data.error}
        onSearchChange={data.setSearch}
        onCategoryChange={data.setCatFilter}
        onCreate={data.openCreate}
        onRefresh={() => { void data.load(); }}
      />

      <KnowledgeBaseTable
        entries={data.filteredEntries}
        onEdit={data.openEdit}
        onDeactivate={(id) => { void data.deactivate(id); }}
      />

      <KnowledgeBaseEditorDrawer
        open={data.createOpen}
        editing={data.editing}
        categories={data.categories}
        form={data.form}
        onClose={() => { data.setCreateOpen(false); data.setEditing(null); }}
        onSave={() => { void data.save(); }}
      />
    </Space>
  );
}
