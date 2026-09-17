export type AiProvider = "google" | "openai";

export function aiProviderFromKey(apiKey?: string | null): AiProvider {
  return apiKey?.startsWith("sk-") ? "openai" : "google";
}

export function configuredAiModel(apiKey?: string | null) {
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
  const schema = source.response_format?.schema;
  return {
    provider, model, url: "https://api.openai.com/v1/responses",
    init: {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, store: false,
        instructions: source.system_instruction,
        input: source.input,
        ...(schema ? { text: { format: { type: "json_schema", name: "structured_response", strict: false, schema } } } : {}),
      }),
    },
  };
}

export function normalizeAiPayload(payload: unknown, provider: AiProvider) {
  if (provider === "google" || !payload || typeof payload !== "object") return payload;
  const data = payload as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; usage?: unknown; error?: unknown };
  const text = (data.output || []).flatMap(item => item.content || [])
    .filter(item => item.type === "output_text").map(item => item.text || "").join("");
  return { ...data, steps: text ? [{ type: "model_output", content: [{ type: "text", text }] }] : [] };
}
