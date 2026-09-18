import { knowledgeEnv } from "./knowledge";
import { readApiUsage } from "./api-pricing";
import { normalizeAiPayload, prepareAiRequest } from "./ai-provider";

async function record(model: string, purpose: string, status: number, payload: unknown) {
  try {
    const at = Date.now();
    const usage = readApiUsage(payload, model, at);
    await knowledgeEnv().DB?.prepare("INSERT INTO api_usage (id, created_at, model, purpose, status, input_tokens, output_tokens, thought_tokens, cached_tokens, estimated_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), at, model, purpose, status, usage.input, usage.output, usage.thought, usage.cached, usage.estimatedUsd).run();
  } catch { console.error("API usage recording failed"); }
}

export async function trackedGeminiFetch(purpose: "chat" | "knowledge" | "conflict" | "classification", init: RequestInit) {
  const headers = new Headers(init.headers);
  const apiKey = headers.get("x-goog-api-key") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const request = prepareAiRequest(apiKey, init);
  const model = request.model;
  let response: Response;
  try { response = await fetch(request.url, request.init); }
  catch (error) { await record(model, purpose, 0, null); throw error; }
  let payload: unknown = null;
  // The caller receives a normalized response, so retaining an unread clone wastes memory.
  try { payload = await response.json(); } catch { /* Normalize malformed provider responses safely. */ }
  await record(model, purpose, response.status, payload);
  return Response.json(normalizeAiPayload(payload, request.provider), { status: response.status });
}

// Chat consumes JSON only. Read it once, preserve per-attempt usage recording,
// and leave the Response-returning API above unchanged for other callers.
export async function trackedGeminiJson<T>(purpose: "chat", init: RequestInit,
  onTiming?: (stage: "model" | "usage", duration: number) => void,
): Promise<{ response: Response; payload: T }> {
  const headers = new Headers(init.headers);
  const apiKey = headers.get("x-goog-api-key") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const request = prepareAiRequest(apiKey, init);
  const model = request.model;
  const started = performance.now();
  let response: Response | undefined;
  let payload: unknown = null;
  try {
    response = await fetch(request.url, request.init);
    payload = await response.json();
    return { response, payload: normalizeAiPayload(payload, request.provider) as T };
  } finally {
    onTiming?.("model", performance.now() - started);
    const recording = performance.now();
    await record(model, purpose, response?.status || 0, payload);
    onTiming?.("usage", performance.now() - recording);
  }
}
