import { ADMIN_COOKIE, createAdminSession, findAdmin, verifyPassword } from "@/app/admin-session";

function safeReturnTo(value: unknown) {
  const path = String(value || "/knowledge");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/knowledge";
}

export async function POST(request: Request) {
  const body = await request.json() as { id?: string; password?: string; returnTo?: string };
  const account = await findAdmin(String(body.id || "").trim());
  if (!account || !await verifyPassword(String(body.password || ""), account)) return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  const token = await createAdminSession(account);
  return Response.json({ ok: true, returnTo: safeReturnTo(body.returnTo) }, { headers: { "Set-Cookie": `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200` } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` } });
}
