import { SessionPanel } from "../../components/SessionPanel";
import type { PlatformSessionItem } from "../../types";

export function SessionsSection({
  items,
  total,
  filters,
  onFilterChange,
  onBulkRevoke,
  onRevoke
}: {
  items: PlatformSessionItem[];
  total: number;
  filters: {
    scope: "all" | "tenant" | "platform";
    status: "active" | "revoked" | "expired";
    identityId: string;
    tenantId: string;
  };
  onFilterChange: (next: {
    scope: "all" | "tenant" | "platform";
    status: "active" | "revoked" | "expired";
    identityId: string;
    tenantId: string;
  }) => void;
  onBulkRevoke: () => Promise<void>;
  onRevoke: (scope: "tenant" | "platform", sessionId: string) => Promise<void>;
}) {
  return (
    <SessionPanel
      items={items}
      total={total}
      filters={filters}
      onFilterChange={onFilterChange}
      onBulkRevoke={onBulkRevoke}
      onRevoke={onRevoke}
    />
  );
}
