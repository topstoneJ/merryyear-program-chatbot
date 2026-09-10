// Resolve links from the model used, never from the currently connected API alone.
export function modelPricingInfo(model: string) {
  const id = model.toLowerCase().replace(/^(google|anthropic|openai)\//, "").replace(/^models\//, "");
  if (id.startsWith("gemini-")) return { provider: "Google", pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing" };
  if (id.startsWith("claude-")) return { provider: "Anthropic", pricingUrl: "https://platform.claude.com/docs/en/about-claude/pricing" };
  if (/^(gpt-|chatgpt-|o\d(?:-|$))/.test(id)) return { provider: "OpenAI", pricingUrl: "https://developers.openai.com/api/docs/pricing" };
  return { provider: null, pricingUrl: null };
}
// Standard paid-tier USD / million tokens, verified 2026-09-03.
export function modelRates(model: string, at = Date.now()) {
  if (model !== "gemini-3.8-flash") return null;
  return at < Date.UTC(2027, 0, 1) ? { input: 0.75, output: 3.75, cached: 0.075 } : { input: 1.5, output: 7.5, cached: 0.15 };
}
function tokenCount(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
export function readApiUsage(payload: unknown, model: string, at: number) {
  const data = payload as { usage?: Record<string, unknown>; interaction?: { usage?: Record<string, unknown> } } | null;
  const usage = data?.usage || data?.interaction?.usage;
  const input = tokenCount(usage?.total_input_tokens);
  const output = tokenCount(usage?.total_output_tokens);
  const thought = usage ? tokenCount(usage.total_thought_tokens) ?? 0 : null;
  const cached = usage && input !== null ? Math.min(input, tokenCount(usage.total_cached_tokens) ?? 0) : null;
  const rates = modelRates(model, at);
  const estimatedUsd = rates && input !== null && output !== null ? ((input - (cached || 0)) * rates.input + (cached || 0) * rates.cached + (output + (thought || 0)) * rates.output) / 1_000_000 : null;
  return { input, output, thought, cached, estimatedUsd };
}
export function koreanDayBounds(at = Date.now()) {
  const date = new Date(at + 9 * 60 * 60 * 1000);
  const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
  const start = Date.UTC(year, month, day) - 9 * 60 * 60 * 1000;
  return { key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, label: `${year}년 ${month + 1}월 ${day}일`, start, end: start + 24 * 60 * 60 * 1000 };
}
export function selectedDayBounds(value: string | null, at = Date.now()) {
  if (value === null) return koreanDayBounds(at);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return null;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day || value > koreanDayBounds(at).key) return null;
  const start = Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000;
  return { key: value, label: `${year}년 ${month}월 ${day}일`, start, end: start + 24 * 60 * 60 * 1000 };
}

export function selectedRangeBounds(fromValue: string | null, toValue: string | null, at = Date.now()) {
  const today = koreanDayBounds(at).key;
  if (!fromValue || !toValue) return null;
  const from = selectedDayBounds(fromValue, at), to = selectedDayBounds(toValue, at);
  if (!from || !to || fromValue > toValue || toValue > today) return null;
  const limit = new Date(`${fromValue}T00:00:00Z`);
  limit.setUTCFullYear(limit.getUTCFullYear() + 1);
  if (toValue > limit.toISOString().slice(0, 10)) return null;
  return { key: `${fromValue}~${toValue}`, label: `${fromValue} ~ ${toValue}`, start: from.start, end: to.end };
}
