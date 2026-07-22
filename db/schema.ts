import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  code: text("code").notNull(),
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
  source: text("source").notNull(),
  confidence: integer("confidence").notNull().default(0),
  review: integer("review", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("consultation_business_date_idx").on(table.businessId, table.createdAt),
]);
