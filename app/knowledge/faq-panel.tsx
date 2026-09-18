'use client';
import {useEffect,useRef,useState} from 'react';
import {FAQ_TOPICS} from '../faq-match';
type Item={id:string;question:string;text:string;source:string;quote:string};
export default function FaqPanel({businessId}:{businessId:string}) {
  const [items,setItems]=useState<Item[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[edit,setEdit]=useState<string|null>(null),[text,setText]=useState('');
  const close=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLButtonElement>(null);
  async function refresh(){const r=await fetch(`/api/faq?businessId=${encodeURIComponent(businessId)}`,{cache:'no-store'});if(!r.ok)throw new Error('FAQ를 불러오지 못했습니다.');setItems((await r.json()).items);}
  useEffect(()=>{let active=true;setItems([]);fetch(`/api/faq?businessId=${encodeURIComponent(businessId)}`,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(p=>{if(active)setItems(p.items);}).catch(()=>{if(active)setMessage('FAQ를 불러오지 못했습니다.');});return()=>{active=false;};},[businessId]);
  useEffect(()=>{if(open)close.current?.focus();},[open]);
  function dismiss(){if(busy)return;setOpen(false);trigger.current?.focus();}
  async function action(id:string,action:string){setBusy(true);setMessage('');try {const r=await fetch('/api/faq',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessId,id,action,text})});const p=await r.json();if(!r.ok)throw new Error(p.error);setEdit(null);await refresh();}catch(e){setMessage(e instanceof Error?e.message:'처리하지 못했습니다.');}finally{setBusy(false);}}
  async function all(){setBusy(true);let failed=0;for(const [id] of FAQ_TOPICS){setMessage(`${id} FAQ 생성·검증 중`);try{const r=await fetch('/api/faq',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessId,id,action:'generate'})});if(!r.ok)failed++;await refresh();}catch{failed++;}}setBusy(false);setMessage(failed?`${failed}개 항목은 기준을 통과하지 못했습니다. 기존 답변은 유지됩니다.`:'기준을 통과한 FAQ를 저장했습니다.');}
  return <><button ref={trigger} className="data-volume-indicator green" type="button" aria-haspopup="dialog" onClick={()=>{setOpen(true);void refresh().catch(()=>setMessage('FAQ를 불러오지 못했습니다.'));}}><span className="data-volume-dot"/>FAQ {items.length}개</button>{open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)dismiss();}}><section className="modal faq-modal" role="dialog" aria-modal="true" aria-labelledby="faq-title" onKeyDown={e=>{if(e.key==='Escape')dismiss();if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
    <button ref={close} className="modal-close" disabled={busy} onClick={dismiss} aria-label="닫기">×</button><h2 id="faq-title">FAQ <small>FAQ {items.length}개</small></h2>
    <p className="faq-note">등록된 질문과 정확히 일치할 때 준비된 답변을 바로 안내해요.<br/>개인 상황·복합 질문·이전 대화가 있는 질문은 AI가 답해요.<br/>자료·답변 규칙·API 설정이 바뀌면 다시 생성해 주세요.</p>
    <button disabled={busy} onClick={()=>void all()}>전체 재생성</button><p role="status">{busy?'생성·검증 중입니다. ':''}{message}</p>
    {items.map(item=><article className="faq-card" key={item.id}><header><b>🟢 {item.id}</b><span>{item.question}</span></header>{edit===item.id?<textarea aria-label="FAQ 답변 수정" value={text} maxLength={3000} onChange={e=>setText(e.target.value)}/>:<p>{item.text}</p>}<details><summary>근거 보기</summary><p>{item.quote}</p></details><footer>{edit===item.id?<><button disabled={busy} onClick={()=>void action(item.id,'edit')}>검증 후 저장</button><button disabled={busy} onClick={()=>setEdit(null)}>취소</button></>:<><button disabled={busy} onClick={()=>{setEdit(item.id);setText(item.text);}}>수정</button><button disabled={busy} onClick={()=>void action(item.id,'generate')}>재생성</button><button disabled={busy} onClick={()=>void action(item.id,'delete')}>삭제</button></>}</footer></article>)}
    {!items.length&&<p>사용 가능한 FAQ가 없습니다. 전체 재생성으로 준비해 주세요.</p>}
  </section></div>}</>;
}
