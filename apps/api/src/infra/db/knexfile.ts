import type { Knex } from "knex";

import { getDatabaseConnection } from "./config.js";

const config: Knex.Config = {
  client: "pg",
  connection: getDatabaseConnection(),
  migrations: {
    directory: new URL("../../../migrations", import.meta.url).pathname,
    extension: "ts"
  },
  pool: { min: 2, max: 10 }
};

export default config;
