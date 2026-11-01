import type { DatabaseBinding, ObjectBinding } from "./runtime";
import { deleteExpiredConsultations } from "./knowledge";

async function ensureDeletionQueue(DB: DatabaseBinding) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS pending_file_deletions (
    file_key TEXT PRIMARY KEY, created_at BIGINT NOT NULL
  )`).run();
}

// Commit the file keys with the relational deletion. Blob outages must not lose
// the information needed to retry deletion after the business has disappeared.
export async function deleteBusinessData(DB: DatabaseBinding, businessId: string) {
  await ensureDeletionQueue(DB);
  await DB.prepare("CREATE TABLE IF NOT EXISTS approved_faq (business_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (business_id,id))").run();
  const sources = await DB.prepare("SELECT id FROM knowledge_sources WHERE business_id = ?").bind(businessId).all<{ id: string }>();
  const sourceIds = new Set(sources.results.map(source => source.id));
  const faqs = await DB.prepare("SELECT business_id, id, payload FROM approved_faq WHERE business_id <> ?").bind(businessId).all<{ business_id: string; id: string; payload: string }>();
  const linkedFaqs = faqs.results.filter(row => {
    try { return sourceIds.has(JSON.parse(row.payload).source); }
    catch { return false; }
  });
  await DB.batch([
    DB.prepare(`INSERT INTO pending_file_deletions (file_key, created_at)
      SELECT DISTINCT file_key, ? FROM knowledge_sources
      WHERE business_id = ? AND file_key IS NOT NULL AND file_key <> ''
      ON CONFLICT(file_key) DO NOTHING`).bind(Date.now(), businessId),
    DB.prepare("DELETE FROM knowledge_source_revisions WHERE source_id IN (SELECT id FROM knowledge_sources WHERE business_id = ?)").bind(businessId),
    DB.prepare("DELETE FROM business_homepage_sources WHERE business_id = ? OR source_id IN (SELECT id FROM knowledge_sources WHERE business_id = ?)").bind(businessId, businessId),
    // Shared source text can also be retained in another business's cache.
    DB.prepare("DELETE FROM knowledge_conflict_checks WHERE business_id = ? OR EXISTS (SELECT 1 FROM knowledge_sources WHERE business_id = ? AND shared_all_businesses = 1)").bind(businessId, businessId),
    DB.prepare("DELETE FROM chat_answer_cache WHERE business_id = ? OR EXISTS (SELECT 1 FROM knowledge_sources WHERE business_id = ? AND shared_all_businesses = 1)").bind(businessId, businessId),
    DB.prepare("DELETE FROM approved_faq WHERE business_id = ?").bind(businessId),
    ...linkedFaqs.map(row => DB.prepare("DELETE FROM approved_faq WHERE business_id = ? AND id = ? AND payload = ?").bind(row.business_id, row.id, row.payload)),
    DB.prepare("DELETE FROM knowledge_sources WHERE business_id = ?").bind(businessId),
    DB.prepare("DELETE FROM consultations WHERE business_id = ?").bind(businessId),
    DB.prepare("DELETE FROM random_questions WHERE business_id = ?").bind(businessId),
    DB.prepare("DELETE FROM businesses WHERE id = ?").bind(businessId),
  ]);
}

export async function drainFileDeletions(DB: DatabaseBinding, files: ObjectBinding | null | undefined) {
  await ensureDeletionQueue(DB);
  const queued = await DB.prepare("SELECT file_key FROM pending_file_deletions ORDER BY created_at, file_key LIMIT 200").all<{ file_key: string }>();
  let deleted = 0;
  for (const { file_key: key } of queued.results) {
    if (!files) break;
    // A key still used by another source must survive. A later deletion will
    // enqueue it again; the queue is not permission to delete live data.
    const inUse = await DB.prepare("SELECT id FROM knowledge_sources WHERE file_key = ? LIMIT 1").bind(key).first();
    if (!inUse) {
      try { await files.delete(key); }
      catch { continue; }
      deleted += 1;
    }
    await DB.prepare("DELETE FROM pending_file_deletions WHERE file_key = ?").bind(key).run();
  }
  const remaining = await DB.prepare("SELECT COUNT(*) AS count FROM pending_file_deletions").first<{ count: number }>();
  return { deletedFiles: deleted, pendingFiles: Number(remaining?.count || 0) };
}

export async function runDataMaintenance(DB: DatabaseBinding, files: ObjectBinding | null | undefined, now = Date.now()) {
  const expired = await deleteExpiredConsultations(DB, now);
  await DB.prepare("DELETE FROM chat_answer_cache WHERE expires_at < ?").bind(now).run();
  const dayKey = new Date(now + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  await DB.prepare("DELETE FROM daily_question_limits WHERE day_key < ?").bind(dayKey).run();
  await DB.prepare("CREATE TABLE IF NOT EXISTS admin_login_limits (window_key TEXT NOT NULL, subject_hash TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, PRIMARY KEY(window_key,subject_hash))").run();
  await DB.prepare("DELETE FROM admin_login_limits WHERE expires_at <= ?").bind(now).run();
  return { deletedConsultations: expired.meta.changes, ...await drainFileDeletions(DB, files) };
}
