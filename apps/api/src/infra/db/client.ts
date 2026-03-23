import knex, { type Knex } from "knex";

import { getDatabaseConnection } from "./config.js";

export const db: Knex = knex({
  client: "pg",
  connection: getDatabaseConnection(),
  pool: { min: 2, max: 10 }
});

let closed = false;

export async function closeDatabase() {
  if (closed) {
    return;
  }

  closed = true;
  await db.destroy();
}

export async function withTenantTransaction<T>(tenantId: string, handler: (trx: Knex.Transaction) => Promise<T>) {
  return db.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.current_tenant_id', ?, true)", [tenantId]);
    return handler(trx);
  });
}
