import { AuditLogPanel } from "../../components/AuditLogPanel";
import type { PlatformAuditLogItem } from "../../types";

export function AuditSection({ items, total }: { items: PlatformAuditLogItem[]; total: number }) {
  return <AuditLogPanel items={items} total={total} />;
}
