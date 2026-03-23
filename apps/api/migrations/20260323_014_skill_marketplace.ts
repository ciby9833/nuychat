import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("marketplace_skills", (t) => {
    t.uuid("skill_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("slug", 120).notNullable().unique();
    t.string("name", 160).notNullable();
    t.text("description").notNullable().defaultTo("");
    t.string("tier", 20).notNullable().defaultTo("official"); // official | private | third_party
    t.uuid("owner_tenant_id").references("tenant_id").inTable("tenants").onDelete("SET NULL");
    t.uuid("provider_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.string("status", 20).notNullable().defaultTo("draft"); // draft | published | deprecated
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
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamp("published_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);

    t.unique(["skill_id", "version"], "marketplace_skill_releases_skill_version_uniq");
    t.index(["skill_id", "is_active"], "marketplace_skill_releases_skill_active_idx");
  });

  await knex.schema.createTable("marketplace_skill_installs", (t) => {
    t.uuid("install_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("skill_id").notNullable().references("skill_id").inTable("marketplace_skills").onDelete("CASCADE");
    t.uuid("release_id").notNullable().references("release_id").inTable("marketplace_skill_releases").onDelete("RESTRICT");
    t.string("status", 20).notNullable().defaultTo("active"); // active | disabled
    t.uuid("installed_by_identity_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamp("installed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamps(true, true);

    t.unique(["tenant_id", "skill_id"], "marketplace_skill_installs_tenant_skill_uniq");
    t.index(["tenant_id", "status"], "marketplace_skill_installs_tenant_status_idx");
    t.index(["skill_id", "status"], "marketplace_skill_installs_skill_status_idx");
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

  const now = knex.fn.now();
  const officialSkills = [
    {
      slug: "order-skill",
      name: "Order Skill",
      description: "Official skill for order lookup and status checks.",
      tier: "official",
      status: "published",
      latest_version: "1.0.0",
      manifest: JSON.stringify({ runtime: "builtin", name: "order_skill", category: "order" })
    },
    {
      slug: "logistics-skill",
      name: "Logistics Skill",
      description: "Official skill for shipment tracking and logistics status.",
      tier: "official",
      status: "published",
      latest_version: "1.0.0",
      manifest: JSON.stringify({ runtime: "builtin", name: "logistics_skill", category: "logistics" })
    },
    {
      slug: "crm-skill",
      name: "CRM Skill",
      description: "Official skill for customer profile and history lookup.",
      tier: "official",
      status: "published",
      latest_version: "1.0.0",
      manifest: JSON.stringify({ runtime: "builtin", name: "crm_skill", category: "crm" })
    },
    {
      slug: "knowledge-base-skill",
      name: "Knowledge Base Skill",
      description: "Official skill for knowledge base search and retrieval.",
      tier: "official",
      status: "published",
      latest_version: "1.0.0",
      manifest: JSON.stringify({ runtime: "builtin", name: "knowledge_base_skill", category: "knowledge" })
    }
  ];

  for (const item of officialSkills) {
    const [skill] = await knex("marketplace_skills")
      .insert({
        slug: item.slug,
        name: item.name,
        description: item.description,
        tier: item.tier,
        status: item.status,
        latest_version: item.latest_version,
        manifest: item.manifest,
        created_at: now,
        updated_at: now
      })
      .onConflict("slug")
      .merge({
        name: item.name,
        description: item.description,
        tier: item.tier,
        status: item.status,
        latest_version: item.latest_version,
        manifest: item.manifest,
        updated_at: now
      })
      .returning(["skill_id", "latest_version", "manifest"]);

    await knex("marketplace_skill_releases")
      .insert({
        skill_id: skill.skill_id,
        version: item.latest_version,
        changelog: "Initial official release",
        manifest: skill.manifest,
        is_active: true,
        published_at: now,
        created_at: now,
        updated_at: now
      })
      .onConflict(["skill_id", "version"])
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_installs_set_updated_at ON marketplace_skill_installs");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skill_releases_set_updated_at ON marketplace_skill_releases");
  await knex.raw("DROP TRIGGER IF EXISTS marketplace_skills_set_updated_at ON marketplace_skills");

  await knex.schema.dropTableIfExists("marketplace_skill_installs");
  await knex.schema.dropTableIfExists("marketplace_skill_releases");
  await knex.schema.dropTableIfExists("marketplace_skills");
}
