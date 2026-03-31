function readQueryParam(name: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(name)?.trim() ?? "";
}

export function resolvePublicChannelKey(): string {
  const fromQuery = readQueryParam("k");
  if (fromQuery) return fromQuery;
  return readRequiredEnv("VITE_WEBCHAT_PUBLIC_KEY");
}

export function resolveApiBase(): string {
  return readRequiredEnv("VITE_WEBCHAT_API_BASE");
}

function readRequiredEnv(name: "VITE_WEBCHAT_PUBLIC_KEY" | "VITE_WEBCHAT_API_BASE"): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return name === "VITE_WEBCHAT_API_BASE" ? value.replace(/\/$/, "") : value;
}
