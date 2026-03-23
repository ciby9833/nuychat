import type { Knex } from "knex";

type ChannelRow = {
  config_id: string;
  channel_id: string;
  encrypted_config: string;
};

export async function up(knex: Knex): Promise<void> {
  const rows = await knex("channel_configs")
    .where({ channel_type: "web" })
    .select("config_id", "channel_id", "encrypted_config") as ChannelRow[];

  for (const row of rows) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(row.encrypted_config);
    } catch {
      config = {};
    }

    const existing = typeof config.publicChannelKey === "string" ? config.publicChannelKey.trim() : "";
    if (existing.length > 0) {
      continue;
    }

    config.publicChannelKey = row.channel_id === "demo-web-channel" ? "demo-web-public" : `wc-${row.channel_id}`;

    await knex("channel_configs")
      .where({ config_id: row.config_id })
      .update({
        encrypted_config: JSON.stringify(config),
        updated_at: knex.fn.now()
      });
  }
}

export async function down(knex: Knex): Promise<void> {
  const rows = await knex("channel_configs")
    .where({ channel_type: "web" })
    .select("config_id", "encrypted_config") as Array<{ config_id: string; encrypted_config: string }>;

  for (const row of rows) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(row.encrypted_config);
    } catch {
      continue;
    }

    if (typeof config.publicChannelKey !== "string") {
      continue;
    }

    delete config.publicChannelKey;

    await knex("channel_configs")
      .where({ config_id: row.config_id })
      .update({
        encrypted_config: JSON.stringify(config),
        updated_at: knex.fn.now()
      });
  }
}
