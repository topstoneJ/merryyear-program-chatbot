export type AiProvider = "google" | "openai" | "anthropic";

export function aiProviderFromKey(apiKey?: string | null): AiProvider {
  return apiKey?.startsWith("sk-ant-") ? "anthropic" : apiKey?.startsWith("sk-") ? "openai" : "google";
}

export function configuredAiModel(apiKey?: string | null) {
  if (aiProviderFromKey(apiKey) === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  return aiProviderFromKey(apiKey) === "openai"
    ? process.env.OPENAI_MODEL || "gpt-5.4-mini"
    : process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

type InternalAiRequest = {
  model?: string;
  store?: boolean;
  system_instruction?: string;
  input?: unknown;
  response_format?: { schema?: unknown };
};

// Every response object has a closed shape on both strict-output providers.
// Keep the caller's schema intact (PDF extraction and chat have separate schemas).
function closedSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(closedSchema);
  if (!value || typeof value !== "object") return value;
  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, closedSchema(item)]));
  if (schema.type === "object") {
    schema.additionalProperties = false;
    schema.required = Object.keys((schema.properties || {}) as object);
  }
  return schema;
}

export function prepareAiRequest(apiKey: string, init: RequestInit): { provider: AiProvider; model: string; url: string; init: RequestInit } {
  const provider = aiProviderFromKey(apiKey);
  const source = typeof init.body === "string" ? JSON.parse(init.body) as InternalAiRequest : {};
  const model = configuredAiModel(apiKey);
  if (provider === "google") {
    return {
      provider, model, url: "https://generativelanguage.googleapis.com/v1/interactions",
      init: { ...init, headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey, "Api-Revision": "2026-05-20" }, body: JSON.stringify({ ...source, model }) },
    };
  }
  const schema = source.response_format?.schema ? closedSchema(source.response_format.schema) : undefined;
  if (provider === "anthropic") return {
    provider, model, url: "https://api.anthropic.com/v1/messages",
    init: { ...init,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 16384, system: source.system_instruction,
        messages: [{ role: "user", content: typeof source.input === "string" ? source.input : JSON.stringify(source.input) }],
        ...(schema ? { output_config: { format: { type: "json_schema", schema } } } : {}),
      }),
    },
  };
  return {
    provider, model, url: "https://api.openai.com/v1/responses",
    init: {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, store: false,
        instructions: source.system_instruction,
        input: source.input,
        ...(schema ? { text: { format: { type: "json_schema", name: "structured_response", strict: true, schema } } } : {}),
      }),
    },
  };
}

export function normalizeAiPayload(payload: unknown, provider: AiProvider) {
  if (!payload || typeof payload !== "object") return payload;
  type Content = { type?: string; text?: string };
  const data = payload as { status?: string; stop_reason?: string; content?: Content[]; output?: Array<{ type?: string; content?: Content[] }>; usage?: unknown; error?: unknown };
  // A successful HTTP response can still be refused or incomplete. Never pass
  // a plausible JSON fragment as a completed answer; preserve usage for billing.
  if (data.status && data.status !== "completed" || provider === "anthropic" && data.stop_reason !== "end_turn"
    || data.output?.some(item => item.content?.some(content => content.type === "refusal")))
    return { ...data, steps: [], error: data.error || { message: "AI response was not completed" } };
  if (provider === "google") return payload;
  if (provider === "anthropic") {
    const text = (data.content || []).filter(item => item.type === "text").map(item => item.text || "").join("");
    return { ...data, steps: text ? [{ type: "model_output", content: [{ type: "text", text }] }] : [] };
  }
  const text = (data.output || []).flatMap(item => item.content || [])
    .filter(item => item.type === "output_text").map(item => item.text || "").join("");
  return { ...data, steps: text ? [{ type: "model_output", content: [{ type: "text", text }] }] : [] };
}
