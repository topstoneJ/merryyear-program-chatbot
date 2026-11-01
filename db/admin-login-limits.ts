import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { ensureKnowledgeSchema } from "./knowledge";

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 10;
const ADDRESS_LIMIT = 30;

function clientAddress(request: Request) {
  const value = (request.headers.get("x-forwarded-for")?.split(",")[0]
    || request.headers.get("x-real-ip") || "").trim();
  if (isIP(value)) return value;
  const withoutPort = value.match(/^\[([^\]]+)\]:\d+$/)?.[1] || value.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/)?.[1];
  return withoutPort && isIP(withoutPort) ? withoutPort : "unknown";
}

// PostgreSQL/SQLite keep limits shared across workers and application restarts.
// Count attempts before password work to bound concurrent password hashing too.
export async function consumeAdminLoginAllowance(request: Request, username: string, now = Date.now()) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Admin session secret is unavailable");
  const DB = await ensureKnowledgeSchema();
  await DB.prepare(`CREATE TABLE IF NOT EXISTS admin_login_limits (
    window_key TEXT NOT NULL, subject_hash TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL,
    PRIMARY KEY (window_key, subject_hash))`).run();
  await DB.prepare("DELETE FROM admin_login_limits WHERE expires_at <= ?").bind(now).run();
  const window = String(Math.floor(now / WINDOW_MS));
  const expiresAt = (Number(window) + 1) * WINDOW_MS;
  const retryAfter = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const subjects = [[`address:${clientAddress(request)}`, ADDRESS_LIMIT], [`account:${username}`, ACCOUNT_LIMIT]] as const;
  for (const [subject, limit] of subjects) {
    const subjectHash = createHmac("sha256", secret).update(subject).digest("hex");
    const result = await DB.prepare(`INSERT INTO admin_login_limits (window_key, subject_hash, attempt_count, expires_at)
      VALUES (?, ?, 1, ?) ON CONFLICT(window_key, subject_hash)
      DO UPDATE SET attempt_count = admin_login_limits.attempt_count + 1
      WHERE admin_login_limits.attempt_count < ? RETURNING attempt_count`)
      .bind(window, subjectHash, expiresAt, limit).first<{ attempt_count: number }>();
    if (!result) return { allowed: false, retryAfter };
  }
  return { allowed: true, retryAfter: 0 };
}
