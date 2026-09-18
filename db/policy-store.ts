import { ensureKnowledgeSchema } from "./knowledge";
import type { AnswerKnowledge } from "@/app/answer-knowledge";
import { policyKnowledgeHash, validatePolicyRules, type PolicyRule } from "@/app/policy-rules";

export type PolicyVersion = {business_id:string;revision:number;knowledge_hash:string;rules_json:string;status:"draft"|"approved"|"revoked";created_by:string;approved_by:string|null;created_at:number;approved_at:number|null};
export async function latestPolicyVersion(businessId:string) {
  const DB=await ensureKnowledgeSchema();
  return DB.prepare("SELECT * FROM policy_versions WHERE business_id = ? ORDER BY revision DESC LIMIT 1").bind(businessId).first<PolicyVersion>();
}
export async function loadActivePolicyRules(businessId:string,knowledge:AnswerKnowledge):Promise<PolicyRule[]> {
  const version=await latestPolicyVersion(businessId);
  if(!version||version.status!=="approved"||!version.approved_by||version.knowledge_hash!==await policyKnowledgeHash(knowledge)) return [];
  try{return validatePolicyRules(JSON.parse(version.rules_json),knowledge);}catch{return [];}
}
export async function savePolicyDraft(businessId:string,expectedRevision:number,rules:PolicyRule[],knowledge:AnswerKnowledge,actor:string) {
  const DB=await ensureKnowledgeSchema(),hash=await policyKnowledgeHash(knowledge);
  validatePolicyRules(rules,knowledge);
  // Append-only content; concurrent saves use compare-and-swap, not last-write wins.
  const result=await DB.prepare(`INSERT INTO policy_versions (business_id, revision, knowledge_hash, rules_json, status, created_by, created_at)
    SELECT ?, ?, ?, ?, 'draft', ?, ? WHERE COALESCE((SELECT MAX(revision) FROM policy_versions WHERE business_id = ?), 0) = ?
    ON CONFLICT (business_id, revision) DO NOTHING`)
    .bind(businessId,expectedRevision+1,hash,JSON.stringify(rules),actor,Date.now(),businessId,expectedRevision).run();
  if(result.meta.changes!==1) throw new Error("policy_version_conflict");
}
export async function setPolicyApproval(businessId:string,revision:number,hash:string,actor:string,approve:boolean) {
  const DB=await ensureKnowledgeSchema();
  const result=await DB.prepare(`UPDATE policy_versions SET status = ?, approved_by = ?, approved_at = ?
    WHERE business_id = ? AND revision = ? AND knowledge_hash = ? AND status = ?
    AND revision = (SELECT MAX(revision) FROM policy_versions WHERE business_id = ?)`)
    .bind(approve?"approved":"revoked",approve?actor:null,approve?Date.now():null,businessId,revision,hash,approve?"draft":"approved",businessId).run();
  if(result.meta.changes!==1) throw new Error("policy_version_conflict");
}
