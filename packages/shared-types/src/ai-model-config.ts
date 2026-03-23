export type SharedAIProvider =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "llama"
  | "kimi"
  | "qwen"
  | "private";

export type SharedAIProviderOption = {
  value: SharedAIProvider;
  label: string;
  apiKeyRequiredOnCreate: boolean;
  supportsBaseUrl: boolean;
};

export const SHARED_AI_PROVIDER_OPTIONS: SharedAIProviderOption[] = [
  { value: "openai", label: "OpenAI", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "claude", label: "Claude", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "gemini", label: "Gemini", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "deepseek", label: "DeepSeek", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "llama", label: "Llama / Ollama", apiKeyRequiredOnCreate: false, supportsBaseUrl: true },
  { value: "kimi", label: "Kimi", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "qwen", label: "Qwen", apiKeyRequiredOnCreate: true, supportsBaseUrl: true },
  { value: "private", label: "企业私有模型", apiKeyRequiredOnCreate: true, supportsBaseUrl: true }
];

export function getSharedAIProviderOption(provider: string | null | undefined): SharedAIProviderOption {
  return SHARED_AI_PROVIDER_OPTIONS.find((item) => item.value === provider) ?? SHARED_AI_PROVIDER_OPTIONS[0];
}

export function requiresAIProviderApiKeyOnCreate(provider: string | null | undefined): boolean {
  return getSharedAIProviderOption(provider).apiKeyRequiredOnCreate;
}
