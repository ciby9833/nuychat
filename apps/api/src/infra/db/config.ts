type DatabaseConnection =
  | string
  | {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };

export function getDatabaseConnection(): DatabaseConnection {
  return (
    process.env.DATABASE_URL ?? {
      host: "localhost",
      port: 5433,
      database: "nuychat_dev",
      user: "nuychat",
      password: "nuychat_dev_pw"
    }
  );
}

export function getDatabaseSummary() {
  const connection = getDatabaseConnection();

  if (typeof connection === "string") {
    const url = new URL(connection);
    return {
      source: "DATABASE_URL",
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ""),
      user: decodeURIComponent(url.username)
    };
  }

  return {
    source: "fallback",
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user
  };
}

export function assertExpectedDevelopmentDatabase() {
  const summary = getDatabaseSummary();
  const unexpected =
    summary.host !== "localhost" ||
    summary.port !== 5433 ||
    summary.database !== "nuychat_dev" ||
    summary.user !== "nuychat";

  if (process.env.NODE_ENV !== "production" && unexpected) {
    throw new Error(
      `Unexpected database target: ${summary.user}@${summary.host}:${summary.port}/${summary.database}`
    );
  }

  return summary;
}

