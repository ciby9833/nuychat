import { AIUsagePanel } from "../../components/AIUsagePanel";
import type { AIUsageStatus, PlatformAIUsageOverviewResponse } from "../../types";

export function AIUsageSection({
  data,
  filters,
  onFilterChange,
  onUpdateBudget
}: {
  data: PlatformAIUsageOverviewResponse | null;
  filters: { search: string; status: "all" | AIUsageStatus; days: number };
  onFilterChange: (next: { search: string; status: "all" | AIUsageStatus; days: number }) => void;
  onUpdateBudget: (
    tenantId: string,
    input: {
      includedTokens?: number;
      monthlyBudgetUsd?: number | null;
      softLimitUsd?: number | null;
      hardLimitUsd?: number | null;
      enforcementMode?: "notify" | "throttle" | "block";
      isActive?: boolean;
    }
  ) => Promise<void>;
}) {
  return (
    <AIUsagePanel
      data={data}
      filters={filters}
      onFilterChange={onFilterChange}
      onUpdateBudget={onUpdateBudget}
    />
  );
}
