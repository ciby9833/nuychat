import { MarketplacePanel } from "../../components/MarketplacePanel";
import type { MarketplaceInstallItem, MarketplaceSkillItem, MarketplaceTier, TenantItem } from "../../types";

export function MarketplaceSection({
  skills,
  installs,
  tenants,
  onCreate,
  onUpdate,
  onPublish,
  onDisable,
  onRetract,
  onDelete
}: {
  skills: MarketplaceSkillItem[];
  installs: MarketplaceInstallItem[];
  tenants: TenantItem[];
  onCreate: (input: {
    slug: string;
    name: string;
    description: string;
    tier: MarketplaceTier;
    ownerTenantId?: string;
    version: string;
    changelog: string;
    manifest: Record<string, unknown>;
  }) => Promise<void>;
  onUpdate: (skillId: string, input: { name?: string; description?: string; status?: "draft" | "published" | "deprecated" }) => Promise<void>;
  onPublish: (skillId: string, input: { version: string; changelog: string }) => Promise<void>;
  onDisable: (skillId: string) => Promise<void>;
  onRetract: (skillId: string) => Promise<void>;
  onDelete: (skillId: string) => Promise<void>;
}) {
  return (
    <MarketplacePanel
      skills={skills}
      installs={installs}
      tenants={tenants.map((t) => ({ tenantId: t.tenantId, slug: t.slug, name: t.name }))}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onPublish={onPublish}
      onDisable={onDisable}
      onRetract={onRetract}
      onDelete={onDelete}
    />
  );
}
