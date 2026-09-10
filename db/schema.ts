import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const apiUsage = sqliteTable("api_usage", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  status: integer("status").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  thoughtTokens: integer("thought_tokens"),
  cachedTokens: integer("cached_tokens"),
  estimatedUsd: real("estimated_usd"),
}, table => [index("api_usage_created_at_idx").on(table.createdAt)]);

export const knowledgeConflictChecks = sqliteTable("knowledge_conflict_checks", {
  businessId: text("business_id").primaryKey(),
  snapshotKey: text("snapshot_key").notNull(),
  report: text("report").notNull(),
});

export const knowledgeSources = sqliteTable("knowledge_sources", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("ready"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("knowledge_business_idx").on(table.businessId, table.updatedAt),
]);

export const knowledgeSourceRevisions = sqliteTable("knowledge_source_revisions", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("knowledge_revision_source_idx").on(table.sourceId, table.createdAt)]);

export const dataRepairs = sqliteTable("data_repairs", {
  id: text("id").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
});

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  code: text("code").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  noticeUrl: text("notice_url").notNull().default(""),
  contactDepartment: text("contact_department").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  contactHours: text("contact_hours").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const consultations = sqliteTable("consultations", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  summary: text("summary").notNull(),
  decision: text("decision").notNull(),
  category: text("category").notNull(),
  reviewManual: integer("review_manual").notNull().default(0),
  categoryRevision: text("category_revision").notNull().default(""),
  categoryManual: integer("category_manual").notNull().default(0),
  source: text("source").notNull(),
  confidence: integer("confidence").notNull().default(0),
  review: integer("review", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("consultation_business_date_idx").on(table.businessId, table.createdAt),
]);

export const randomQuestions = sqliteTable("random_questions", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  questionKey: text("question_key").notNull(),
  question: text("question").notNull(),
  optionsJson: text("options_json").notNull(),
  status: text("status").notNull().default("active"),
  selectedOptionsJson: text("selected_options_json").notNull().default("[]"),
  note: text("note").notNull().default(""),
  knowledgeSourceId: text("knowledge_source_id"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [
  index("random_question_business_status_idx").on(table.businessId, table.status, table.createdAt),
  uniqueIndex("random_question_business_key_unique").on(table.businessId, table.questionKey),
]);

export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey(),
  organizationName: text("organization_name").notNull(),
  contact: text("contact").notNull().default(""),
  logoKey: text("logo_key"),
  faviconKey: text("favicon_key"),
  socialImageKey: text("social_image_key"),
  socialCaption: text("social_caption").notNull().default(""),
  mainHeadline: text("main_headline").notNull(),
  mainSubcopy: text("main_subcopy").notNull(),
  chatPlaceholder: text("chat_placeholder").notNull().default("선택한 사업에 대해 질문해 주세요"),
  chatbotGreeting: text("chatbot_greeting").notNull(),
  primaryColor: text("primary_color").notNull().default("#f26a2e"),
  geminiApiKeyEncrypted: text("gemini_api_key_encrypted"),
  answerSettingsJson: text("answer_settings_json").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

export const consultationCategories = sqliteTable("consultation_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  replacementId: text("replacement_id"),
});

export const adminUsers = sqliteTable("admin_users", {
  email: text("email").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const adminAccounts = sqliteTable("admin_accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  businessIdsJson: text("business_ids_json").notNull().default("[]"),
  canViewConsultations: integer("can_view_consultations", { mode: "boolean" }).notNull().default(true),
  canDeleteConsultations: integer("can_delete_consultations", { mode: "boolean" }).notNull().default(false),
  canManageSettings: integer("can_manage_settings", { mode: "boolean" }).notNull().default(false),
  isSuperAdmin: integer("is_super_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const businessHomepageSources = sqliteTable("business_homepage_sources", {
  businessId: text("business_id").primaryKey(),
  sourceId: text("source_id").notNull(),
});
