"use client";
import { useEffect, useRef, useState } from "react";

type Usage = { date: string; dateKey: string; currentDate: string; model: string; apiProvider: "google" | "openai" | null; apiKeyConfigured: boolean; storedApiKeyConfigured: boolean; environmentApiKeyConfigured: boolean; trackingStartedAt: number | null; pricingUrl: string | null; provider: string | null;
  models: { model: string; provider: string | null; pricingUrl: string | null; requests: number; estimatedUsd: number; unpriced: number }[];
  rates: { input: number; output: number; cached: number } | null;
  totals: { requests: number; failed: number; inputTokens: number; outputTokens: number; thoughtTokens: number; cachedTokens: number; estimatedUsd: number; unpriced: number };
  breakdown: { purpose: string; requests: number; estimatedUsd: number; unpriced: number }[] };
const PURPOSES: Record<string, string> = { chat: "챗봇 답변", knowledge: "자료 분석", conflict: "충돌 검사", classification: "질문 유형 분류" };
const number = (value: number) => Number(value || 0).toLocaleString("ko-KR");
const money = (value: number) => `$${Number(value || 0).toFixed(4)}`;
const dateInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
function shiftYear(value: string, years: number) { const date = new Date(`${value}T00:00:00`); date.setFullYear(date.getFullYear() + years); return dateInput(date); }

