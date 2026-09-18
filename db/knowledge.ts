import { buildAnswerKnowledge } from "@/app/answer-knowledge";
import { isAnswerDecision, type Answer, type AnswerDecision } from "@/app/answer-response";
import { categoryRevision } from "./semantic-category";
import { decisionFromAnswer, categoryFromQuestion } from "./consultation-decision";
import { loadCategories, resolveCategory } from "./consultation-categories";
import { snapshotKey, type ConflictReport } from "./conflict-check";
import { ensureAzureSchema } from "./azure-schema";
import { runtimeEnv, type DatabaseBinding } from "./runtime";

export type KnowledgeSourceRow = {
  id: string;
  business_id: string;
  type: "website" | "pdf" | "text" | "random";
  title: string;
  source_url: string | null;
  file_key: string | null;
  file_name: string | null;
  content: string;
  status: "ready" | "stored" | "error";
  enabled: number;
  shared_all_businesses?: number;
  created_at: number;
  updated_at: number;
};

export type BusinessRow = {
  id: string;
  name: string;
  short_name: string;
  code: string;
  sort_order: number;
  is_public: number;
  notice_url: string;
  contact_department: string;
  contact_email: string;
  contact_phone: string;
  contact_hours: string;
  created_at: number;
  updated_at: number;
};

export type ConsultationRow = {
  id: string;
  business_id: string;
  session_id: string;
  turn_index: number;
  question: string;
  answer: string;
  summary: string;
  decision: string;
  category: string;
  category_manual: number;
  category_revision: string;
  source: string;
  confidence: number;
  review: number;
  review_manual: number;
  created_at: number;
};

export function knowledgeEnv() {
  return runtimeEnv();
}

const schemaInitializations = new WeakMap<object, Promise<DatabaseBinding>>();

