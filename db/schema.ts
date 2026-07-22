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
