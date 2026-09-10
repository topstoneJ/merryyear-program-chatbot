import { getAdminSession } from "@/app/admin-session";
export async function GET() {
  const account = await getAdminSession();
  if (!account) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ canManageSettings: Boolean(account.is_super_admin || account.can_manage_settings) }, { headers: { "Cache-Control": "no-store" } });
}
