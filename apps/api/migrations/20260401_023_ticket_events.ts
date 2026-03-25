import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ticket_events", (t) => {
    t.uuid("event_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));

    t.uuid("tenant_id")
      .notNullable()
      .references("tenant_id")
      .inTable("tenants")
      .onDelete("CASCADE");

    t.uuid("ticket_id")
      .notNullable()
      .references("ticket_id")
      .inTable("tickets")
      .onDelete("CASCADE");

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

  await knex.raw("ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY");
  await knex.raw(`
    CREATE POLICY ticket_events_tenant_isolation ON ticket_events
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP POLICY IF EXISTS ticket_events_tenant_isolation ON ticket_events");
  await knex.schema.dropTableIfExists("ticket_events");
}
