import { getAdminSession, accountBusinessIds } from "@/app/admin-session";
import { getBusiness, loadKnowledgeContext, ensureKnowledgeSchema } from "@/db/knowledge";
import { loadCategories } from "@/db/consultation-categories";
import { latestPolicyVersion, savePolicyDraft, setPolicyApproval } from "@/db/policy-store";
import { policyKnowledgeHash, validatePolicyRules, PolicyError } from "@/app/policy-rules";
import { proposePolicyRules } from "@/db/policy-extraction";

async function access(businessId:string){
  const account=await getAdminSession();
  if(!account)return {denied:Response.json({error:"관리자 로그인이 필요합니다."},{status:401})};
  if(!account.is_super_admin&&!accountBusinessIds(account).includes(businessId))return {denied:Response.json({error:"이 사업에 대한 접근 권한이 없습니다."},{status:403})};
  if(!await getBusiness(businessId))return {denied:Response.json({error:"사업을 찾을 수 없습니다."},{status:404})};
  return {account};
}
export async function GET(request:Request){
  const businessId=new URL(request.url).searchParams.get("businessId");if(!businessId)return Response.json({error:"사업을 선택해 주세요."},{status:400});
  const auth=await access(businessId);if(auth.denied)return auth.denied;
  try{
    const [version,knowledge]=await Promise.all([latestPolicyVersion(businessId),loadKnowledgeContext(businessId)]);
    const knowledgeHash=await policyKnowledgeHash(knowledge);
    return Response.json({version:version?{...version,rules:JSON.parse(version.rules_json),rules_json:undefined}:null,knowledgeHash,
      stale:Boolean(version&&version.knowledge_hash!==knowledgeHash),sources:knowledge.sources.map(s=>({id:s.id,title:s.title,parts:s.parts}))},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"규칙표를 불러오지 못했습니다."},{status:500});}
}
export async function POST(request:Request){
  try{
    if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"요청 출처가 올바르지 않습니다."},{status:403});
    const raw=await request.text();if(raw.length>250000)return Response.json({error:"규칙표 크기 제한을 초과했습니다."},{status:413});
    const body=JSON.parse(raw);
    if(typeof body.businessId!=="string"||!Number.isSafeInteger(body.revision)||body.revision<0||!["save","generate","approve","revoke"].includes(body.action))return Response.json({error:"요청 형식이 올바르지 않습니다."},{status:400});
    const auth=await access(body.businessId);if(auth.denied)return auth.denied;
    const knowledge=await loadKnowledgeContext(body.businessId),hash=await policyKnowledgeHash(knowledge);
    if(body.knowledgeHash!==hash)return Response.json({error:"자료가 변경되었습니다. 새 원문을 확인해 주세요."},{status:409});
    if(body.action==="save"||body.action==="generate"){
      const rules=body.action==="generate"?await proposePolicyRules(knowledge):validatePolicyRules(body.rules,knowledge);
      const categories=(await loadCategories(await ensureKnowledgeSchema())).filter(c=>!c.replacement_id);
      if(rules.some(r=>!categories.some(c=>c.id===r.category)))throw new PolicyError("사용하지 않는 질문 분류가 있습니다. 규칙표를 다시 생성해 주세요.");
      if(await policyKnowledgeHash(await loadKnowledgeContext(body.businessId))!==hash)return Response.json({error:"작업 중 자료가 변경되었습니다. 다시 진행해 주세요."},{status:409});
      await savePolicyDraft(body.businessId,body.revision,rules,knowledge,auth.account!.id);
    }else{
      const version=await latestPolicyVersion(body.businessId);
      if(!version||version.revision!==body.revision||version.knowledge_hash!==hash)return Response.json({error:"규칙표가 변경되었습니다. 다시 확인해 주세요."},{status:409});
      if(body.action==="approve"){
        if(body.confirmed!==true)return Response.json({error:"원문과 규칙 값 대조 확인이 필요합니다."},{status:400});
        const rules=validatePolicyRules(JSON.parse(version.rules_json),knowledge);
        if(!rules.length)return Response.json({error:"빈 규칙표는 승인할 수 없습니다."},{status:400});
        const categories=(await loadCategories(await ensureKnowledgeSchema())).filter(c=>!c.replacement_id);
        if(rules.some(r=>!categories.some(c=>c.id===r.category)))throw new PolicyError("사용하지 않는 질문 분류가 있습니다. 규칙표를 다시 생성해 주세요.");
      }
      await setPolicyApproval(body.businessId,body.revision,hash,auth.account!.id,body.action==="approve");
    }
    return Response.json({ok:true});
  }catch(error){
    if(error instanceof PolicyError)return Response.json({error:error.message},{status:400});
    if(error instanceof Error&&error.message==="policy_version_conflict")return Response.json({error:"다른 변경이 먼저 저장되었습니다. 다시 불러오세요."},{status:409});
    return Response.json({error:"규칙표 변경을 완료하지 못했습니다."},{status:500});
  }
}
