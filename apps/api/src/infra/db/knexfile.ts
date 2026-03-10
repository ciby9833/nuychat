import type { Knex } from "knex";

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL ?? {
    host: "localhost",
    port: 5432,
    database: "nuychat_dev",
    user: "nuychat",
    password: "nuychat_dev_pw"
  },
  migrations: {
    directory: new URL("../../../migrations", import.meta.url).pathname,
    extension: "ts"
  },
  pool: { min: 2, max: 10 }
};

export default config;

