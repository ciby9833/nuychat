import { assertExpectedDevelopmentDatabase, getDatabaseSummary } from "../infra/db/config.js";

try {
  const summary = assertExpectedDevelopmentDatabase();
  console.log(JSON.stringify({ ok: true, db: summary }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        db: getDatabaseSummary(),
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
}

