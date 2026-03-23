import { BillingPanel } from "../../components/BillingPanel";
import type {
  BillingInvoiceStatus,
  BillingStatementExportOptions,
  PlatformBillingOverviewResponse
} from "../../types";

export function BillingSection({
  data,
  filters,
  onFilterChange,
  onCloseCycle,
  onReconcile,
  onExport
}: {
  data: PlatformBillingOverviewResponse | null;
  filters: { search: string; status: "all" | BillingInvoiceStatus };
  onFilterChange: (next: { search: string; status: "all" | BillingInvoiceStatus }) => void;
  onCloseCycle: (input: { periodStart: string; periodEnd: string; dueDays: number; currency: string; tenantId?: string }) => Promise<void>;
  onReconcile: (invoiceId: string, input: { amount: number; method?: string; note?: string }) => Promise<void>;
  onExport: (invoiceId: string, format: "csv" | "pdf", options: BillingStatementExportOptions) => Promise<void>;
}) {
  return (
    <BillingPanel
      data={data}
      filters={filters}
      onFilterChange={onFilterChange}
      onCloseCycle={onCloseCycle}
      onReconcile={onReconcile}
      onExport={onExport}
    />
  );
}
