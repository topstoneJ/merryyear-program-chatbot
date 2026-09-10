import type { ConflictReport } from "@/db/conflict-check";

export async function checkAfterMutation(businessId: string, request = fetch, pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))): Promise<ConflictReport> {
  let lastError = "검사 결과를 확인할 수 없습니다. 데이터를 수정하면 다시 검사합니다.";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request("/api/knowledge/conflicts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }) });
      const payload = await response.json();
      if (response.ok && payload.report) return payload.report;
      lastError = payload.error || lastError;
      if ([400, 401, 403, 404, 422].includes(response.status)) break;
    } catch { lastError = "연결을 확인해 주세요. 데이터를 수정하면 다시 검사합니다."; }
    if (attempt < 2) await pause(1500 * (attempt + 1));
  }
  throw new Error(lastError);
}
