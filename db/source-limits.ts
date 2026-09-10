// Existing random answers remain identifiable through their source relationship.
// New answers use type=random so the limit is atomic at INSERT time.
export const COUNT_SOURCE_KIND_SQL = `SELECT COUNT(*) FROM knowledge_sources k WHERE k.business_id = ? AND
  (CASE WHEN k.type = 'random' OR (k.type = 'text' AND EXISTS(SELECT 1 FROM random_questions r WHERE r.knowledge_source_id = k.id)) THEN 'random' ELSE k.type END) = ?`;
