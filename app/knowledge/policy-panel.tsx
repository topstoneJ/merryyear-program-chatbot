"use client";
import { useEffect, useState } from "react";
import type { PolicyRule } from "@/app/policy-rules";
type Config={text?:string;referral?:boolean;note?:string;totalWon?:number;monthlyWon?:number|null;months?:number|null;thresholds?:Array<{persons:number;won:number}>;cases?:Array<{value:string;visaGroup:boolean;text:string;referral:boolean}>};
type Snapshot={knowledgeHash:string;stale:boolean;version:null|{revision:number;status:string;approved_by:string|null;rules:PolicyRule[]};sources:Array<{id:string;title:string;parts:Array<{id:string;title:string;pages:number[];text:string}>}>};

export default function PolicyPanel({businessId}:{businessId:string}){
  const [data,setData]=useState<Snapshot|null>(null),[rules,setRules]=useState<PolicyRule[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[dirty,setDirty]=useState(false),[confirmed,setConfirmed]=useState(false);
  const url=`/api/policy-rules?businessId=${encodeURIComponent(businessId)}`;
  useEffect(()=>{
    const controller=new AbortController();
    fetch(url,{signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);return value;}).then(value=>{setData(value);setRules(value.version?.rules||[]);}).catch(e=>{if(e.name!=="AbortError")setError(e.message);});
    return ()=>controller.abort();
  },[url]);
  async function refresh(){
    if(busy||dirty)return;setBusy(true);setError("");
    try{const response=await fetch(url);const value=await response.json();if(!response.ok)throw new Error(value.error);setData(value);setRules(value.version?.rules||[]);setConfirmed(false);}
    catch(e){setError(e instanceof Error?e.message:"불러오지 못했습니다.");}finally{setBusy(false);}
  }
  async function action(action:string){
    if(!data||busy)return;setBusy(true);setError("");
    try{
      const response=await fetch("/api/policy-rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({businessId,action,revision:data.version?.revision||0,knowledgeHash:data.knowledgeHash,rules,confirmed})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      const reload=await fetch(url);const next=await reload.json();if(!reload.ok)throw new Error(next.error);
      setData(next);setRules(next.version?.rules||[]);setDirty(false);setConfirmed(false);
    }catch(e){setError(e instanceof Error?e.message:"규칙표 처리를 완료하지 못했습니다.");}finally{setBusy(false);}
  }
  function edit(index:number,change:Partial<PolicyRule>){setRules(old=>old.map((r,i)=>i===index?{...r,...change}:r));setDirty(true);setConfirmed(false);}
  function config(index:number,value:Config){edit(index,{configJson:JSON.stringify(value)});}
  const number=(value:string)=>value===""?null:Number(value);
  return <section className="knowledge-add" aria-label="확인된 정책 규칙표" style={{padding:24,marginTop:20}}>
    <h2>확인된 정책 규칙표</h2>
    <p>승인한 금액·조건·예외는 서버가 직접 판정합니다. AI 초안은 원문과 대조하여 승인하기 전에는 답변에 사용하지 않습니다. 자료가 바뀌면 기존 승인은 적용되지 않습니다.</p>
    <p role="status">{!data?"규칙표 불러오는 중…":data.stale?"자료 변경으로 재검토 필요":data.version?.status==="approved"?`승인됨 · 버전 ${data.version.revision}`:data.version?`검토 중 · 버전 ${data.version.revision}`:"아직 규칙표가 없습니다."}</p>
    {error&&<p className="knowledge-notice error" role="alert">{error}</p>}
    <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"16px 0"}}>
      <button type="button" className="cancel-button" disabled={busy||dirty} onClick={()=>void refresh()}>최신 자료로 다시 불러오기</button>
      <button type="button" className="cancel-button" disabled={busy||!data||dirty} onClick={()=>void action("generate")}>{busy?"처리 중…":"현재 자료로 검토 초안 만들기"}</button>
      <button type="button" className="knowledge-submit" disabled={busy||!dirty} onClick={()=>void action("save")}>수정 초안 저장</button>
      {data?.version?.status==="approved"&&!data.stale&&<button type="button" className="cancel-button" disabled={busy||dirty} onClick={()=>void action("revoke")}>승인 해제</button>}
    </div>
    <small>초안 생성은 등록된 AI API를 사용하며 사용료가 발생할 수 있습니다. 초안을 새로 저장하면 다시 승인해야 합니다.</small>
    {rules.map((rule,index)=>{
      const c=JSON.parse(rule.configJson) as Config;
      return <details key={rule.id} style={{borderTop:"1px solid #ddd",padding:"16px 0"}}>
        <summary style={{cursor:"pointer",fontWeight:600}}>{index+1}. {rule.title} · {({fact:"사실 안내",income:"가구 월소득 비교",cap:"항목별 한도",choice:"조건별 예외"})[rule.kind]}</summary>
        <button type="button" className="cancel-button" disabled={busy} onClick={()=>{setRules(old=>old.filter((_,i)=>i!==index));setDirty(true);setConfirmed(false);}}>이 규칙을 초안에서 제외</button>
        <label className="field"><span>답변할 질문 범위</span><textarea value={rule.scope} disabled={busy} onChange={e=>edit(index,{scope:e.target.value})}/></label>
        {c.text!==undefined&&<label className="field"><span>확정 안내문</span><textarea value={c.text} disabled={busy} onChange={e=>config(index,{...c,text:e.target.value})}/></label>}
        {c.referral!==undefined&&<label><input type="checkbox" checked={c.referral} disabled={busy} onChange={e=>config(index,{...c,referral:e.target.checked})}/> 원문상 담당자 확인이 필요한 규칙</label>}
        {c.thresholds?.map((row,i)=><label className="field" key={row.persons}><span>{row.persons}인 가구 월소득 기준 (원 이하)</span><input type="number" min="1" value={row.won} disabled={busy} onChange={e=>config(index,{...c,thresholds:c.thresholds!.map((r,j)=>j===i?{...r,won:Number(e.target.value)}:r)})}/></label>)}
        {rule.kind==="cap"&&([['totalWon','총 한도 (원)'],['monthlyWon','월 한도 (원, 없으면 비움)'],['months','최대 개월 수 (없으면 비움)']] as const).map(([key,label])=><label className="field" key={key}><span>{label}</span><input type="number" min="1" value={c[key]??""} disabled={busy} onChange={e=>config(index,{...c,[key]:number(e.target.value)})}/></label>)}
        {c.cases?.map((row,i)=><div key={row.value}><label className="field"><span>{row.value}{row.visaGroup?" 비자군":""} 안내</span><textarea value={row.text} disabled={busy} onChange={e=>config(index,{...c,cases:c.cases!.map((r,j)=>j===i?{...r,text:e.target.value}:r)})}/></label><label><input type="checkbox" checked={row.referral} disabled={busy} onChange={e=>config(index,{...c,cases:c.cases!.map((r,j)=>j===i?{...r,referral:e.target.checked}:r)})}/> 원문상 별도 문의</label></div>)}
        {c.note!==undefined&&<label className="field"><span>적용 제한·예외·주의사항</span><textarea value={c.note} disabled={busy} onChange={e=>config(index,{...c,note:e.target.value})}/></label>}
        <h3>대조할 원문</h3>{rule.evidence.map((ref,i)=>{const source=data?.sources.find(s=>s.id===ref.sourceId),part=source?.parts.find(p=>p.id===ref.partId);return <div key={i}><b>{source?.title||ref.sourceId} · {part?.title}{part?.pages.length?` (${part.pages.join(", ")}쪽)`:""}</b><blockquote style={{whiteSpace:"pre-wrap",margin:"12px 0",padding:12,background:"#f5f5f5"}}>{ref.quote}</blockquote><details><summary>앞뒤 원문 함께 보기</summary><pre style={{whiteSpace:"pre-wrap"}}>{part?.text}</pre></details></div>;})}
      </details>;
    })}
    {Boolean(rules.length)&&<div style={{marginTop:20}}><label><input type="checkbox" checked={confirmed} disabled={busy||dirty||data?.stale||data?.version?.status!=="draft"} onChange={e=>setConfirmed(e.target.checked)}/> 모든 규칙의 범위·금액·조건·예외를 원문과 대조했습니다.</label><button type="button" className="knowledge-submit" style={{marginLeft:12}} disabled={busy||dirty||!confirmed||data?.stale||data?.version?.status!=="draft"} onClick={()=>void action("approve")}>검토한 버전 승인</button></div>}
  </section>;
}
