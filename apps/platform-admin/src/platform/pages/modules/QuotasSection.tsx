import { QuotaOverviewPanel } from "../../components/QuotaOverviewPanel";
import type { PlatformQuotaOverviewResponse } from "../../types";

export function QuotasSection({
  data,
  filters,
  onFilterChange,
  onUpdateTenant
}: {
  data: PlatformQuotaOverviewResponse | null;
  filters: { search: string; status: "all" | "healthy" | "warning" | "exceeded" | "unlimited" };
  onFilterChange: (next: { search: string; status: "all" | "healthy" | "warning" | "exceeded" | "unlimited" }) => void;
  onUpdateTenant: (
    tenantId: string,
    input: {
      name?: string;
      slug?: string;
      status?: "active" | "suspended" | "inactive";
      planCode?: string;
      operatingMode?: string;
      licensedSeats?: number | null;
      licensedAiSeats?: number | null;
    }
  ) => Promise<void>;
}) {
  return <QuotaOverviewPanel data={data} filters={filters} onFilterChange={onFilterChange} onUpdateTenant={onUpdateTenant} />;
}
