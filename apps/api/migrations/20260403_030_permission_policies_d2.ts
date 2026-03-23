import type { Knex } from "knex";

const ROLES = ["tenant_admin", "admin", "supervisor", "senior_agent", "agent", "readonly"] as const;
const PERMISSIONS = [
  "admin_console.read",
  "admin_console.write",
  "org.manage",
  "agents.manage",
  "routing.manage",
  "channels.manage",
  "kb.manage",
  "ai.manage",
  "marketplace.manage",
  "analytics.read"
] as const;

type Role = (typeof ROLES)[number];
type PermissionKey = (typeof PERMISSIONS)[number];

const DEFAULT_MATRIX: Record<Role, Record<PermissionKey, boolean>> = {
  tenant_admin: {
    "admin_console.read": true,
    "admin_console.write": true,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": true,
    "channels.manage": true,
    "kb.manage": true,
    "ai.manage": true,
    "marketplace.manage": true,
    "analytics.read": true
  },
  admin: {
    "admin_console.read": true,
    "admin_console.write": true,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": true,
    "channels.manage": true,
    "kb.manage": true,
    "ai.manage": true,
    "marketplace.manage": true,
    "analytics.read": true
  },
  supervisor: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": true,
    "agents.manage": true,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  },
  senior_agent: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  },
  agent: {
    "admin_console.read": false,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": false
  },
  readonly: {
    "admin_console.read": true,
    "admin_console.write": false,
    "org.manage": false,
    "agents.manage": false,
    "routing.manage": false,
    "channels.manage": false,
    "kb.manage": false,
    "ai.manage": false,
    "marketplace.manage": false,
    "analytics.read": true
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("permission_policies", (t) => {
    t.uuid("policy_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("role", 40).notNullable();
    t.string("permission_key", 80).notNullable();
    t.boolean("is_allowed").notNullable().defaultTo(false);
    t.uuid("updated_by_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamps(true, true);
    t.unique(["tenant_id", "role", "permission_key"], "permission_policies_tenant_role_permission_uniq");
    t.index(["tenant_id", "role"], "permission_policies_tenant_role_idx");
  });

  await knex.raw(`
    CREATE TRIGGER permission_policies_set_updated_at
    BEFORE UPDATE ON permission_policies
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    ALTER TABLE permission_policies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE permission_policies FORCE ROW LEVEL SECURITY;
    CREATE POLICY permission_policies_tenant_isolation ON permission_policies
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  const tenants = await knex("tenants").select("tenant_id");
  for (const tenant of tenants as Array<{ tenant_id: string }>) {
    const rows: Array<{
      tenant_id: string;
      role: string;
      permission_key: string;
      is_allowed: boolean;
    }> = [];
    for (const role of ROLES) {
      for (const permissionKey of PERMISSIONS) {
        rows.push({
          tenant_id: tenant.tenant_id,
          role,
          permission_key: permissionKey,
          is_allowed: DEFAULT_MATRIX[role][permissionKey]
        });
      }
    }
    if (rows.length > 0) {
      await knex("permission_policies").insert(rows);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS permission_policies_tenant_isolation ON permission_policies");
  await knex.raw("DROP TRIGGER IF EXISTS permission_policies_set_updated_at ON permission_policies");
  await knex.schema.dropTableIfExists("permission_policies");
}
