import { accountBusinessIds, ensureBootstrapAdmin, getAdminSession, hashPassword, requireAdminApi, verifyPassword, type AdminAccount } from "@/app/admin-session";
import { listBusinesses } from "@/db/knowledge";

function publicAccount(account: AdminAccount, allBusinessIds: string[]) { return { id: account.id, username: account.username, businessIds: account.is_super_admin ? allBusinessIds : accountBusinessIds(account), canViewConsultations: Boolean(account.is_super_admin || account.can_view_consultations), canDeleteConsultations: Boolean(account.is_super_admin || account.can_delete_consultations), canManageSettings: Boolean(account.can_manage_settings || account.is_super_admin), isSuperAdmin: Boolean(account.is_super_admin) }; }
const validUsername = (value: string) => /^[a-zA-Z0-9_-]{4,60}$/.test(value);
const validPassword = (value: string) => value.length >= 8 && value.length <= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[^a-zA-Z0-9]/.test(value);
const passwordError = "비밀번호는 영어 대소문자와 특수기호를 포함해 8자 이상 20자 이하로 입력해 주세요.";

export async function GET() { const denied = await requireAdminApi({ settings: true }); if (denied) return denied; const DB = await ensureBootstrapAdmin(); const result = await DB.prepare("SELECT * FROM admin_accounts ORDER BY is_super_admin DESC, created_at").all<AdminAccount>(); const current = await getAdminSession(), businesses = (await listBusinesses()).map(item => ({ id: item.id, name: item.name })); return Response.json({ accounts: result.results.map(account => publicAccount(account, businesses.map(item => item.id))), currentAccountId: current?.id, canManageSuperAdmins: Boolean(current?.is_super_admin), businesses }); }
export async function POST(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  const body = await request.json() as { username?: string; password?: string; businessIds?: string[]; canViewConsultations?: boolean; canDeleteConsultations?: boolean; canManageSettings?: boolean; isSuperAdmin?: boolean };
  const username = String(body.username || "").trim(), password = String(body.password || ""), current = await getAdminSession();
  if (!validUsername(username)) return Response.json({ error: "아이디는 영문, 숫자, 밑줄, 하이픈으로 4자 이상 입력해 주세요." }, { status: 400 });
  if (!validPassword(password)) return Response.json({ error: passwordError }, { status: 400 });
  if (body.isSuperAdmin && !current?.is_super_admin) return Response.json({ error: "최고관리자만 최고관리자를 지정할 수 있습니다." }, { status: 403 });
  const allowed = new Set((await listBusinesses()).map(item => item.id)); const businessIds = [...new Set(body.businessIds || [])].filter(id => allowed.has(id)); const encoded = await hashPassword(password), now = Date.now(), DB = await ensureBootstrapAdmin();
  try { await DB.prepare("INSERT INTO admin_accounts (id, username, password_hash, password_salt, business_ids_json, can_manage_settings, can_view_consultations, can_delete_consultations, is_super_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), username, encoded.hash, encoded.salt, JSON.stringify(businessIds), body.isSuperAdmin || body.canManageSettings ? 1 : 0, body.isSuperAdmin || body.canViewConsultations ? 1 : 0, body.isSuperAdmin || (body.canViewConsultations && body.canDeleteConsultations) ? 1 : 0, body.isSuperAdmin ? 1 : 0, now, now).run(); } catch { return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 }); }
  return GET();
}
export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  const body = await request.json() as { id?: string; username?: string; businessIds?: string[]; canViewConsultations?: boolean; canDeleteConsultations?: boolean; canManageSettings?: boolean; isSuperAdmin?: boolean; currentPassword?: string; newPassword?: string };
  const DB = await ensureBootstrapAdmin(), account = await DB.prepare("SELECT * FROM admin_accounts WHERE id = ?").bind(body.id || "").first<AdminAccount>();
  if (!account) return Response.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
  if (body.username !== undefined || body.newPassword) {
    const username = String(body.username ?? account.username).trim();
    if (!validUsername(username)) return Response.json({ error: "아이디는 영문, 숫자, 밑줄, 하이픈으로 4자 이상 입력해 주세요." }, { status: 400 });
    if (!await verifyPassword(body.currentPassword || "", account)) return Response.json({ error: "기존 비밀번호가 올바르지 않습니다." }, { status: 400 });
    if (body.newPassword && !validPassword(body.newPassword)) return Response.json({ error: passwordError }, { status: 400 });
    try {
      if (body.newPassword) { const encoded = await hashPassword(body.newPassword); await DB.prepare("UPDATE admin_accounts SET username = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").bind(username, encoded.hash, encoded.salt, Date.now(), account.id).run(); }
      else await DB.prepare("UPDATE admin_accounts SET username = ?, updated_at = ? WHERE id = ?").bind(username, Date.now(), account.id).run();
    } catch { return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 }); }
  } else {
    const current = await getAdminSession(), requestedSuperAdmin = Boolean(body.isSuperAdmin);
    if (requestedSuperAdmin !== Boolean(account.is_super_admin)) {
      if (!current?.is_super_admin) return Response.json({ error: "최고관리자만 최고관리자 권한을 변경할 수 있습니다." }, { status: 403 });
      if (!requestedSuperAdmin) { const count = await DB.prepare("SELECT COUNT(*) count FROM admin_accounts WHERE is_super_admin = 1").first<{ count: number }>(); if ((count?.count || 0) <= 1) return Response.json({ error: "최고관리자는 한 명 이상 필요합니다." }, { status: 400 }); }
    }
    const allowed = new Set((await listBusinesses()).map(item => item.id)); const businessIds = [...new Set(body.businessIds || [])].filter(id => allowed.has(id));
    await DB.prepare("UPDATE admin_accounts SET business_ids_json = ?, can_manage_settings = ?, can_view_consultations = ?, can_delete_consultations = ?, is_super_admin = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(businessIds), requestedSuperAdmin || body.canManageSettings ? 1 : 0, requestedSuperAdmin || body.canViewConsultations ? 1 : 0, requestedSuperAdmin || (body.canViewConsultations && body.canDeleteConsultations) ? 1 : 0, requestedSuperAdmin ? 1 : 0, Date.now(), account.id).run();
  }
  return GET();
}
export async function DELETE(request: Request) {
  const denied = await requireAdminApi({ settings: true }); if (denied) return denied;
  try {
    const current = await getAdminSession();
    if (!current) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
    const body = await request.json().catch(() => null) as { currentPassword?: unknown } | null;
    if (typeof body?.currentPassword !== "string" || !body.currentPassword) return Response.json({ error: "현재 로그인한 계정의 비밀번호를 입력해 주세요." }, { status: 400 });
    if (!await verifyPassword(body.currentPassword, current)) return Response.json({ error: "현재 로그인한 계정의 비밀번호가 올바르지 않습니다." }, { status: 400 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (current.id === id) return Response.json({ error: "현재 로그인한 계정은 삭제할 수 없습니다." }, { status: 400 });
    const DB = await ensureBootstrapAdmin();
    const target = await DB.prepare("SELECT * FROM admin_accounts WHERE id = ?").bind(id).first<AdminAccount>();
    if (!target) return Response.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
    if (target.is_super_admin) return Response.json({ error: "최고관리자 계정은 삭제할 수 없습니다." }, { status: 400 });
    const result = await DB.prepare("DELETE FROM admin_accounts WHERE id = ? AND is_super_admin = 0 AND id != ? AND (SELECT COUNT(*) FROM admin_accounts) > 1").bind(id, current.id).run();
    if (!result.meta.changes) return Response.json({ error: "계정 상태가 변경되어 삭제하지 못했습니다. 새로고침해 주세요." }, { status: 409 });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "계정을 삭제하지 못했습니다. 다시 시도해 주세요." }, { status: 500 }); }
}
