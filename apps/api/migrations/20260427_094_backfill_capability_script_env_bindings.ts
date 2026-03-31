import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable("capability_script_env_bindings");
  if (!hasTable) return;

  const scripts = await knex("capability_scripts")
    .select("script_id", "env_refs_json");

  for (const script of scripts as Array<{ script_id: string; env_refs_json: unknown }>) {
    const refs = Array.isArray(script.env_refs_json) ? script.env_refs_json.map(String).map((item) => item.trim()).filter(Boolean) : [];
    if (refs.length === 0) continue;
    for (const ref of refs) {
      const existing = await knex("capability_script_env_bindings")
        .where({ script_id: script.script_id, env_key: ref })
        .first();
      if (existing) continue;
      const value = process.env[ref];
      if (typeof value !== "string" || value.length === 0) continue;
      await knex("capability_script_env_bindings").insert({
        script_id: script.script_id,
        env_key: ref,
        env_value: value
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const refs = ["JT_CARGO_API_ACCOUNT", "JT_CARGO_PRIVATE_KEY", "JT_CARGO_TRACE_URL"];
  await knex("capability_script_env_bindings").whereIn("env_key", refs).delete();
}
