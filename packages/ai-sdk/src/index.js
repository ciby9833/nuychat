// ─── Message / tool types ─────────────────────────────────────────────────────
// ─── Factory ──────────────────────────────────────────────────────────────────
export function createProvider(provider, config) {
    switch (provider) {
        case "openai":
            return new OpenAIProvider(config);
        case "anthropic":
            return new AnthropicProvider(config);
        case "ollama":
            return new OllamaProvider(config);
        case "gemini":
            return new GeminiProvider(config);
        default: {
            const neverProvider = provider;
            throw new Error(`Unsupported provider: ${String(neverProvider)}`);
        }
    }
}
// ─── OpenAI ───────────────────────────────────────────────────────────────────
class OpenAIProvider {
    name = "openai";
    apiKey;
    baseUrl;
    defaultModel;
    constructor(config) {
        if (!config.apiKey) {
            throw new Error("OpenAI provider requires apiKey");
        }
        this.apiKey = config.apiKey;
        this.baseUrl = stripTrailingSlash(config.baseUrl ?? "https://api.openai.com");
        this.defaultModel = config.defaultModel ?? "gpt-4o-mini";
    }
    async complete(request) {
        const body = {
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
        const data = (await response.json());
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
class AnthropicProvider {
    name = "anthropic";
    apiKey;
    baseUrl;
    defaultModel;
    constructor(config) {
        if (!config.apiKey) {
            throw new Error("Anthropic provider requires apiKey");
        }
        this.apiKey = config.apiKey;
        this.baseUrl = stripTrailingSlash(config.baseUrl ?? "https://api.anthropic.com");
        this.defaultModel = config.defaultModel ?? "claude-3-5-haiku-latest";
    }
    async complete(request) {
        const system = request.messages
            .filter((m) => m.role === "system")
            .map((m) => (typeof m.content === "string" ? m.content : ""))
            .join("\n\n")
            .trim();
        const messages = request.messages
            .filter((m) => m.role !== "system")
            .map(toAnthropicMessage)
            .filter(Boolean);
        const body = {
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
            }
            else {
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
        const data = (await response.json());
        const textParts = (data.content ?? [])
            .filter((block) => block.type === "text")
            .map((block) => block.text ?? "");
        const toolCalls = (data.content ?? [])
            .filter((block) => block.type === "tool_use")
            .map((block) => ({
            id: block.id ?? randomId(),
            type: "function",
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
class OllamaProvider {
    name = "ollama";
    baseUrl;
    defaultModel;
    constructor(config) {
        this.baseUrl = stripTrailingSlash(config.baseUrl ?? "http://127.0.0.1:11434");
        this.defaultModel = config.defaultModel ?? "llama3.1:8b";
    }
    async complete(request) {
        const body = {
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
        const data = (await response.json());
        const toolCalls = (data.message?.tool_calls ?? []).map((call, idx) => ({
            id: `ollama_tool_${idx + 1}`,
            type: "function",
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
class GeminiProvider {
    name = "gemini";
    apiKey;
    baseUrl;
    defaultModel;
    constructor(config) {
        if (!config.apiKey) {
            throw new Error("Gemini provider requires apiKey");
        }
        this.apiKey = config.apiKey;
        this.baseUrl = stripTrailingSlash(config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta");
        this.defaultModel = config.defaultModel ?? "gemini-2.0-flash";
    }
    async complete(request) {
        const model = request.model ?? this.defaultModel;
        const system = request.messages
            .filter((m) => m.role === "system")
            .map((m) => (typeof m.content === "string" ? m.content : ""))
            .join("\n\n")
            .trim();
        const contents = request.messages
            .filter((m) => m.role !== "system")
            .map((m) => toGeminiContent(m))
            .filter((m) => m !== null);
        const body = {
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
        const response = await fetch(`${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Gemini ${response.status}: ${text.slice(0, 220)}`);
        }
        const data = (await response.json());
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
function stripTrailingSlash(url) {
    return url.endsWith("/") ? url.slice(0, -1) : url;
}
function randomId() {
    return Math.random().toString(36).slice(2, 10);
}
function toOpenAIMessage(message) {
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
        content: message.content
    };
}
function toAnthropicMessage(message) {
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
        const blocks = [];
        if (message.content) {
            blocks.push({ type: "text", text: message.content });
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
        content: message.content
    };
}
function toGeminiContent(message) {
    if (message.role === "assistant" && "toolCalls" in message) {
        const toolText = message.toolCalls
            .map((call) => `Tool Call: ${call.function.name}\nArgs: ${call.function.arguments}`)
            .join("\n\n");
        const text = [message.content ?? "", toolText].filter(Boolean).join("\n\n").trim();
        return text ? { role: "model", parts: [{ text }] } : null;
    }
    if (message.role === "tool") {
        return { role: "user", parts: [{ text: `Tool Result (${message.toolCallId}): ${message.content}` }] };
    }
    if (message.role === "assistant") {
        return { role: "model", parts: [{ text: message.content }] };
    }
    return { role: "user", parts: [{ text: message.content }] };
}
function safeParseJson(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
