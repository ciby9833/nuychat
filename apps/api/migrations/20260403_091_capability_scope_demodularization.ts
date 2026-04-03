import type { Knex } from "knex";

async function renameCapabilityAvailabilityScope(knex: Knex) {
  const hasTable = await knex.schema.hasTable("capability_availability");
  if (!hasTable) return;

  const hasCapabilityScope = await knex.schema.hasColumn("capability_availability", "capability_scope");
  if (!hasCapabilityScope) {
    await knex.schema.alterTable("capability_availability", (t) => {
      t.text("capability_scope").nullable();
    });
  }

  const hasModuleId = await knex.schema.hasColumn("capability_availability", "module_id");
  if (hasModuleId) {
    await knex("capability_availability")
      .whereNotNull("module_id")
      .update({
        capability_scope: knex.raw("module_id::text")
      });
  }

  await knex.raw(`
    ALTER TABLE capability_availability
    DROP CONSTRAINT IF EXISTS capability_availability_scope_uniq
  `);

  if (hasModuleId) {
    await knex.schema.alterTable("capability_availability", (t) => {
      t.dropColumn("module_id");
    });
  }

  await knex.schema.alterTable("capability_availability", (t) => {
    t.unique(
      ["capability_id", "channel", "role", "capability_scope", "owner_mode"],
      "capability_availability_scope_uniq"
    );
  });
}

async function renameTenantSkillAvailabilityScope(knex: Knex) {
  const hasTable = await knex.schema.hasTable("tenant_skill_availability");
  if (!hasTable) return;

  const hasCapabilityScope = await knex.schema.hasColumn("tenant_skill_availability", "capability_scope");
  if (!hasCapabilityScope) {
    await knex.schema.alterTable("tenant_skill_availability", (t) => {
      t.text("capability_scope").nullable();
    });
  }

  const hasModuleId = await knex.schema.hasColumn("tenant_skill_availability", "module_id");
  if (hasModuleId) {
    await knex("tenant_skill_availability")
      .whereNotNull("module_id")
      .update({
        capability_scope: knex.raw("module_id::text")
      });
  }

  await knex.raw(`
    ALTER TABLE tenant_skill_availability
    DROP CONSTRAINT IF EXISTS tenant_skill_availability_scope_uniq
  `);

  if (hasModuleId) {
    await knex.schema.alterTable("tenant_skill_availability", (t) => {
      t.dropColumn("module_id");
    });
  }

  await knex.schema.alterTable("tenant_skill_availability", (t) => {
    t.unique(
      ["tenant_skill_id", "channel", "role", "capability_scope", "owner_mode"],
      "tenant_skill_availability_scope_uniq"
    );
  });
}

async function dropLegacyRoutingColumns(knex: Knex) {
  const hasQueueAssignments = await knex.schema.hasTable("queue_assignments");
  if (hasQueueAssignments) {
    const hasModuleId = await knex.schema.hasColumn("queue_assignments", "module_id");
    const hasSkillGroupId = await knex.schema.hasColumn("queue_assignments", "skill_group_id");
    if (hasModuleId || hasSkillGroupId) {
      await knex.schema.alterTable("queue_assignments", (t) => {
        if (hasModuleId) t.dropColumn("module_id");
        if (hasSkillGroupId) t.dropColumn("skill_group_id");
      });
    }
  }

  const hasMarketplaceInstalls = await knex.schema.hasTable("marketplace_skill_installs");
  if (hasMarketplaceInstalls) {
    const hasEnabledModules = await knex.schema.hasColumn("marketplace_skill_installs", "enabled_modules");
    const hasEnabledSkillGroups = await knex.schema.hasColumn("marketplace_skill_installs", "enabled_skill_groups");
    if (hasEnabledModules || hasEnabledSkillGroups) {
      await knex.schema.alterTable("marketplace_skill_installs", (t) => {
        if (hasEnabledModules) t.dropColumn("enabled_modules");
        if (hasEnabledSkillGroups) t.dropColumn("enabled_skill_groups");
      });
    }
  }
}

async function dropLegacyRoutingTables(knex: Knex) {
  await knex.schema.dropTableIfExists("agent_skills");
  await knex.schema.dropTableIfExists("skill_groups");
  await knex.schema.dropTableIfExists("modules");
}

export async function up(knex: Knex): Promise<void> {
  await renameCapabilityAvailabilityScope(knex);
  await renameTenantSkillAvailabilityScope(knex);
  await dropLegacyRoutingColumns(knex);
  await dropLegacyRoutingTables(knex);
}