async function initializeKnowledgeSchema(DB: DatabaseBinding) {
  await ensureAzureSchema(DB);
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS policy_versions (business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, revision INTEGER NOT NULL, knowledge_hash TEXT NOT NULL, rules_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('draft','approved','revoked')), created_by TEXT NOT NULL, approved_by TEXT, created_at INTEGER NOT NULL, approved_at INTEGER, PRIMARY KEY (business_id, revision))`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      code TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 1,
      notice_url TEXT NOT NULL DEFAULT '',
      contact_department TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      contact_hours TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT,
      file_key TEXT,
      file_name TEXT,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ready',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS knowledge_business_idx ON knowledge_sources (business_id, updated_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_source_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS knowledge_revision_source_idx ON knowledge_source_revisions (source_id, created_at)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS data_repairs (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      session_id TEXT NOT NULL DEFAULT '',
      turn_index INTEGER NOT NULL DEFAULT 0,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      summary TEXT NOT NULL,
      decision TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      review INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS consultation_business_date_idx ON consultations (business_id, created_at)"),
    DB.prepare("CREATE INDEX IF NOT EXISTS consultation_session_turn_idx ON consultations (session_id, turn_index)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS daily_question_limits (
      day_key TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (day_key, ip_hash)
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS random_questions (
      id TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      question_key TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      selected_options_json TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      knowledge_source_id TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS random_question_business_status_idx ON random_questions (business_id, status, created_at)"),
    DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS random_question_business_key_unique ON random_questions (business_id, question_key)"),
    DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
      id TEXT PRIMARY KEY NOT NULL,
      organization_name TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      logo_key TEXT,
      main_headline TEXT NOT NULL,
      main_subcopy TEXT NOT NULL,
      chatbot_greeting TEXT NOT NULL,
      primary_color TEXT NOT NULL DEFAULT '#f26a2e',
      gemini_api_key_encrypted TEXT,
      updated_at INTEGER NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS chat_answer_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      business_id TEXT NOT NULL,
      answer_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    DB.prepare("CREATE INDEX IF NOT EXISTS chat_answer_cache_expiry_idx ON chat_answer_cache (expires_at)"),
    DB.prepare(`INSERT OR IGNORE INTO site_settings
      (id, organization_name, contact, main_headline, main_subcopy, chatbot_greeting, primary_color, updated_at)
      VALUES ('default', '기관명 미설정', '', '사업 안내,\n질문으로 쉽게 확인하세요', '관리자 화면에서 기관과 사업 정보를 설정해 주세요.', '등록된 안내 자료를 바탕으로 답변해 드릴게요.', '#f26a2e', 0)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
      email TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      business_ids_json TEXT NOT NULL DEFAULT '[]',
      can_manage_settings INTEGER NOT NULL DEFAULT 0,
      can_view_consultations INTEGER NOT NULL DEFAULT 1,
      can_delete_consultations INTEGER NOT NULL DEFAULT 0,
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
  ]);
  const businessColumns = await DB.prepare("PRAGMA table_info(businesses)").all<{ name: string }>();
  if (!businessColumns.results.some((column) => column.name === "is_public")) {
    await DB.prepare("ALTER TABLE businesses ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1").run();
  }
  for (const [name, definition] of [
    ["notice_url", "TEXT NOT NULL DEFAULT ''"],
    ["contact_department", "TEXT NOT NULL DEFAULT ''"],
    ["contact_email", "TEXT NOT NULL DEFAULT ''"],
    ["contact_phone", "TEXT NOT NULL DEFAULT ''"],
    ["contact_hours", "TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    if (!businessColumns.results.some((column) => column.name === name)) {
      await DB.prepare(`ALTER TABLE businesses ADD COLUMN ${name} ${definition}`).run();
    }
  }
  await DB.prepare(`UPDATE businesses SET notice_url = COALESCE((
    SELECT k.source_url FROM business_homepage_sources h
    JOIN knowledge_sources k ON k.id = h.source_id AND k.business_id = h.business_id
    WHERE h.business_id = businesses.id AND k.type = 'website' AND k.source_url IS NOT NULL
    LIMIT 1
  ), '') WHERE notice_url = ''`).run();
  const consultationColumns = await DB.prepare("PRAGMA table_info(consultations)").all<{ name: string }>();
  for (const [name, definition] of [["session_id", "TEXT NOT NULL DEFAULT ''"], ["turn_index", "INTEGER NOT NULL DEFAULT 0"]] as const) {
    if (!consultationColumns.results.some((column) => column.name === name)) await DB.prepare(`ALTER TABLE consultations ADD COLUMN ${name} ${definition}`).run();
  }
  const settingsColumns = await DB.prepare("PRAGMA table_info(site_settings)").all<{ name: string }>();
  if (!settingsColumns.results.some((column) => column.name === "gemini_api_key_encrypted")) {
    await DB.prepare("ALTER TABLE site_settings ADD COLUMN gemini_api_key_encrypted TEXT").run();
  }
  const accountColumns = await DB.prepare("PRAGMA table_info(admin_accounts)").all<{ name: string }>();
  if (!accountColumns.results.some((column) => column.name === "is_super_admin")) {
    await DB.prepare("ALTER TABLE admin_accounts ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0").run();
    await DB.prepare("UPDATE admin_accounts SET can_manage_settings = 1").run();
    await DB.prepare("UPDATE admin_accounts SET is_super_admin = 1 WHERE id = (SELECT id FROM admin_accounts ORDER BY created_at, id LIMIT 1)").run();
  }
  return DB;
}

export async function ensureKnowledgeSchema() {
  const { DB } = knowledgeEnv();
  if (!DB) throw new Error("Knowledge database is unavailable");
  const key = DB as unknown as object;
  let pending = schemaInitializations.get(key);
  if (!pending) {
    pending = initializeKnowledgeSchema(DB).catch(error => {
      schemaInitializations.delete(key);
      throw error;
    });
    schemaInitializations.set(key, pending);
  }
  return pending;
}

export async function listAdminEmails() {
  const DB = await ensureKnowledgeSchema();
  const result = await DB.prepare("SELECT email FROM admin_users ORDER BY created_at ASC, email ASC").all<{ email: string }>();
  return result.results.map((row) => row.email);
}

export async function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const DB = await ensureKnowledgeSchema();
  const row = await DB.prepare("SELECT email FROM admin_users WHERE lower(email) = lower(?)").bind(email.trim()).first<{ email: string }>();
  return Boolean(row);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function apiKeyEncryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!secret) throw new Error("API key encryption is unavailable");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptConfiguredGeminiApiKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await apiKeyEncryptionKey(), new TextEncoder().encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

