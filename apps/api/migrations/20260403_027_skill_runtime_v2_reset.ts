import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_installs_set_updated_at ON marketplace_skill_installs");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_releases_set_updated_at ON marketplace_skill_releases");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skills_set_updated_at ON marketplace_skills");
  await knex.raw("DROP POLICY IF EXISTS marketplace_skill_installs_tenant_isolation ON marketplace_skill_installs");
  await knex.raw("DROP POLICY IF EXISTS skill_execution_approvals_tenant_isolation ON skill_execution_approvals");
  await knex.schema.dropTableIfExists("skill_execution_approvals");
  await knex.schema.dropTableIfExists("marketplace_install_secrets");
  await knex.schema.dropTableIfExists("marketplace_skill_installs");
  await knex.schema.dropTableIfExists("marketplace_skill_releases");
  await knex.schema.dropTableIfExists("marketplace_skills");

  await knex.schema.createTable("marketplace_skills", (t) => {
    t.uuid("skill_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("slug", 120).notNullable().unique();
    t.string("name", 160).notNullable();
    t.text("description").notNullable().defaultTo("");
    t.string("tier", 20).notNullable().defaultTo("official");
    t.uuid("owner_tenant_id").references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("provider_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.string("status", 20).notNullable().defaultTo("draft");
    t.string("latest_version", 40).notNullable().defaultTo("1.0.0");
    t.jsonb("manifest").notNullable().defaultTo("{}");
    t.timestamps(true, true);
    t.index(["tier", "status"], "marketplace_skills_tier_status_idx");
    t.index(["owner_tenant_id", "status"], "marketplace_skills_owner_status_idx");
  });

  await knex.schema.createTable("marketplace_skill_releases", (t) => {
    t.uuid("release_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("skill_id").notNullable().references("skill_id").inTable("marketplace_skills").onDelete("CASCADE");
    t.string("version", 40).notNullable();
    t.text("changelog").notNullable().defaultTo("");
    t.jsonb("manifest").notNullable().defaultTo("{}");
    t.text("entrypoint");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("published_at", { useTz: true });
    t.timestamps(true, true);
    t.unique(["skill_id", "version"], "marketplace_skill_releases_skill_version_uniq");
    t.index(["skill_id", "is_active"], "marketplace_skill_releases_skill_active_idx");
  });

  await knex.schema.createTable("marketplace_skill_installs", (t) => {
    t.uuid("install_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("skill_id").notNullable().references("skill_id").inTable("marketplace_skills").onDelete("CASCADE");
    t.uuid("release_id").notNullable().references("release_id").inTable("marketplace_skill_releases").onDelete("RESTRICT");
    t.string("status", 20).notNullable().defaultTo("active");
    t.uuid("installed_by_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamp("installed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.jsonb("enabled_modules").notNullable().defaultTo("[]");
    t.jsonb("enabled_skill_groups").notNullable().defaultTo("[]");
    t.boolean("enabled_for_ai").notNullable().defaultTo(true);
    t.boolean("enabled_for_agent").notNullable().defaultTo(true);
    t.integer("rate_limit_per_minute").notNullable().defaultTo(60);
    t.boolean("ai_whitelisted").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.unique(["tenant_id", "skill_id"], "marketplace_skill_installs_tenant_skill_uniq");
    t.index(["tenant_id", "status"], "marketplace_skill_installs_tenant_status_idx");
    t.index(["skill_id", "status"], "marketplace_skill_installs_skill_status_idx");
  });

  await knex.schema.createTable("skill_invocations", (t) => {
    t.uuid("invocation_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.uuid("install_id").references("install_id").inTable("marketplace_skill_installs").onDelete("SET NULL");
    t.uuid("skill_id").references("skill_id").inTable("marketplace_skills").onDelete("SET NULL");
    t.string("skill_name", 120).notNullable();
    t.string("actor_type", 20).notNullable();
    t.string("decision", 20).notNullable();
    t.string("deny_reason", 40);
    t.integer("duration_ms");
    t.jsonb("args").notNullable().defaultTo("{}");
    t.jsonb("result").notNullable().defaultTo("{}");
    t.timestamp("invoked_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);
    t.index(["tenant_id", "conversation_id", "invoked_at"], "skill_invocations_tenant_conversation_idx");
    t.index(["tenant_id", "skill_name", "invoked_at"], "skill_invocations_tenant_skill_idx");
  });

  await knex.raw(`
    CREATE TRIGGER marketplace_skills_set_updated_at
    BEFORE UPDATE ON marketplace_skills
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
  await knex.raw(`
    CREATE TRIGGER marketplace_skill_releases_set_updated_at
    BEFORE UPDATE ON marketplace_skill_releases
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
  await knex.raw(`
    CREATE TRIGGER marketplace_skill_installs_set_updated_at
    BEFORE UPDATE ON marketplace_skill_installs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);
  await knex.raw(`
    CREATE TRIGGER skill_invocations_set_updated_at
    BEFORE UPDATE ON skill_invocations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  `);

  await knex.raw(`
    ALTER TABLE marketplace_skill_installs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE marketplace_skill_installs FORCE ROW LEVEL SECURITY;
    CREATE POLICY marketplace_skill_installs_tenant_isolation ON marketplace_skill_installs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  await knex.raw(`
    ALTER TABLE skill_invocations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE skill_invocations FORCE ROW LEVEL SECURITY;
    CREATE POLICY skill_invocations_tenant_isolation ON skill_invocations
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  const officialSkills = [
    {
      slug: "order-skill",
      name: "Order Lookup",
      description: "Lookup order status by order id, email, or phone.",
      manifest: {
        runtime: "builtin",
        toolName: "lookup_order",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" }
          }
        }
      }
    },
    {
      slug: "logistics-skill",
      name: "Logistics Tracking",
      description: "Track shipment lifecycle by AWB/tracking number.",
      manifest: {
        runtime: "builtin",
        toolName: "track_shipment",
        inputSchema: {
          type: "object",
          properties: {
            trackingNumber: { type: "string" },
            orderId: { type: "string" }
          }
        }
      }
    },
    {
      slug: "crm-skill",
      name: "CRM Profile",
      description: "Load customer context from CRM profile/history.",
      manifest: {
        runtime: "builtin",
        toolName: "get_customer_info",
        inputSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            email: { type: "string" }
          }
        }
      }
    },
    {
      slug: "knowledge-base-skill",
      name: "Knowledge Base Search",
      description: "Search and retrieve internal knowledge articles.",
      manifest: {
        runtime: "builtin",
        toolName: "search_knowledge_base",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"]
        }
      }
    }
  ];

  for (const item of officialSkills) {
    const [skill] = await knex("marketplace_skills")
      .insert({
        slug: item.slug,
        name: item.name,
        description: item.description,
        tier: "official",
        status: "published",
        latest_version: "1.0.0",
        manifest: JSON.stringify(item.manifest)
      })
      .returning(["skill_id", "manifest"]);

    await knex("marketplace_skill_releases").insert({
      skill_id: skill.skill_id,
      version: "1.0.0",
      changelog: "Runtime v2 baseline",
      manifest: skill.manifest,
      entrypoint: `builtin:${item.slug}`,
      is_active: true,
      published_at: knex.fn.now()
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS skill_invocations_tenant_isolation ON skill_invocations");
  await knex.raw("DROP POLICY IF EXISTS marketplace_skill_installs_tenant_isolation ON marketplace_skill_installs");
  await knex.raw("DROP TRIGGER IF EXISTS skill_invocations_set_updated_at ON skill_invocations");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_installs_set_updated_at ON marketplace_skill_installs");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_releases_set_updated_at ON marketplace_skill_releases");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skills_set_updated_at ON marketplace_skills");
  await knex.schema.dropTableIfExists("skill_invocations");
  await knex.schema.dropTableIfExists("marketplace_skill_installs");
  await knex.schema.dropTableIfExists("marketplace_skill_releases");
  await knex.schema.dropTableIfExists("marketplace_skills");
}
