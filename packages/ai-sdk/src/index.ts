// ─── Message / tool types ─────────────────────────────────────────────────────

export type AIContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      imageUrl: string;
      mimeType?: string;
    };

export type AIMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | AIContentPart[];
    }
  | {
      role: "assistant";
      content: string | null;
      toolCalls: AIToolCall[];
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
    };

export interface AIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Request / response ───────────────────────────────────────────────────────

export interface AICompletionRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  tools?: AIToolDefinition[];
  toolChoice?: "auto" | "none";
  /** Tenant ID for quota tracking */
  tenantId?: string;
}

export interface AICompletionResponse {
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: string;
  toolCalls?: AIToolCall[];
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface AIProvider {
  readonly name: ProviderName;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

// ─── Provider config ──────────────────────────────────────────────────────────

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface OllamaProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
}

export interface GeminiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export type ProviderName = "openai" | "anthropic" | "ollama" | "gemini";

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createProvider(
  provider: ProviderName,
  config: OpenAIProviderConfig | AnthropicProviderConfig | OllamaProviderConfig | GeminiProviderConfig
): AIProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider(config as OpenAIProviderConfig);
    case "anthropic":
      return new AnthropicProvider(config as AnthropicProviderConfig);
    case "ollama":
      return new OllamaProvider(config as OllamaProviderConfig);
    case "gemini":
      return new GeminiProvider(config as GeminiProviderConfig);
    default: {
      const neverProvider: never = provider;
      throw new Error(`Unsupported provider: ${String(neverProvider)}`);
    }
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI provider requires apiKey");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = normalizeVersionedBaseUrl(config.baseUrl ?? "https://api.openai.com", "/v1");
    this.defaultModel = config.defaultModel ?? "gpt-4o-mini";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages: request.messages.map(toOpenAIMessage),
      max_tokens: request.maxTokens ?? 500,
      temperature: request.temperature ?? 0.4
    };
    if (request.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? "auto";
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI ${response.status}: ${text.slice(0, 220)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string | null;
        message?: {
          content?: string | null;
          tool_calls?: AIToolCall[];
        };
      }>;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const choice = data.choices?.[0];
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    return {
      content: choice?.message?.content ?? "",
      tokensUsed: data.usage?.total_tokens ?? (inputTokens + outputTokens),
      inputTokens,
      outputTokens,
      model: data.model ?? String(body.model),
      finishReason: choice?.finish_reason ?? "stop",
      toolCalls: choice?.message?.tool_calls
    };
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: AnthropicProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic provider requires apiKey");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = normalizeVersionedBaseUrl(config.baseUrl ?? "https://api.anthropic.com", "/v1");
    this.defaultModel = config.defaultModel ?? "claude-3-5-haiku-latest";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n\n")
      .trim();

    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map(toAnthropicMessage)
      .filter(Boolean);

    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      system: system || undefined,
      messages,
      max_tokens: request.maxTokens ?? 500,
      temperature: request.temperature ?? 0.4
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }));
      if (request.toolChoice === "none") {
        body.tool_choice = { type: "none" };
      } else {
        body.tool_choice = { type: "auto" };
      }
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic ${response.status}: ${text.slice(0, 220)}`);
    }

    const data = (await response.json()) as {
      stop_reason?: string | null;
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
    };

    const textParts = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "");
    const toolCalls = (data.content ?? [])
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id ?? randomId(),
        type: "function" as const,
        function: {
          name: block.name ?? "unknown_tool",
          arguments: JSON.stringify(block.input ?? {})
        }
      }));

    return {
      content: textParts.join("\n").trim(),
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? String(body.model),
      finishReason: data.stop_reason ?? "stop",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = stripTrailingSlash(config.baseUrl ?? "http://127.0.0.1:11434");
    this.defaultModel = config.defaultModel ?? "llama3.1:8b";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages: request.messages.map(toOpenAIMessage),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.4,
        num_predict: request.maxTokens ?? 500
      }
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama ${response.status}: ${text.slice(0, 220)}`);
    }

    const data = (await response.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string | Record<string, unknown> };
        }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
      model?: string;
    };

    const toolCalls = (data.message?.tool_calls ?? []).map((call, idx) => ({
      id: `ollama_tool_${idx + 1}`,
      type: "function" as const,
      function: {
        name: call.function?.name ?? "unknown_tool",
        arguments: typeof call.function?.arguments === "string"
          ? call.function.arguments
          : JSON.stringify(call.function?.arguments ?? {})
      }
    }));

    return {
      content: data.message?.content ?? "",
      tokensUsed: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      model: data.model ?? String(body.model),
      finishReason: data.done_reason ?? "stop",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Gemini provider requires apiKey");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = stripTrailingSlash(config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta");
    this.defaultModel = config.defaultModel ?? "gemini-2.0-flash";
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = request.model ?? this.defaultModel;
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n\n")
      .trim();

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => toGeminiContent(m))
      .filter((m): m is { role: "user" | "model"; parts: Array<{ text: string }> } => m !== null);

    const body: Record<string, unknown> = {
      system_instruction: system
        ? {
            parts: [{ text: system }]
          }
        : undefined,
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.4,
        maxOutputTokens: request.maxTokens ?? 500,
        responseMimeType: request.responseFormat === "json_object" ? "application/json" : "text/plain"
      }
    };

    const response = await fetch(
      `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini ${response.status}: ${text.slice(0, 220)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number };
      modelVersion?: string;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content = parts.map((p) => p.text ?? "").join("\n").trim();
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      content,
      tokensUsed: data.usageMetadata?.totalTokenCount ?? (inputTokens + outputTokens),
      inputTokens,
      outputTokens,
      model: data.modelVersion ?? model,
      finishReason: data.candidates?.[0]?.finishReason ?? "stop"
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function normalizeVersionedBaseUrl(url: string, versionSuffix: string): string {
  const normalized = stripTrailingSlash(url);
  return normalized.endsWith(versionSuffix)
    ? normalized.slice(0, normalized.length - versionSuffix.length)
    : normalized;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toOpenAIMessage(message: AIMessage): Record<string, unknown> {
  if (message.role === "assistant" && "toolCalls" in message) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId
    };
  }
  return {
    role: message.role,
    content: toOpenAIContent(message.content)
  };
}

function toAnthropicMessage(message: AIMessage): Record<string, unknown> | null {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content
        }
      ]
    };
  }
  if (message.role === "assistant" && "toolCalls" in message) {
    const blocks: Array<Record<string, unknown>> = [];
    if (message.content) {
      blocks.push(...toAnthropicBlocks(message.content));
    }
    for (const call of message.toolCalls) {
      blocks.push({
        type: "tool_use",
        id: call.id,
        name: call.function.name,
        input: safeParseJson(call.function.arguments)
      });
    }
    return { role: "assistant", content: blocks };
  }
  return {
    role: message.role,
    content: toAnthropicBlocks(message.content)
  };
}

function toGeminiContent(message: AIMessage): { role: "user" | "model"; parts: Array<Record<string, unknown>> } | null {
  if (message.role === "assistant" && "toolCalls" in message) {
    const toolText = message.toolCalls
      .map((call) => `Tool Call: ${call.function.name}\nArgs: ${call.function.arguments}`)
      .join("\n\n");
    const parts = normalizeContentParts(message.content);
    if (toolText) {
      parts.push({ type: "text", text: toolText });
    }
    return parts.length > 0 ? { role: "model", parts: toGeminiParts(parts) } : null;
  }
  if (message.role === "tool") {
    return { role: "user", parts: [{ text: `Tool Result (${message.toolCallId}): ${message.content}` }] };
  }
  if (message.role === "assistant") {
    return { role: "model", parts: toGeminiParts(normalizeContentParts(message.content)) };
  }
  return { role: "user", parts: toGeminiParts(normalizeContentParts(message.content)) };
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeContentParts(content: string | AIContentPart[] | null): AIContentPart[] {
  if (Array.isArray(content)) return [...content];
  if (typeof content === "string" && content.trim()) {
    return [{ type: "text", text: content }];
  }
  return [];
}

function toOpenAIContent(content: string | AIContentPart[] | null): string | Array<Record<string, unknown>> | null {
  const parts = normalizeContentParts(content);
  if (parts.length === 0) return typeof content === "string" ? content : null;
  if (parts.length === 1 && parts[0]?.type === "text") return parts[0].text;
  return parts.map((part) => (
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image_url",
          image_url: {
            url: part.imageUrl
          }
        }
  ));
}

function toAnthropicBlocks(content: string | AIContentPart[] | null): Array<Record<string, unknown>> {
  return normalizeContentParts(content).map((part) => (
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image",
          source: {
            type: "url",
            url: part.imageUrl,
            media_type: part.mimeType ?? "image/jpeg"
          }
        }
  ));
}

function toGeminiParts(content: AIContentPart[]): Array<Record<string, unknown>> {
  return content.map((part) => (
    part.type === "text"
      ? { text: part.text }
      : {
          file_data: {
            mime_type: part.mimeType ?? "image/jpeg",
            file_uri: part.imageUrl
          }
        }
  ));
}
