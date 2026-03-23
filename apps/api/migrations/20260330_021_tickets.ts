import type { Knex } from "knex";

// ─── SLA defaults (hours) ─────────────────────────────────────────────────────
// urgent=1h, high=4h, normal=8h, low=24h
// SLA deadline is computed at ticket creation time in ticket.routes.ts.

export async function up(knex: Knex): Promise<void> {
  // ── tickets ──────────────────────────────────────────────────────────────────
  await knex.schema.createTable("tickets", (t) => {
    t.uuid("ticket_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("conversation_id")
      .references("conversation_id")
      .inTable("conversations")
      .onDelete("SET NULL"); // nullable — ticket can outlive the conversation

    t.string("title", 200).notNullable();
    t.text("description");

    // status: open | in_progress | pending_customer | resolved | closed
    t.string("status", 30).notNullable().defaultTo("open");

    // priority: urgent | high | normal | low
    t.string("priority", 20).notNullable().defaultTo("normal");

    // optional assignee (identity_id from identities table)
    t.uuid("assignee_id").references("identity_id").inTable("identities").onDelete("SET NULL");

    // SLA deadline — computed from priority at creation time
    t.timestamp("sla_deadline_at", { useTz: true });

    // resolved / closed timestamps
    t.timestamp("resolved_at", { useTz: true });
    t.timestamp("closed_at", { useTz: true });

    // creator
    t.string("created_by_type", 20).notNullable().defaultTo("agent"); // agent | ai | system
    t.uuid("created_by_id"); // identity_id or agent_id, may be null for system

    t.timestamps(true, true);

    // fast lookups
    t.index(["tenant_id", "conversation_id"], "tickets_conversation_idx");
    t.index(["tenant_id", "status", "priority"], "tickets_status_priority_idx");
    t.index(["tenant_id", "sla_deadline_at"], "tickets_sla_idx");
  });

  // ── ticket_notes ──────────────────────────────────────────────────────────────
  await knex.schema.createTable("ticket_notes", (t) => {
    t.uuid("note_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.uuid("ticket_id").notNullable().references("ticket_id").inTable("tickets").onDelete("CASCADE");

    t.text("body").notNullable();
    t.boolean("is_internal").notNullable().defaultTo(true); // true = internal note; false = customer-visible

    t.string("author_type", 20).notNullable().defaultTo("agent"); // agent | ai | system
    t.uuid("author_id"); // identity_id, nullable for system notes

    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["tenant_id", "ticket_id"], "ticket_notes_ticket_idx");
  });

  // ── Row-Level Security ────────────────────────────────────────────────────────
  for (const table of ["tickets", "ticket_notes"] as const) {
    await knex.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await knex.raw(`
      CREATE POLICY ${table}_tenant_isolation ON ${table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
    `);
  }

  // ── updated_at trigger for tickets ───────────────────────────────────────────
  await knex.raw(`
    CREATE TRIGGER tickets_set_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS tickets_set_updated_at ON tickets");
  await knex.raw("DROP POLICY IF EXISTS ticket_notes_tenant_isolation ON ticket_notes");
  await knex.raw("DROP POLICY IF EXISTS tickets_tenant_isolation ON tickets");
  await knex.schema.dropTableIfExists("ticket_notes");
  await knex.schema.dropTableIfExists("tickets");
}
