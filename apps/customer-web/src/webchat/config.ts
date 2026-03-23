function readQueryParam(name: string): string {
  const params = new URLSearchParams(window.location.search);
  return params.get(name)?.trim() ?? "";
}

export function resolvePublicChannelKey(): string {
  const fromQuery = readQueryParam("k");
  if (fromQuery) return fromQuery;
  return (import.meta.env.VITE_WEBCHAT_PUBLIC_KEY as string | undefined)?.trim() ?? "";
}

export function resolveApiBase(): string {
  const fromQuery = readQueryParam("apiBase");
  if (fromQuery) return fromQuery;
  const fromEnv = (import.meta.env.VITE_WEBCHAT_API_BASE as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}
