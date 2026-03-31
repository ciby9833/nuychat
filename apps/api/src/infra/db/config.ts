import { readRequiredEnv } from "../env.js";

export function getDatabaseConnection(): string {
  return readRequiredEnv("DATABASE_URL");
}

export function getDatabaseSummary() {
  const url = new URL(getDatabaseConnection());

  return {
    source: "DATABASE_URL",
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username)
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
