'use client';
import {useEffect,useRef,useState} from 'react';
type Item={id:string;question:string;text:string;source:string;quote:string};
type Topic=readonly [string,string];
function Icon({name}:{name:'edit'|'refresh'|'trash'}) {
  const paths={edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,refresh:<><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/></>,trash:<><path d="M3 6h18"/><path d="M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>};
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export default function FaqPanel({businessId}:{businessId:string}) {
  const [items,setItems]=useState<Item[]>([]),[topics,setTopics]=useState<Topic[]>([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[edit,setEdit]=useState<string|null>(null),[text,setText]=useState('');
  const close=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLButtonElement>(null);
  async function refresh(){const r=await fetch(`/api/faq?businessId=${encodeURIComponent(businessId)}`,{cache:'no-store'});if(!r.ok)throw new Error('FAQ를 불러오지 못했습니다.');const payload=await r.json();setItems(payload.items);setTopics(payload.topics||[]);}
  useEffect(()=>{let active=true;setItems([]);setTopics([]);fetch(`/api/faq?businessId=${encodeURIComponent(businessId)}`,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(p=>{if(active){setItems(p.items);setTopics(p.topics||[]);}}).catch(()=>{if(active)setMessage('FAQ를 불러오지 못했습니다.');});return()=>{active=false;};},[businessId]);
  useEffect(()=>{if(open)close.current?.focus();},[open]);
  function dismiss(){if(busy)return;setOpen(false);trigger.current?.focus();}
  async function action(id:string,action:string){setBusy(true);setMessage('');try {const r=await fetch('/api/faq',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessId,id,action,text})});const p=await r.json();if(!r.ok)throw new Error(p.error);setEdit(null);await refresh();}catch(e){setMessage(e instanceof Error?e.message:'처리하지 못했습니다.');}finally{setBusy(false);}}
  async function all(){setBusy(true);let failed=0;for(const [id] of topics){setMessage(`${id} FAQ 생성·검증 중`);try{const r=await fetch('/api/faq',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessId,id,action:'generate'})});if(!r.ok)failed++;await refresh();}catch{failed++;}}setBusy(false);setMessage(failed?`${failed}개 항목은 기준을 통과하지 못했습니다. 기존 답변은 유지됩니다.`:'기준을 통과한 FAQ를 저장했습니다.');}
  const indicator=busy?'orange':items.length?'green':'red';
  return <><button ref={trigger} className={`data-volume-indicator ${indicator}`} type="button" aria-haspopup="dialog" onClick={()=>{setOpen(true);void refresh().catch(()=>setMessage('FAQ를 불러오지 못했습니다.'));}}><span className="data-volume-dot"/>FAQ {items.length}개</button>{open&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)dismiss();}}><section className="modal faq-modal" role="dialog" aria-modal="true" aria-labelledby="faq-title" onKeyDown={e=>{if(e.key==='Escape')dismiss();if(e.key==='Tab'){const nodes=e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea');const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
    <button ref={close} className="modal-close" disabled={busy} onClick={dismiss} aria-label="닫기">×</button><h2 id="faq-title">FAQ</h2>
    <ul className="faq-note"><li>등록된 질문과 정확히 일치할 때 준비된 답변을 바로 안내해요.</li><li>개인 상황·복합 질문·이전 대화가 있는 질문은 AI가 답해요.</li><li>자료·답변 규칙·API 설정이 바뀌면 다시 생성해 주세요.</li></ul>
    <button disabled={busy||!topics.length} onClick={()=>void all()}>전체 재생성</button><p role="status">{busy?'생성·검증 중입니다. ':''}{message}</p>
    {items.map(item=><article className="faq-card" key={item.id}><header><b><span className="faq-approved-dot"/> {item.id}</b><span>{item.question}</span></header>{edit===item.id?<textarea aria-label="FAQ 답변 수정" value={text} maxLength={3000} onChange={e=>setText(e.target.value)}/>:<p>{item.text}</p>}<footer>{edit===item.id?<><button disabled={busy} onClick={()=>void action(item.id,'edit')}>검증 후 저장</button><button disabled={busy} onClick={()=>setEdit(null)}>취소</button></>:<><button className="faq-icon-button" title="수정" aria-label={`${item.id} 수정`} disabled={busy} onClick={()=>{setEdit(item.id);setText(item.text);}}><Icon name="edit"/></button><button className="faq-icon-button" title="재생성" aria-label={`${item.id} 재생성`} disabled={busy} onClick={()=>void action(item.id,'generate')}><Icon name="refresh"/></button><button className="faq-icon-button danger" title="삭제" aria-label={`${item.id} 삭제`} disabled={busy} onClick={()=>void action(item.id,'delete')}><Icon name="trash"/></button></>}</footer></article>)}
    {!items.length&&<p>사용 가능한 FAQ가 없습니다. 전체 재생성으로 준비해 주세요.</p>}
  </section></div>}</>;
}