// Persist an explicit opt-out so an environment fallback cannot silently
// reactivate a key after an administrator deletes it or restarts the server.
export const GEMINI_API_KEY_DISABLED = "!disabled";
export function configuredGeminiApiKeyStatus(stored: string | null | undefined, fallback = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) {
  const disabled = stored === GEMINI_API_KEY_DISABLED;
  return {
    apiKeyConfigured: !disabled && Boolean(stored || fallback),
    storedApiKeyConfigured: !disabled && Boolean(stored),
    environmentApiKeyConfigured: Boolean(fallback),
  };
}

export async function getConfiguredGeminiApiKey(settingsRow?: { gemini_api_key_encrypted: string | null } | null) {
  const fallback = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;
  const row = settingsRow === undefined
    ? await (await ensureKnowledgeSchema()).prepare("SELECT gemini_api_key_encrypted FROM site_settings WHERE id = 'default'").first<{ gemini_api_key_encrypted: string | null }>()
    : settingsRow;
  if (row?.gemini_api_key_encrypted === GEMINI_API_KEY_DISABLED) return undefined;
  if (!row?.gemini_api_key_encrypted) return fallback;
  try {
    const [iv, encrypted] = row.gemini_api_key_encrypted.split(".");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await apiKeyEncryptionKey(), base64ToBytes(encrypted));
    return new TextDecoder().decode(decrypted);
  } catch {
    return fallback;
  }
}

export async function listBusinesses(includeHidden = true) {
  const DB = await ensureKnowledgeSchema();
  const result = await DB.prepare(
    `SELECT * FROM businesses ${includeHidden ? "" : "WHERE is_public = 1"} ORDER BY sort_order ASC, created_at ASC, id ASC`,
  ).all<BusinessRow>();
  return result.results;
}

export async function getBusiness(businessId: string) {
  const DB = await ensureKnowledgeSchema();
  return DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(businessId).first<BusinessRow>();
}

const CHAT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function chatAnswerCacheKey(modelRequest: unknown) {
  // Bump this contract version whenever validation semantics change so answers
  // accepted by older server rules cannot bypass newer validation.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["chat-answer-v1", modelRequest])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function parsedCachedAnswer(value: string): Answer | null {
  try {
    const answer = JSON.parse(value) as Partial<Answer>;
    if (answer.decision !== "fact" || answer.review !== false || typeof answer.text !== "string" || !answer.text
      || typeof answer.source !== "string" || !answer.source || !Number.isInteger(answer.page)
      || typeof answer.confidence !== "number" || typeof answer.categoryId !== "string") return null;
    return answer as Answer;
  } catch { return null; }
}

export async function readChatAnswerCache(DB: DatabaseBinding, cacheKey: string, now = Date.now()) {
  const row = await DB.prepare("SELECT answer_json FROM chat_answer_cache WHERE cache_key = ? AND expires_at > ?")
    .bind(cacheKey, now).first<{ answer_json: string }>();
  return row ? parsedCachedAnswer(row.answer_json) : null;
}

export async function writeChatAnswerCache(DB: DatabaseBinding, cacheKey: string, businessId: string, answer: Answer, now = Date.now()) {
  await DB.prepare("DELETE FROM chat_answer_cache WHERE cache_key = ? OR expires_at <= ?").bind(cacheKey, now).run();
  await DB.prepare(`INSERT INTO chat_answer_cache (cache_key, business_id, answer_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET answer_json = excluded.answer_json, created_at = excluded.created_at, expires_at = excluded.expires_at`)
    .bind(cacheKey, businessId, JSON.stringify(answer), now, now + CHAT_CACHE_TTL_MS).run();
}

