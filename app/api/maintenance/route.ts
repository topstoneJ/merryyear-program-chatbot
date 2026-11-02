import { matchesSecretToken } from "@/app/secret-token";
import { ensureKnowledgeSchema, knowledgeEnv } from "@/db/knowledge";
import { runDataMaintenance } from "@/db/data-maintenance";

// Read-only runtime verification uses the same separate operations credential.
// SCM/Kudu's node binary can belong to a different container from this app.
export async function GET(request: Request) {
  const secret = process.env.RETENTION_MAINTENANCE_KEY || "";
  const headers = { "Cache-Control": "no-store" };
  if (secret.length < 32) return Response.json({ error: "Maintenance is not configured" }, { status: 503, headers });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] || "";
  if (!matchesSecretToken(secret, token)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json({ status: "ok", node: process.version }, { headers });
}

export async function POST(request: Request) {
  const secret = process.env.RETENTION_MAINTENANCE_KEY || "";
  const headers = { "Cache-Control": "no-store" };
  if (secret.length < 32) return Response.json({ error: "Maintenance is not configured" }, { status: 503, headers });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] || "";
  if (!matchesSecretToken(secret, token)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await runDataMaintenance(await ensureKnowledgeSchema(), knowledgeEnv().KNOWLEDGE_FILES);
    console.info("data_maintenance", { ...result, at: new Date().toISOString() });
    // The scheduled job fails visibly when blobs remain, so retry failures are
    // not silently reported as successful retention maintenance.
    return Response.json(result, { status: result.pendingFiles ? 503 : 200, headers });
  } catch (error) {
    console.error("data_maintenance_failed", { kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Maintenance failed" }, { status: 500, headers });
  }
}
