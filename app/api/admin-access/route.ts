import { getAdminSession } from "@/app/admin-session";
export async function GET() {
  try {
    const account = await getAdminSession();
    if (!account) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return Response.json({ canManageSettings: Boolean(account.is_super_admin || account.can_manage_settings) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("api/admin-access:GET", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