export async function down(knex: Knex): Promise<void> {
  const hasModules = await knex.schema.hasTable("modules");
  if (!hasModules) {
    await knex.schema.createTable("modules", (t) => {
      t.uuid("module_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable();
      t.string("code", 80).notNullable();
      t.string("name", 120).notNullable();
      t.text("description");
      t.string("status", 32).notNullable().defaultTo("active");
      t.timestamps(true, true);
    });
  }

  const hasSkillGroups = await knex.schema.hasTable("skill_groups");
  if (!hasSkillGroups) {
    await knex.schema.createTable("skill_groups", (t) => {
      t.uuid("skill_group_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable();
      t.uuid("module_id").notNullable().references("module_id").inTable("modules").onDelete("CASCADE");
      t.string("code", 80).notNullable();
      t.string("name", 120).notNullable();
      t.text("description");
      t.string("status", 32).notNullable().defaultTo("active");
      t.timestamps(true, true);
    });
  }

  const hasAgentSkills = await knex.schema.hasTable("agent_skills");
  if (!hasAgentSkills) {
    await knex.schema.createTable("agent_skills", (t) => {
      t.uuid("agent_skill_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
      t.uuid("tenant_id").notNullable();
      t.uuid("agent_id").notNullable();
      t.uuid("skill_group_id").notNullable().references("skill_group_id").inTable("skill_groups").onDelete("CASCADE");
      t.integer("priority").notNullable().defaultTo(0);
      t.string("status", 32).notNullable().defaultTo("active");
      t.timestamps(true, true);
      t.unique(["agent_id", "skill_group_id"]);
    });
  }

  const hasQueueAssignments = await knex.schema.hasTable("queue_assignments");
  if (hasQueueAssignments) {
    const hasModuleId = await knex.schema.hasColumn("queue_assignments", "module_id");
    const hasSkillGroupId = await knex.schema.hasColumn("queue_assignments", "skill_group_id");
    if (!hasModuleId || !hasSkillGroupId) {
      await knex.schema.alterTable("queue_assignments", (t) => {
        if (!hasModuleId) t.uuid("module_id").references("module_id").inTable("modules").onDelete("SET NULL");
        if (!hasSkillGroupId) t.uuid("skill_group_id").references("skill_group_id").inTable("skill_groups").onDelete("SET NULL");
      });
    }
  }

  const hasMarketplaceInstalls = await knex.schema.hasTable("marketplace_skill_installs");
  if (hasMarketplaceInstalls) {
    const hasEnabledModules = await knex.schema.hasColumn("marketplace_skill_installs", "enabled_modules");
    const hasEnabledSkillGroups = await knex.schema.hasColumn("marketplace_skill_installs", "enabled_skill_groups");
    if (!hasEnabledModules || !hasEnabledSkillGroups) {
      await knex.schema.alterTable("marketplace_skill_installs", (t) => {
        if (!hasEnabledModules) t.jsonb("enabled_modules").notNullable().defaultTo("[]");
        if (!hasEnabledSkillGroups) t.jsonb("enabled_skill_groups").notNullable().defaultTo("[]");
      });
    }
  }

  const hasCapabilityAvailability = await knex.schema.hasTable("capability_availability");
  if (hasCapabilityAvailability) {
    const hasCapabilityScope = await knex.schema.hasColumn("capability_availability", "capability_scope");
    const hasModuleId = await knex.schema.hasColumn("capability_availability", "module_id");

    if (!hasModuleId) {
      await knex.schema.alterTable("capability_availability", (t) => {
        t.uuid("module_id").nullable();
      });
    }

    if (hasCapabilityScope) {
      await knex("capability_availability")
        .whereNotNull("capability_scope")
        .update({
          module_id: knex.raw(`
            CASE
              WHEN capability_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN capability_scope::uuid
              ELSE NULL
            END
          `)
        });
    }

    await knex.raw(`
      ALTER TABLE capability_availability
      DROP CONSTRAINT IF EXISTS capability_availability_scope_uniq
    `);
    await knex.schema.alterTable("capability_availability", (t) => {
      t.unique(["capability_id", "channel", "role", "module_id", "owner_mode"], "capability_availability_scope_uniq");
    });

    if (hasCapabilityScope) {
      await knex.schema.alterTable("capability_availability", (t) => {
        t.dropColumn("capability_scope");
      });
    }
  }

  const hasTenantSkillAvailability = await knex.schema.hasTable("tenant_skill_availability");
  if (hasTenantSkillAvailability) {
    const hasCapabilityScope = await knex.schema.hasColumn("tenant_skill_availability", "capability_scope");
    const hasModuleId = await knex.schema.hasColumn("tenant_skill_availability", "module_id");

    if (!hasModuleId) {
      await knex.schema.alterTable("tenant_skill_availability", (t) => {
        t.uuid("module_id").nullable();
      });
    }

    if (hasCapabilityScope) {
      await knex("tenant_skill_availability")
        .whereNotNull("capability_scope")
        .update({
          module_id: knex.raw(`
            CASE
              WHEN capability_scope ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN capability_scope::uuid
              ELSE NULL
            END
          `)
        });
    }

    await knex.raw(`
      ALTER TABLE tenant_skill_availability
      DROP CONSTRAINT IF EXISTS tenant_skill_availability_scope_uniq
    `);
    await knex.schema.alterTable("tenant_skill_availability", (t) => {
      t.unique(["tenant_skill_id", "channel", "role", "module_id", "owner_mode"], "tenant_skill_availability_scope_uniq");
    });

    if (hasCapabilityScope) {
      await knex.schema.alterTable("tenant_skill_availability", (t) => {
        t.dropColumn("capability_scope");
      });
    }
  }
}
