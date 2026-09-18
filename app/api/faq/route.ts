import { requireAdminApi } from '@/app/admin-session';
import { faqContext,listFaq,generateFaq,verifyFaq,type Faq } from '@/db/faq';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request) {
  const url=new URL(request.url),businessId=url.searchParams.get('businessId');if(!businessId)return reply({error:'사업을 선택해 주세요.'},400);
  if(url.searchParams.get('view')==='questions') {
    try {const ctx=await faqContext(businessId);return reply({questions:ctx.isPublic?(await listFaq(ctx,businessId)).map(item=>item.question):[]});}catch{return reply({questions:[]});}
  }
  const denied=await requireAdminApi({businessId});if(denied)return denied;
  try {const ctx=await faqContext(businessId);return reply({items:await listFaq(ctx,businessId),topics:ctx.topics});}catch{return reply({error:'FAQ를 불러오지 못했습니다.'},503);}
}
export async function POST(request:Request) {
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.businessId!=='string'||typeof body.id!=='string'||!['generate','edit','delete'].includes(body.action))return reply({error:'잘못된 요청입니다.'},400);
  const denied=await requireAdminApi({businessId:body.businessId});if(denied)return denied;
  try {
    const ctx=await faqContext(body.businessId);
    const existing=(await listFaq(ctx,body.businessId)).find(x=>x.id===body.id);
    if(body.action==='delete') {await ctx.DB.prepare('DELETE FROM approved_faq WHERE business_id = ? AND id = ?').bind(body.businessId,body.id).run();return reply({ok:true});}
    let item:Faq;
    if(body.action==='edit') {
      if(!existing||typeof body.text!=='string'||!body.text.trim()||body.text.length>3000)return reply({error:'저장할 답변을 확인해 주세요.'},400);
      item={...existing,text:body.text};
      if(!await verifyFaq(ctx,item))return reply({error:'수정 내용이 근거 또는 적용 조건과 맞지 않습니다. 입력한 문장은 유지됩니다.'},422);
    }else item=await generateFaq(ctx,body.id);
    const fresh=await faqContext(body.businessId);
    if(fresh.version!==ctx.version)return reply({error:'검증 중 자료나 설정이 변경됐습니다. 다시 시도해 주세요.'},409);
    await ctx.DB.prepare('INSERT INTO approved_faq (business_id,id,payload) VALUES (?,?,?) ON CONFLICT (business_id,id) DO UPDATE SET payload = excluded.payload').bind(body.businessId,item.id,JSON.stringify(item)).run();
    return reply({item});
  }catch{return reply({error:'기준을 통과한 FAQ를 만들지 못했습니다. 기존 답변은 유지됩니다.'},422);}
}
