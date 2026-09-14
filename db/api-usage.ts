import { knowledgeEnv } from "./knowledge";
import { readApiUsage } from "./api-pricing";

async function record(model: string, purpose: string, status: number, payload: unknown) {
  try {
    const at = Date.now();
    const usage = readApiUsage(payload, model, at);
    await knowledgeEnv().DB?.prepare("INSERT INTO api_usage (id, created_at, model, purpose, status, input_tokens, output_tokens, thought_tokens, cached_tokens, estimated_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), at, model, purpose, status, usage.input, usage.output, usage.thought, usage.cached, usage.estimatedUsd).run();
  } catch { console.error("API usage recording failed"); }
}

export async function trackedGeminiFetch(purpose: "chat" | "knowledge" | "conflict" | "classification", init: RequestInit) {
  const model = typeof init.body === "string" ? String(JSON.parse(init.body).model || "unknown") : "unknown";
  let response: Response;
  try { response = await fetch("https://generativelanguage.googleapis.com/v1/interactions", init); }
  catch (error) { await record(model, purpose, 0, null); throw error; }
  let payload: unknown = null;
  try { payload = await response.clone().json(); } catch { /* Keep response intact for the caller. */ }
  await record(model, purpose, response.status, payload);
  return response;
}

// Chat consumes JSON only. Read it once, preserve per-attempt usage recording,
// and leave the Response-returning API above unchanged for other callers.
export async function trackedGeminiJson<T>(purpose: "chat", init: RequestInit,
  onTiming?: (stage: "model" | "usage", duration: number) => void,
): Promise<{ response: Response; payload: T }> {
  const model = typeof init.body === "string" ? String(JSON.parse(init.body).model || "unknown") : "unknown";
  const started = performance.now();
  let response: Response | undefined;
  let payload: unknown = null;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1/interactions", init);
    payload = await response.json();
    return { response, payload: payload as T };
  } finally {
    onTiming?.("model", performance.now() - started);
    const recording = performance.now();
    await record(model, purpose, response?.status || 0, payload);
    onTiming?.("usage", performance.now() - recording);
  }
}
