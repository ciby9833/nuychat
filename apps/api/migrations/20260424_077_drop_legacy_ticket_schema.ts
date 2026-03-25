import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS tickets_case_idx");
  await knex.raw("DROP INDEX IF EXISTS ticket_events_time_idx");
  await knex.raw("DROP INDEX IF EXISTS ticket_events_type_idx");
  await knex.raw("DROP INDEX IF EXISTS ticket_events_ticket_idx");
  await knex.raw("DROP INDEX IF EXISTS ticket_notes_ticket_idx");
  await knex.raw("DROP INDEX IF EXISTS tickets_sla_idx");
  await knex.raw("DROP INDEX IF EXISTS tickets_status_priority_idx");
  await knex.raw("DROP INDEX IF EXISTS tickets_conversation_idx");

  await knex.raw("DROP POLICY IF EXISTS ticket_events_tenant_isolation ON ticket_events");
  await knex.raw("DROP POLICY IF EXISTS ticket_notes_tenant_isolation ON ticket_notes");
  await knex.raw("DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets");
  await knex.raw("DROP TRIGGER IF EXISTS tickets_set_updated_at ON tickets");

  await knex.schema.dropTableIfExists("ticket_events");
  await knex.schema.dropTableIfExists("ticket_notes");
  await knex.schema.dropTableIfExists("tickets");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable("tickets", (t) => {
    t.uuid("ticket_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id").references("conversation_id").inTable("conversations").onDelete("SET NULL");
    t.uuid("case_id").references("case_id").inTable("conversation_cases").onDelete("SET NULL");
    t.string("title", 200).notNullable();
    t.text("description");
    t.string("status", 30).notNullable().defaultTo("open");
    t.string("priority", 20).notNullable().defaultTo("normal");
    t.uuid("assignee_id").references("identity_id").inTable("identities").onDelete("SET NULL");
    t.timestamp("sla_deadline_at", { useTz: true });
    t.timestamp("resolved_at", { useTz: true });
    t.timestamp("closed_at", { useTz: true });
    t.string("created_by_type", 20).notNullable().defaultTo("agent");
    t.uuid("created_by_id");
    t.timestamps(true, true);

    t.index(["tenant_id", "conversation_id"], "tickets_conversation_idx");
    t.index(["tenant_id", "status", "priority"], "tickets_status_priority_idx");
    t.index(["tenant_id", "sla_deadline_at"], "tickets_sla_idx");
    t.index(["tenant_id", "case_id"], "tickets_case_idx");
  });

  await knex.schema.createTable("ticket_notes", (t) => {
    t.uuid("note_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("ticket_id").notNullable().references("ticket_id").inTable("tickets").onDelete("CASCADE");
    t.text("body").notNullable();
    t.boolean("is_internal").notNullable().defaultTo(true);
    t.string("author_type", 20).notNullable().defaultTo("agent");
    t.uuid("author_id");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "ticket_id"], "ticket_notes_ticket_idx");
  });

  await knex.schema.createTable("ticket_events", (t) => {
    t.uuid("event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("ticket_id").notNullable().references("ticket_id").inTable("tickets").onDelete("CASCADE");
    t.string("event_type", 40).notNullable();
    t.string("from_value", 200);
    t.string("to_value", 200);
    t.string("actor_type", 20).notNullable().defaultTo("system");
    t.uuid("actor_id");
    t.jsonb("metadata").defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "ticket_id"], "ticket_events_ticket_idx");
    t.index(["tenant_id", "event_type"], "ticket_events_type_idx");
    t.index(["ticket_id", "created_at"], "ticket_events_time_idx");
  });

  for (const table of ["tickets", "ticket_notes", "ticket_events"] as const) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);
  }

  await knex.raw(`
    CREATE TRIGGER tickets_set_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);
}
