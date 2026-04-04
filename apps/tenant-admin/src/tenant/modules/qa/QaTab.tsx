import { Space } from "antd";

import { QaCaseDetailDrawer } from "./components/QaCaseDetailDrawer";
import { QaOverviewCards } from "./components/QaOverviewCards";
import { QaQueueBoard } from "./components/QaQueueBoard";
import { QaQueueToolbar } from "./components/QaQueueToolbar";
import { useQaWorkbench } from "./hooks/useQaWorkbench";
import { QaGuidelineModal } from "./modals/QaGuidelineModal";

export function QaTab() {
  const data = useQaWorkbench();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <QaOverviewCards dashboard={data.dashboard} loading={data.loading} />

      <QaQueueToolbar
        loading={data.queueLoading}
        filters={data.filters}
        agents={data.agents}
        counts={data.queueCounts}
        onFiltersChange={data.setFilters}
        onRefresh={() => { void data.load(data.filters); }}
        onOpenGuideline={() => data.setGuidelineOpen(true)}
      />

      <QaQueueBoard
        loading={data.queueLoading}
        tasks={data.visibleTasks}
        onOpenCase={(task) => { void data.openCase(task); }}
      />

      <QaCaseDetailDrawer
        open={Boolean(data.selectedTask)}
        loading={data.detailLoading}
        saving={data.saving}
        detail={data.detail}
        onClose={data.closeCase}
        onSubmit={(values) => { void data.submitReview(values); }}
      />

      <QaGuidelineModal
        open={data.guidelineOpen}
        saving={data.guidelineSaving}
        guideline={data.guideline}
        onCancel={() => data.setGuidelineOpen(false)}
        onSave={(contentMd, name) => { void data.saveGuideline(contentMd, name); }}
      />
    </Space>
  );
}
