import { ADMIN_COOKIE, createAdminSession, findAdmin, verifyPassword } from "@/app/admin-session";
import { consumeAdminLoginAllowance } from "@/db/admin-login-limits";

function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/knowledge";
  return value;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    const { id, password, returnTo } = body as Record<string, unknown>;
    if (typeof id !== "string" || typeof password !== "string" || id.length > 60 || password.length > 1024) return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    const allowance = await consumeAdminLoginAllowance(request, id.trim());
    if (!allowance.allowed) {
      console.info("security_event", { event: "admin_login", outcome: "limited", requestId, at: new Date().toISOString() });
      return Response.json({ error: "로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(allowance.retryAfter), "Cache-Control": "no-store" } });
    }
    const account = await findAdmin(id.trim());
    if (!account || !await verifyPassword(password, account)) {
      console.info("security_event", { event: "admin_login", outcome: "denied", requestId, at: new Date().toISOString() });
      return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const token = await createAdminSession(account);
    console.info("security_event", { event: "admin_login", outcome: "success", actorId: account.id, requestId, at: new Date().toISOString() });
    return Response.json({ ok: true, returnTo: safeReturnTo(returnTo) }, { headers: { "Set-Cookie": `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("admin_login_failed", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` } });
}