export default function ApiManagementPanel() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const today = dateInput(new Date());
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [from, setFrom] = useState(() => dateInput(monthAgo));
  const [to, setTo] = useState(today);
  const loadId = useRef(0);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function load(selectedFrom: string, selectedTo: string) {
    const id = ++loadId.current;
    setLoading(true); setError("");
    try { const response = await fetch(`/api/api-management?from=${encodeURIComponent(selectedFrom)}&to=${encodeURIComponent(selectedTo)}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); if (id === loadId.current) setUsage(payload); }
    catch (error) { if (id === loadId.current) { setUsage(null); setError(error instanceof Error ? error.message : "API 정보를 불러오지 못했습니다."); } }
    finally { if (id === loadId.current) setLoading(false); }
  }
  useEffect(() => { void load(from, to); return () => { loadId.current++; }; }, [from, to]);
  async function saveKey() {
    if (!apiKey.trim() || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/api-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey.trim() }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setApiKey(""); await load(from, to);
      setNotice("API 키가 저장되었습니다.");
    } catch (error) { setError(error instanceof Error ? error.message : "API 키를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  async function deleteKey() {
    if (!usage?.storedApiKeyConfigured || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/api-management", { method: "DELETE" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setApiKey(""); setUsage(previous => previous ? { ...previous, apiKeyConfigured: Boolean(payload.apiKeyConfigured), storedApiKeyConfigured: false } : previous);
      setNotice("API 키가 삭제되었습니다.");
      setConfirmDelete(false);
    } catch (error) { setError(error instanceof Error ? error.message : "API 키를 삭제하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <div className="api-management-panel">
    <section className="settings-card"><h2>API 연결</h2><p className="field-help"><b>{loading ? "API 연결 상태 확인 중" : usage?.apiKeyConfigured ? `${usage.provider || "AI"} API 연결됨` : "API 없음"}</b>{usage?.apiKeyConfigured ? ` · 사용 모델 ${usage.model}` : ""}</p>
      {usage?.apiKeyConfigured && <p className="field-help">{usage.rates ? `현재 등록 단가: 100만 토큰당 입력 $${usage.rates.input}, 출력·생각 $${usage.rates.output}, 캐시 입력 $${usage.rates.cached}. ` : "현재 모델의 단가가 등록되지 않아 요금을 계산할 수 없습니다. "}{usage.pricingUrl ? <a href={usage.pricingUrl} target="_blank" rel="noreferrer">{usage.provider} 공식 요금표</a> : "공식 요금표가 등록되지 않은 모델입니다."}</p>}
      <label className="field"><span>API 키</span><input type="password" autoComplete="new-password" value={apiKey} disabled={saving || !usage} maxLength={300} onChange={e => setApiKey(e.target.value)} placeholder={usage?.apiKeyConfigured ? "설정됨 · 변경할 때만 새 키 입력" : "API 키 입력"} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void saveKey(); } }} /></label>
      <div className="api-key-actions"><button type="button" className="knowledge-submit" disabled={saving || !apiKey.trim() || !usage} onClick={() => void saveKey()}>{saving ? "처리 중…" : "API 키 저장"}</button><button type="button" className="danger-button" disabled={saving || !usage?.storedApiKeyConfigured} onClick={() => setConfirmDelete(true)}>API 키 삭제</button></div>
      {usage?.apiKeyConfigured && usage.environmentApiKeyConfigured && !usage.storedApiKeyConfigured && <p className="field-help">관리 화면에 저장한 키가 없으며 사이트의 기본 연결 키를 사용 중입니다.</p>}
      {notice && <p className="settings-notice" role="status">{notice}</p>}
    </section>
    <section className="settings-card"><div className="api-usage-heading"><h2>API 사용량</h2><div className="period-panel"><label><input aria-label="시작일" type="date" min={shiftYear(to, -1)} max={to} value={from} onChange={e => { if (e.target.value) setFrom(e.target.value); }} /></label><i>–</i><label><input aria-label="종료일" type="date" min={from} max={[today, shiftYear(from, 1)].sort()[0]} value={to} onChange={e => { if (e.target.value) setTo(e.target.value); }} /></label></div><button type="button" className="cancel-button" disabled={loading} onClick={() => void load(from, to)}>{loading ? "불러오는 중…" : "새로고침"}</button></div>
      {loading && <p className="field-help" role="status">선택한 기간의 사용량을 불러오는 중입니다.</p>}
      {usage && !loading && <>
        <div className="api-usage-metrics">
          <div><span>선택 기간 호출</span><strong>{number(usage.totals.requests)}<small>회</small></strong><small>실패 {number(usage.totals.failed)}회 포함</small></div>
          <div><span>입력 토큰</span><strong>{number(usage.totals.inputTokens)}</strong><small>캐시 {number(usage.totals.cachedTokens)} 포함</small></div>
          <div><span>출력 토큰</span><strong>{number(usage.totals.outputTokens + usage.totals.thoughtTokens)}</strong><small>생각 토큰 {number(usage.totals.thoughtTokens)} 포함</small></div>
          <div><span>선택 기간 추정 요금</span><strong>{usage.totals.requests > 0 && usage.totals.unpriced === usage.totals.requests ? "집계 불가" : money(usage.totals.estimatedUsd)}</strong><small>USD · 유료 표준 단가 기준</small></div>
        </div>
        {usage.breakdown.length > 0 ? <table className="api-usage-table"><thead><tr><th>사용 항목</th><th>호출</th><th>추정 요금</th></tr></thead><tbody>{usage.breakdown.map(item => <tr key={item.purpose}><td>{PURPOSES[item.purpose] || item.purpose}</td><td>{number(item.requests)}회</td><td>{item.unpriced === item.requests ? "집계 불가" : money(item.estimatedUsd)}</td></tr>)}</tbody></table> : <p className="field-help">선택한 기간에 기록된 API 호출이 없습니다.</p>}
        <p className="field-help">이 기능 도입 이후 본 사이트에서 발생한 모든 API 호출을 키 변경 여부와 관계없이 합산합니다. 같은 키를 사용하는 다른 서비스의 사용량은 포함되지 않습니다. 한국 시간 기준 날짜별 합계입니다.{usage.trackingStartedAt ? ` 최초 기록: ${new Date(usage.trackingStartedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}.` : " 첫 API 호출부터 기록됩니다."}</p>
        {usage.models.length > 0 && <><h3 className="api-model-heading">모델별 사용량</h3><div className="api-table-scroll"><table className="api-usage-table"><thead><tr><th>모델</th><th>호출</th><th>추정 요금</th><th>공식 요금표</th></tr></thead><tbody>{usage.models.map(item => <tr key={item.model}><td>{item.model}</td><td>{number(item.requests)}회</td><td>{item.unpriced === item.requests ? "집계 불가" : money(item.estimatedUsd)}{item.unpriced > 0 && item.unpriced < item.requests && <small> · 일부 미집계</small>}</td><td>{item.pricingUrl ? <a href={item.pricingUrl} target="_blank" rel="noreferrer">{item.provider} 공식 요금표</a> : "미등록"}</td></tr>)}</tbody></table></div><p className="field-help">API를 교체하면 각 API의 실제 호출 사용량이 모델별로 자동 합산됩니다.</p></>}
        <p className="field-help">호출 당시 모델과 단가로 기록한 추정 요금을 합산합니다. 현재 모델이나 단가가 바뀌어도 과거 기록은 다시 계산하지 않습니다. 공식 요금표 링크는 모델의 제공자에 맞게 표시되며, 링크의 최신 가격이 계산 단가에 자동 반영되지는 않습니다. 실제 청구액은 무료 사용량, 할인, 세금 등에 따라 달라질 수 있습니다.</p>
        {usage.totals.unpriced > 0 && <p className="field-help">사용량 또는 단가가 확인되지 않은 {number(usage.totals.unpriced)}회는 요금 합계에서 제외했습니다.</p>}
      </>}
    </section>
    {error && <p className="answer-settings-error" role="alert">{error}</p>}
    {confirmDelete && <div className="modal-backdrop" role="presentation"><section className="modal compact-modal api-key-delete-modal" role="dialog" aria-modal="true" aria-labelledby="api-key-delete-title"><button type="button" className="modal-close" aria-label="닫기" onClick={() => setConfirmDelete(false)}>×</button><span className="modal-kicker">API 연결</span><h2 id="api-key-delete-title">저장한 API 키를 삭제할까요?</h2><p>관리 화면에 저장한 API 키만 삭제됩니다. 기존 날짜별 사용량과 추정 비용 기록은 삭제되지 않습니다.</p><div className="modal-actions"><button type="button" className="cancel-button" disabled={saving} onClick={() => setConfirmDelete(false)}>취소</button><button type="button" className="danger-button" disabled={saving} onClick={() => void deleteKey()}>{saving ? "삭제 중…" : "API 키 삭제"}</button></div></section></div>}
  </div>;
}
