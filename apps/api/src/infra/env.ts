export function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function readOptionalIntEnv(name: string): number | undefined {
  const value = readOptionalEnv(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric env: ${name}`);
  return parsed;
}

export function readRequiredIntEnv(name: string): number {
  const value = readOptionalIntEnv(name);
  if (value === undefined) throw new Error(`Missing required env: ${name}`);
  return value;
}

export function readRequiredBaseUrlEnv(name: string): string {
  return readRequiredEnv(name).replace(/\/$/, "");
}

export function readCorsOriginEnv(): string | string[] {
  const value = readRequiredEnv("CORS_ORIGIN");
  if (value === "*") return value;

  const origins = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error("CORS_ORIGIN must be '*' or a comma-separated origin list");
  }

  return origins.length === 1 ? origins[0] : origins;
}
