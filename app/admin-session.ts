import { headers } from "next/headers";
import { ensureKnowledgeSchema } from "@/db/knowledge";

export const ADMIN_COOKIE = "program_guide_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;
export type AdminAccount = { id: string; username: string; password_hash: string; password_salt: string; business_ids_json: string; can_manage_settings: number; can_view_consultations: number; can_delete_consultations: number; is_super_admin: number };

function toBase64Url(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function randomSalt() { const bytes = crypto.getRandomValues(new Uint8Array(16)); return toBase64Url(bytes); }
async function signature(payload: string) { const secret = process.env.ADMIN_SESSION_SECRET; if (!secret) throw new Error("Admin session secret is unavailable"); const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))); }
export async function hashPassword(password: string, salt = randomSalt()) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256); return { hash: toBase64Url(new Uint8Array(bits)), salt }; }
function equal(left: string, right: string) { if (left.length !== right.length) return false; let different = 0; for (let i = 0; i < left.length; i += 1) different |= left.charCodeAt(i) ^ right.charCodeAt(i); return different === 0; }
export async function verifyPassword(password: string, account: AdminAccount) { return equal((await hashPassword(password, account.password_salt)).hash, account.password_hash); }

export async function ensureBootstrapAdmin() {
  const DB = await ensureKnowledgeSchema();
  const revision = process.env.ADMIN_BOOTSTRAP_REVISION;
  if (revision && process.env.ADMIN_ID && process.env.ADMIN_PASSWORD) {
    const repairId = `admin-bootstrap:${revision}`;
    const applied = await DB.prepare("SELECT id FROM data_repairs WHERE id = ?").bind(repairId).first<{ id: string }>();
    if (!applied) {
      const password = await hashPassword(process.env.ADMIN_PASSWORD);
      const businesses = await DB.prepare("SELECT id FROM businesses ORDER BY sort_order").all<{ id: string }>();
      const now = Date.now();
      await DB.batch([
        DB.prepare("UPDATE admin_accounts SET is_super_admin = 0, updated_at = ? WHERE username <> ?").bind(now, process.env.ADMIN_ID),
        DB.prepare("DELETE FROM admin_accounts WHERE username = ?").bind(process.env.ADMIN_ID),
        DB.prepare("INSERT INTO admin_accounts (id, username, password_hash, password_salt, business_ids_json, can_manage_settings, can_view_consultations, can_delete_consultations, is_super_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?)").bind(crypto.randomUUID(), process.env.ADMIN_ID, password.hash, password.salt, JSON.stringify(businesses.results.map(item => item.id)), now, now),
        DB.prepare("INSERT INTO data_repairs (id, applied_at) VALUES (?, ?)").bind(repairId, now),
      ]);
    }
    return DB;
  }
  const count = await DB.prepare("SELECT COUNT(*) count FROM admin_accounts").first<{ count: number }>();
  if (!count?.count && process.env.ADMIN_ID && process.env.ADMIN_PASSWORD) {
    const password = await hashPassword(process.env.ADMIN_PASSWORD);
    const businesses = await DB.prepare("SELECT id FROM businesses ORDER BY sort_order").all<{ id: string }>();
    const now = Date.now();
    await DB.prepare("INSERT INTO admin_accounts (id, username, password_hash, password_salt, business_ids_json, can_manage_settings, is_super_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)").bind(crypto.randomUUID(), process.env.ADMIN_ID, password.hash, password.salt, JSON.stringify(businesses.results.map(item => item.id)), now, now).run();
  }
  return DB;
}
export async function findAdmin(username: string) { const DB = await ensureBootstrapAdmin(); return DB.prepare("SELECT * FROM admin_accounts WHERE username = ?").bind(username).first<AdminAccount>(); }
export async function createAdminSession(account: AdminAccount) { const payload = `${account.id}.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`; return `${payload}.${await signature(payload)}`; }
export async function getAdminSession() {
  const cookie = (await headers()).get("cookie")?.split(";").map(item => item.trim()).find(item => item.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  if (!cookie || cookie.length > 512) return null; const parts = cookie.split("."); if (parts.length !== 3 || !/^\d+$/.test(parts[1]) || !Number.isSafeInteger(Number(parts[1])) || Number(parts[1]) <= Math.floor(Date.now() / 1000)) return null;
  const payload = `${parts[0]}.${parts[1]}`, expected = await signature(payload); if (!equal(expected, parts[2])) return null;
  const DB = await ensureBootstrapAdmin(); return DB.prepare("SELECT * FROM admin_accounts WHERE id = ?").bind(parts[0]).first<AdminAccount>();
}
export function accountBusinessIds(account: AdminAccount): string[] { try { const value: unknown = JSON.parse(account.business_ids_json); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : []; } catch { return []; } }
export async function requireAdminApi(options?: { businessId?: string; settings?: boolean; consultations?: boolean }) {
  try {
    const account = await getAdminSession();
    if (!account) return Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
    if (account.is_super_admin) return null;
    if (options?.consultations && account.can_view_consultations === 0) return Response.json({ error: "상담내역 조회 권한이 없습니다." }, { status: 403 });
    if (options?.settings && !account.can_manage_settings) return Response.json({ error: "설정 접근 권한이 없습니다." }, { status: 403 });
    if (options?.businessId && !accountBusinessIds(account).includes(options.businessId)) return Response.json({ error: "이 사업에 대한 접근 권한이 없습니다." }, { status: 403 });
    return null;
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("admin-session:requireAdminApi", { requestId, kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", requestId }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