export async function recordConsultation(input: {
  decision?: AnswerDecision;
  businessId: string;
  question: string;
  answer: string;
  source: string;
  confidence: number;
  review?: boolean;
  categoryId?: string;
  sessionId?: string;
  turnIndex?: number;
}) {
  const DB = await ensureKnowledgeSchema();
  await deleteExpiredConsultations(DB);
  const firstParagraph = input.answer.split(/\n\s*\n/)[0]?.trim() || input.answer.trim();
  const categories = await loadCategories(DB);
  const semantic = categories.find(c => c.id === input.categoryId && !c.replacement_id);
  await DB.prepare(`INSERT INTO consultations
    (id, business_id, session_id, turn_index, question, answer, summary, decision, category, source, confidence, review, created_at, category_revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      input.businessId,
      input.sessionId?.slice(0, 80) || "",
      Number.isInteger(input.turnIndex) ? Math.max(0, input.turnIndex || 0) : 0,
      input.question.slice(0, 2_000),
      input.answer.slice(0, 20_000),
      firstParagraph.slice(0, 500),
      isAnswerDecision(input.decision) ? input.decision : decisionFromAnswer(input.answer),
      semantic?.id || resolveCategory(categoryFromQuestion(input.question), categories).id,
      input.source.slice(0, 500),
      input.confidence,
      input.review ? 1 : 0,
      Date.now(),
      semantic ? categoryRevision(categories) : "",
    ).run();
}

export const CONSULTATION_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;

export async function deleteExpiredConsultations(DB: DatabaseBinding, now = Date.now()) {
  return DB.prepare("DELETE FROM consultations WHERE created_at < ?").bind(now - CONSULTATION_RETENTION_MS).run();
}

function kstDayKey(now: number) {
  return new Date(now + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

async function hashClientIp(ip: string) {
  const salt = process.env.IP_RATE_LIMIT_SALT || process.env.ADMIN_SESSION_SECRET || "program-guide-chatbot-rate-limit";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function consumeDailyQuestionAllowance(DB: DatabaseBinding, ip: string, now = Date.now(), limit = 100) {
  const dayKey = kstDayKey(now);
  const ipHash = await hashClientIp(ip);
  await DB.prepare("DELETE FROM daily_question_limits WHERE day_key < ?").bind(dayKey).run();
  const row = await DB.prepare(`INSERT INTO daily_question_limits (day_key, ip_hash, question_count, updated_at)
    VALUES (?, ?, 1, ?) ON CONFLICT(day_key, ip_hash) DO UPDATE SET question_count = daily_question_limits.question_count + 1, updated_at = excluded.updated_at
    RETURNING question_count`).bind(dayKey, ipHash, now).first<{ question_count: number }>();
  return { allowed: Number(row?.question_count || 0) <= limit, count: Number(row?.question_count || 0), limit };
}

export async function loadKnowledgeContext(businessId: string) {
  const DB = await ensureKnowledgeSchema();
  const result = await DB.prepare("SELECT * FROM knowledge_sources WHERE business_id = ? OR shared_all_businesses = 1 ORDER BY id")
    .bind(businessId).all<KnowledgeSourceRow>();
  const cached = await DB.prepare("SELECT report FROM knowledge_conflict_checks WHERE business_id = ? AND snapshot_key = ?")
    .bind(businessId, await snapshotKey(result.results)).first<{ report: string }>();
  let report: ConflictReport | null = null;
  try { report = cached ? JSON.parse(cached.report) as ConflictReport : null; }
  catch { /* Re-evaluate retained sources when the advisory cache is unreadable. */ }
  const business = await DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(businessId).first<BusinessRow>();
  const details = business && [
    business.notice_url && `사업안내 공고 링크: ${business.notice_url}`,
    business.contact_department && `담당 부서: ${business.contact_department}`,
    business.contact_email && `이메일: ${business.contact_email}`,
    business.contact_phone && `연락처: ${business.contact_phone}`,
    business.contact_hours && `전화 상담 가능 시간: ${business.contact_hours}`,
  ].filter(Boolean).join("\n");
  const rows = details ? [{
    id: `business-details-${businessId}`, business_id: businessId, type: "text" as const, title: "사업 필수 정보",
    source_url: business?.notice_url || null, file_key: null, file_name: null, content: details,
    status: "ready" as const, enabled: 1, created_at: business?.created_at || 0, updated_at: business?.updated_at || 0,
  }, ...result.results] : result.results;
  return buildAnswerKnowledge(rows, businessId, report);
}
