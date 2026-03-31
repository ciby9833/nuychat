import type { Knex } from "knex";

type InstallRow = {
  tenant_id: string;
  skill_id: string;
  install_id: string;
  enabled_for_ai: boolean;
  enabled_for_agent: boolean;
  enabled_modules: unknown;
  status: string;
  skill_name: string;
  skill_slug: string;
  manifest: unknown;
};

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function buildSkillContract(input: {
  name: string;
  description: string;
  toolName: string;
  inputSchema: Record<string, unknown>;
}) {
  const requiredInputs = Array.isArray(input.inputSchema.required)
    ? input.inputSchema.required.map((item) => String(item)).filter(Boolean)
    : [];
  return [
    "# What this skill does",
    input.description || `Uses executor ${input.toolName}.`,
    "",
    "# When to use",
    `Use this skill when the customer request matches ${input.name}.`,
    "",
    "# When NOT to use",
    "Do not use when another skill better matches the customer intent or required inputs are missing.",
    "",
    "# Required inputs",
    requiredInputs.length > 0 ? requiredInputs.map((item) => `- ${item}`).join("\n") : "- None",
    "",
    "# Expected outputs",
    "Return a structured result that can be used by task execution and customer response generation.",
    "",
    "# Edge cases",
    "- Missing identifiers",
    "- Upstream system unavailable",
    "- Customer request is ambiguous",
    "",
    "# Failure handling",
    "If inputs are missing or policy blocks execution, the system should clarify, defer, or handoff instead of guessing."
  ].join("\n");
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tenant_skills", (t) => {
    t.uuid("tenant_skill_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("slug", 120).notNullable();
    t.string("name", 160).notNullable();
    t.text("description");
    t.string("status", 32).notNullable().defaultTo("active");
    t.integer("version").notNullable().defaultTo(1);
    t.jsonb("trigger_hints").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("input_schema").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("output_schema").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("policy_config").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("execution_strategy").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.timestamps(true, true);

    t.unique(["tenant_id", "slug"], "tenant_skills_tenant_slug_uniq");
    t.index(["tenant_id", "status"], "tenant_skills_tenant_status_idx");
  });

  await knex.schema.createTable("tenant_skill_assets", (t) => {
    t.uuid("asset_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_skill_id").notNullable().references("tenant_skill_id").inTable("tenant_skills").onDelete("CASCADE");
    t.string("asset_type", 40).notNullable();
    t.string("path", 240);
    t.text("content");
    t.string("mime_type", 120);
    t.timestamps(true, true);

    t.unique(["tenant_skill_id", "asset_type"], "tenant_skill_assets_skill_type_uniq");
    t.index(["tenant_skill_id", "asset_type"], "tenant_skill_assets_skill_type_idx");
  });

  await knex.schema.createTable("tenant_skill_bindings", (t) => {
    t.uuid("binding_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_skill_id").notNullable().references("tenant_skill_id").inTable("tenant_skills").onDelete("CASCADE");
    t.string("binding_type", 40).notNullable();
    t.string("binding_key", 160).notNullable();
    t.jsonb("binding_config").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(["tenant_skill_id", "binding_type", "binding_key"], "tenant_skill_bindings_skill_binding_uniq");
    t.index(["tenant_skill_id", "binding_type", "enabled"], "tenant_skill_bindings_skill_type_enabled_idx");
    t.index(["binding_key", "enabled"], "tenant_skill_bindings_key_enabled_idx");
  });

  await knex.schema.createTable("tenant_skill_availability", (t) => {
    t.uuid("availability_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_skill_id").notNullable().references("tenant_skill_id").inTable("tenant_skills").onDelete("CASCADE");
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("channel", 60);
    t.string("role", 60);
    t.uuid("module_id");
    t.string("owner_mode", 40);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(["tenant_skill_id", "channel", "role", "module_id", "owner_mode"], "tenant_skill_availability_scope_uniq");
    t.index(["tenant_id", "enabled"], "tenant_skill_availability_tenant_enabled_idx");
    t.index(["tenant_skill_id", "enabled"], "tenant_skill_availability_skill_enabled_idx");
  });

  await knex.schema.createTable("skill_runs", (t) => {
    t.uuid("run_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("tenant_skill_id").references("tenant_skill_id").inTable("tenant_skills").onDelete("SET NULL");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.uuid("customer_id").references("customer_id").inTable("customers").onDelete("SET NULL");
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.string("status", 32).notNullable().defaultTo("planned");
    t.string("selected_reason", 240);
    t.decimal("confidence", 5, 4).notNullable().defaultTo(0);
    t.jsonb("planner_trace").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.timestamps(true, true);

    t.index(["tenant_id", "conversation_id", "created_at"], "skill_runs_tenant_conversation_idx");
    t.index(["tenant_id", "tenant_skill_id", "created_at"], "skill_runs_tenant_skill_idx");
  });

  await knex.schema.createTable("skill_tasks", (t) => {
    t.uuid("task_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("run_id").notNullable().references("run_id").inTable("skill_runs").onDelete("CASCADE");
    t.string("step_key", 120).notNullable();
    t.string("task_type", 120).notNullable();
    t.string("status", 32).notNullable().defaultTo("pending");
    t.jsonb("depends_on").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.jsonb("input_payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("output_payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.jsonb("error_payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.integer("retry_count").notNullable().defaultTo(0);
    t.timestamp("started_at", { useTz: true });
    t.timestamp("completed_at", { useTz: true });
    t.timestamps(true, true);

    t.index(["run_id", "status", "created_at"], "skill_tasks_run_status_idx");
  });

  await knex.schema.createTable("skill_execution_traces", (t) => {
    t.uuid("trace_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("run_id").references("run_id").inTable("skill_runs").onDelete("CASCADE");
    t.uuid("task_id").references("task_id").inTable("skill_tasks").onDelete("CASCADE");
    t.string("phase", 40).notNullable();
    t.jsonb("payload").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["run_id", "phase", "created_at"], "skill_execution_traces_run_phase_idx");
  });

  for (const table of [
    "tenant_skills",
    "tenant_skill_assets",
    "tenant_skill_bindings",
    "tenant_skill_availability",
    "skill_runs",
    "skill_tasks",
    "skill_execution_traces"
  ]) {
    await knex.raw(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    `);
  }

  await knex.raw(`
    CREATE POLICY tenant_skills_tenant_isolation ON tenant_skills
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE POLICY tenant_skill_assets_tenant_isolation ON tenant_skill_assets
      USING (tenant_skill_id IN (SELECT tenant_skill_id FROM tenant_skills WHERE tenant_id = current_tenant_id()))
      WITH CHECK (tenant_skill_id IN (SELECT tenant_skill_id FROM tenant_skills WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY tenant_skill_bindings_tenant_isolation ON tenant_skill_bindings
      USING (tenant_skill_id IN (SELECT tenant_skill_id FROM tenant_skills WHERE tenant_id = current_tenant_id()))
      WITH CHECK (tenant_skill_id IN (SELECT tenant_skill_id FROM tenant_skills WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY tenant_skill_availability_tenant_isolation ON tenant_skill_availability
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE POLICY skill_runs_tenant_isolation ON skill_runs
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);
  await knex.raw(`
    CREATE POLICY skill_tasks_tenant_isolation ON skill_tasks
      USING (run_id IN (SELECT run_id FROM skill_runs WHERE tenant_id = current_tenant_id()))
      WITH CHECK (run_id IN (SELECT run_id FROM skill_runs WHERE tenant_id = current_tenant_id()));
  `);
  await knex.raw(`
    CREATE POLICY skill_execution_traces_tenant_isolation ON skill_execution_traces
      USING (run_id IN (SELECT run_id FROM skill_runs WHERE tenant_id = current_tenant_id()))
      WITH CHECK (run_id IN (SELECT run_id FROM skill_runs WHERE tenant_id = current_tenant_id()));
  `);

  for (const table of [
    "tenant_skills",
    "tenant_skill_assets",
    "tenant_skill_bindings",
    "tenant_skill_availability",
    "skill_runs",
    "skill_tasks"
  ]) {
    await knex.raw(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at();
    `);
  }

  const installs = await knex("marketplace_skill_installs as mi")
    .join("marketplace_skills as s", "s.skill_id", "mi.skill_id")
    .join("marketplace_skill_releases as r", "r.release_id", "mi.release_id")
    .where("mi.status", "active")
    .select(
      "mi.tenant_id",
      "mi.skill_id",
      "mi.install_id",
      "mi.enabled_for_ai",
      "mi.enabled_for_agent",
      "mi.enabled_modules",
      "mi.status",
      "s.name as skill_name",
      "s.slug as skill_slug",
      "r.manifest"
    ) as InstallRow[];

  for (const install of installs) {
    const manifest = parseObject(install.manifest);
    const toolName = typeof manifest.toolName === "string" && manifest.toolName.trim() ? manifest.toolName.trim() : null;
    if (!toolName) continue;
    const description = typeof manifest.description === "string" && manifest.description.trim()
      ? manifest.description.trim()
      : `${install.skill_name} skill`;
    const triggerHints = {
      summary: description,
      whenToUse: typeof manifest.whenToUse === "string" ? manifest.whenToUse : null,
      whenNotToUse: typeof manifest.whenNotToUse === "string" ? manifest.whenNotToUse : null,
      keywords: parseStringArray(manifest.keywords)
    };
    const inputSchema = parseObject(manifest.inputSchema);
    const outputSchema = parseObject(manifest.outputSchema);

    const [skill] = await knex("tenant_skills")
      .insert({
        tenant_id: install.tenant_id,
        slug: install.skill_slug,
        name: install.skill_name,
        description,
        status: "active",
        version: 1,
        trigger_hints: JSON.stringify(triggerHints),
        input_schema: JSON.stringify(inputSchema),
        output_schema: JSON.stringify(outputSchema),
        policy_config: JSON.stringify({
          sourceInstallId: install.install_id,
          requiresGuard: true
        }),
        execution_strategy: JSON.stringify({
          plannerMode: "single_skill",
          bindingKey: toolName
        })
      })
      .onConflict(["tenant_id", "slug"])
      .merge({
        description,
        status: "active",
        trigger_hints: JSON.stringify(triggerHints),
        input_schema: JSON.stringify(inputSchema),
        output_schema: JSON.stringify(outputSchema),
        execution_strategy: JSON.stringify({
          plannerMode: "single_skill",
          bindingKey: toolName
        }),
        updated_at: knex.fn.now()
      })
      .returning(["tenant_skill_id"]);

    const tenantSkillId = String((skill as { tenant_skill_id: string }).tenant_skill_id);

    await knex("tenant_skill_assets")
      .insert({
        tenant_skill_id: tenantSkillId,
        asset_type: "skill_md",
        path: "SKILL.md",
        content: buildSkillContract({
          name: install.skill_name,
          description,
          toolName,
          inputSchema
        }),
        mime_type: "text/markdown"
      })
      .onConflict(["tenant_skill_id", "asset_type"])
      .ignore()
      .catch(async () => {
        const existing = await knex("tenant_skill_assets")
          .where({ tenant_skill_id: tenantSkillId, asset_type: "skill_md" })
          .first();
        if (existing) {
          await knex("tenant_skill_assets")
            .where({ tenant_skill_id: tenantSkillId, asset_type: "skill_md" })
            .update({
              content: buildSkillContract({
                name: install.skill_name,
                description,
                toolName,
                inputSchema
              }),
              updated_at: knex.fn.now()
            });
        }
      });

    await knex("tenant_skill_bindings")
      .insert({
        tenant_skill_id: tenantSkillId,
        binding_type: "executor",
        binding_key: toolName,
        binding_config: JSON.stringify({
          sourceInstallId: install.install_id
        }),
        enabled: true
      })
      .onConflict(["tenant_skill_id", "binding_type", "binding_key"])
      .ignore()
      .catch(() => null);

    await knex("tenant_skill_availability")
      .insert({
        tenant_skill_id: tenantSkillId,
        tenant_id: install.tenant_id,
        role: install.enabled_for_ai ? "ai" : install.enabled_for_agent ? "agent" : null,
        enabled: true
      })
      .catch(() => null);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of [
    "tenant_skills",
    "tenant_skill_assets",
    "tenant_skill_bindings",
    "tenant_skill_availability",
    "skill_runs",
    "skill_tasks"
  ]) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table}`);
  }
  await knex.raw("DROP POLICY IF EXISTS skill_execution_traces_tenant_isolation ON skill_execution_traces");
  await knex.raw("DROP POLICY IF EXISTS skill_tasks_tenant_isolation ON skill_tasks");
  await knex.raw("DROP POLICY IF EXISTS skill_runs_tenant_isolation ON skill_runs");
  await knex.raw("DROP POLICY IF EXISTS tenant_skill_availability_tenant_isolation ON tenant_skill_availability");
  await knex.raw("DROP POLICY IF EXISTS tenant_skill_bindings_tenant_isolation ON tenant_skill_bindings");
  await knex.raw("DROP POLICY IF EXISTS tenant_skill_assets_tenant_isolation ON tenant_skill_assets");
  await knex.raw("DROP POLICY IF EXISTS tenant_skills_tenant_isolation ON tenant_skills");

  await knex.schema.dropTableIfExists("skill_execution_traces");
  await knex.schema.dropTableIfExists("skill_tasks");
  await knex.schema.dropTableIfExists("skill_runs");
  await knex.schema.dropTableIfExists("tenant_skill_availability");
  await knex.schema.dropTableIfExists("tenant_skill_bindings");
  await knex.schema.dropTableIfExists("tenant_skill_assets");
  await knex.schema.dropTableIfExists("tenant_skills");
}
