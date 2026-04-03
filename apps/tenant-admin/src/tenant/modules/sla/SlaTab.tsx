import { Space } from "antd";

import { SlaBreachFilterBar } from "./components/SlaBreachFilterBar";
import { SlaBreachesTable } from "./components/SlaBreachesTable";
import { SlaDefaultConfigCard } from "./components/SlaDefaultConfigCard";
import { SlaSummaryCards } from "./components/SlaSummaryCards";
import { useSlaData } from "./hooks/useSlaData";

export function SlaTab() {
  const data = useSlaData();

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <SlaDefaultConfigCard
        loading={data.loading}
        saving={data.saving}
        open={data.editorOpen}
        config={data.defaultConfig}
        form={data.configForm}
        onOpenChange={data.setEditorOpen}
        onSave={() => { void data.onSaveConfig(); }}
      />

      <SlaSummaryCards summary={data.summary} />

      <SlaBreachFilterBar
        loading={data.loading}
        filters={data.filters}
        onFiltersChange={(updater) => data.setFilters(updater)}
        onRefresh={() => { void data.load(data.filters); }}
      />

      <SlaBreachesTable
        loading={data.loading}
        breaches={data.breaches}
        onStatusChange={(item, status) => { void data.onUpdateBreachStatus(item, status); }}
        onPageChange={(page, pageSize) => { void data.loadBreachPage(page, pageSize); }}
      />
    </Space>
  );
}
