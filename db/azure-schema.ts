import type { DatabaseBinding } from "./runtime";

let initialization: Promise<void> | undefined;

export function ensureAzureSchema(DB: DatabaseBinding) {
  initialization ??= initialize(DB);
  return initialization;
}

async function initialize(DB: DatabaseBinding) {
  await DB.batch([
    DB.prepare(`CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL, code TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_public INTEGER NOT NULL DEFAULT 1, notice_url TEXT NOT NULL DEFAULT '', contact_department TEXT NOT NULL DEFAULT '', contact_email TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '', contact_hours TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 1`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS notice_url TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_department TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_hours TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_sources (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT, file_key TEXT, file_name TEXT, content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ready', enabled INTEGER NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`),
    DB.prepare(`ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS shared_all_businesses INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_source_revisions (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, reason TEXT NOT NULL, created_at BIGINT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS data_repairs (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS consultations (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, summary TEXT NOT NULL, decision TEXT NOT NULL, category TEXT NOT NULL, category_manual INTEGER NOT NULL DEFAULT 0, category_revision TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 0, review INTEGER NOT NULL DEFAULT 0, review_manual INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`),
    DB.prepare(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS category_manual INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS category_revision TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS review_manual INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS random_questions (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, question_key TEXT NOT NULL, question TEXT NOT NULL, options_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', selected_options_json TEXT NOT NULL DEFAULT '[]', note TEXT NOT NULL DEFAULT '', knowledge_source_id TEXT, created_at BIGINT NOT NULL, completed_at BIGINT)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS site_settings (id TEXT PRIMARY KEY, organization_name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', logo_key TEXT, favicon_key TEXT, social_image_key TEXT, social_caption TEXT NOT NULL DEFAULT '', main_headline TEXT NOT NULL, main_subcopy TEXT NOT NULL, chat_placeholder TEXT NOT NULL DEFAULT '선택한 사업에 대해 질문해 주세요', chatbot_greeting TEXT NOT NULL, privacy_policy TEXT NOT NULL DEFAULT '', primary_color TEXT NOT NULL DEFAULT '#f26a2e', gemini_api_key_encrypted TEXT, answer_settings_json TEXT NOT NULL DEFAULT '{}', updated_at BIGINT NOT NULL)`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#808080'`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS favicon_key TEXT`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS social_image_key TEXT`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS social_caption TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS chat_placeholder TEXT NOT NULL DEFAULT '선택한 사업에 대해 질문해 주세요'`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS privacy_policy TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gemini_api_key_encrypted TEXT`),
    DB.prepare(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS answer_settings_json TEXT NOT NULL DEFAULT '{}'`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_users (email TEXT PRIMARY KEY, created_at BIGINT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS admin_accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, business_ids_json TEXT NOT NULL DEFAULT '[]', can_manage_settings INTEGER NOT NULL DEFAULT 0, can_view_consultations INTEGER NOT NULL DEFAULT 1, can_delete_consultations INTEGER NOT NULL DEFAULT 0, is_super_admin INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`),
    DB.prepare(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS can_manage_settings INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS can_view_consultations INTEGER NOT NULL DEFAULT 1`),
    DB.prepare(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS can_delete_consultations INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS is_super_admin INTEGER NOT NULL DEFAULT 0`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS consultation_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, replacement_id TEXT)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS knowledge_conflict_checks (business_id TEXT PRIMARY KEY, snapshot_key TEXT NOT NULL, report TEXT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS business_homepage_sources (business_id TEXT PRIMARY KEY, source_id TEXT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS api_usage (id TEXT PRIMARY KEY, created_at BIGINT NOT NULL, model TEXT NOT NULL, purpose TEXT NOT NULL, status INTEGER NOT NULL, input_tokens BIGINT, output_tokens BIGINT, thought_tokens BIGINT, cached_tokens BIGINT, estimated_usd DOUBLE PRECISION)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS chat_answer_cache (cache_key TEXT PRIMARY KEY, business_id TEXT NOT NULL, answer_json TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`),
    DB.prepare(`CREATE TABLE IF NOT EXISTS fast_answers (business_id TEXT NOT NULL, intent TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', question TEXT NOT NULL DEFAULT '', answer_json TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'error', context_version TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL, PRIMARY KEY (business_id, intent))`),
    DB.prepare(`ALTER TABLE fast_answers ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`ALTER TABLE fast_answers ADD COLUMN IF NOT EXISTS question TEXT NOT NULL DEFAULT ''`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS knowledge_business_idx ON knowledge_sources (business_id, updated_at)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS knowledge_revision_source_idx ON knowledge_source_revisions (source_id, created_at)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS consultation_business_date_idx ON consultations (business_id, created_at)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS random_question_business_status_idx ON random_questions (business_id, status, created_at)`),
    DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS random_question_business_key_unique ON random_questions (business_id, question_key)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage (created_at)`),
    DB.prepare(`CREATE INDEX IF NOT EXISTS chat_answer_cache_expiry_idx ON chat_answer_cache (expires_at)`),
  ]);
}
