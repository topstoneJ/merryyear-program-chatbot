export type QuestionCategory = { id: string; name: string; sort_order: number; replacement_id: string | null };
export const DEFAULT_CATEGORIES = ["신청 자격", "지원 내용", "신청 기간", "신청 방법", "운영 문의", "기타", "지출 증빙", "선정 절차"];

import type { DatabaseBinding } from "./runtime";

export async function loadCategories(DB: DatabaseBinding) {
  // Tombstones retain default IDs so removed defaults are never seeded again.
  await DB.batch(DEFAULT_CATEGORIES.map((name, index) => DB.prepare(
    "INSERT OR IGNORE INTO consultation_categories (id, name, sort_order) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM consultation_categories WHERE replace(name, ' ', '') = ?)",
  ).bind(name, name, index, name.replace(/\s/g, ""))));
  return (await DB.prepare("SELECT * FROM consultation_categories ORDER BY sort_order, id").all<QuestionCategory>()).results;
}

export function resolveCategory(id: string, categories: QuestionCategory[]) {
  const seen = new Set<string>();
  let category = categories.find(item => item.id === id);
  while (category?.replacement_id && !seen.has(category.id)) {
    seen.add(category.id);
    category = categories.find(item => item.id === category!.replacement_id);
  }
  return category && !category.replacement_id ? category : categories.find(item => item.id === "기타" && !item.replacement_id) || categories.find(item => !item.replacement_id)!;
}
