"use client";

import { useEffect, useMemo, useState } from "react";

type Business = { id: string; name: string; shortName: string };
type Consultation = {
  id: string;
  question: string;
  answer: string;
  summary: string;
  decision: string;
  category: string;
  source: string;
  confidence: number;
  review: boolean;
  createdAt: number;
};
type Summary = { total: number; byDecision: Record<string, number>; byCategory: Array<{ category: string; count: number }> };

const DECISION_LABELS: Record<string, string> = {
  possible: "가능", impossible: "불가능", consult: "담당자 문의", need_info: "추가 정보", fact: "정보 안내",
};

function dateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function ConsultationsPage() {
  const now = new Date();
  const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [from, setFrom] = useState(dateInput(monthAgo));
  const [to, setTo] = useState(dateInput(now));
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, byDecision: {}, byCategory: [] });
  const [selected, setSelected] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);

  const business = businesses.find((item) => item.id === businessId);
  const topCategory = summary.byCategory[0];
  const reviewCount = consultations.filter((item) => item.review).length;
  const rangeLabel = useMemo(() => `${from.replaceAll("-", ".")} – ${to.replaceAll("-", ".")}`, [from, to]);

  useEffect(() => {
    fetch("/api/businesses").then((response) => response.json()).then((payload: { businesses?: Business[] }) => {
      const list = payload.businesses || [];
      setBusinesses(list);
      const requested = new URLSearchParams(window.location.search).get("businessId");
      setBusinessId(list.some((item) => item.id === requested) ? requested! : list[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    if (!businessId || !from || !to) return;
    setLoading(true);
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T23:59:59.999`).getTime();
    fetch(`/api/consultations?businessId=${encodeURIComponent(businessId)}&from=${fromMs}&to=${toMs}`)
      .then((response) => response.json())
      .then((payload: { consultations?: Consultation[]; summary?: Summary }) => {
        setConsultations(payload.consultations || []); setSummary(payload.summary || { total: 0, byDecision: {}, byCategory: [] });
      })
      .finally(() => setLoading(false));
  }, [businessId, from, to]);

  return (
    <main className="consultation-shell">
      <header className="topbar knowledge-topbar"><a className="brand brand-logo" href="/"><img src="/merryyear-logo.png" alt="열매나눔재단" width={210} height={53} /><b>데이터 관리</b></a><a className="admin-link back-link" href="/knowledge">← 사업별 데이터</a></header>
      <div className="consultation-page">
        <div className="knowledge-breadcrumb">데이터 관리 <span>›</span> 상담 내역</div>
        <section className="consultation-heading">
          <div><span className="folder-kicker">CONSULTATION HISTORY</span><h1>상담 내역 요약</h1><p>{business?.name || "사업"}의 질문 흐름과 답변 결과를 확인합니다.</p></div>
          <label className="business-filter"><span>사업 선택</span><select value={businessId} onChange={(event) => setBusinessId(event.target.value)}>{businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </section>
        <section className="period-panel"><div><b>조회 기간</b><span>기본값은 최근 1개월입니다.</span></div><label><span>시작일</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><i>–</i><label><span>종료일</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><strong>{rangeLabel}</strong></section>
        <section className="consultation-stats">
          <article className="primary"><span>상담 건수</span><b>{summary.total.toLocaleString("ko-KR")}</b><small>선택 기간 전체</small></article>
          <article><span>가장 많은 유형</span><b>{topCategory?.category || "—"}</b><small>{topCategory ? `${topCategory.count}건` : "상담 내역 없음"}</small></article>
          <article><span>확인 필요</span><b>{reviewCount}</b><small>담당자 검토 권장</small></article>
        </section>
        <section className="consultation-summary-panel">
          <div className="summary-block"><h2>답변 결과 요약</h2><div className="decision-bars">{Object.entries(DECISION_LABELS).map(([key, label]) => <div key={key}><span>{label}</span><div><i style={{ width: `${summary.total ? Math.max(4, ((summary.byDecision[key] || 0) / summary.total) * 100) : 0}%` }} /></div><b>{summary.byDecision[key] || 0}</b></div>)}</div></div>
          <div className="summary-block"><h2>질문 유형</h2><div className="category-chips">{summary.byCategory.length ? summary.byCategory.map((item) => <span key={item.category}>{item.category}<b>{item.count}</b></span>) : <p>선택 기간의 상담 내역이 없습니다.</p>}</div></div>
        </section>
        <section className="consultation-list">
          <div className="list-toolbar"><div><h2>상담 내역과 요약</h2><span>{consultations.length}건</span></div><a className="drive-folder-link" href="https://drive.google.com/drive/folders/1T49an3h4MOJdboN5wBdAWzKtIdXh6wfI" target="_blank" rel="noreferrer">Drive 백업 폴더 ↗</a></div>
          <div className="consultation-table-head"><span>상담 질문</span><span>유형</span><span>답변 결과</span><span>일시</span></div>
          <div className="consultation-rows">
            {loading ? <div className="knowledge-empty"><span className="loading-ring" /><b>상담 내역을 불러오고 있어요</b></div> : consultations.length ? consultations.map((item) => <button key={item.id} type="button" className="consultation-row" onClick={() => setSelected(item)}><span><b>{item.question}</b><small>{item.summary}</small></span><i>{item.category}</i><strong className={`decision ${item.decision}`}>{DECISION_LABELS[item.decision] || "정보 안내"}</strong><time>{new Date(item.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></button>) : <div className="knowledge-empty"><span>◷</span><b>선택 기간의 상담 내역이 없습니다</b><p>챗봇에서 질문이 들어오면 이곳에 자동으로 기록됩니다.</p></div>}
          </div>
        </section>
      </div>
      {selected && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="modal consultation-modal"><button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button><span className="modal-kicker">{new Date(selected.createdAt).toLocaleString("ko-KR")} · {selected.category}</span><h2>상담 요약</h2><div className="consultation-detail"><label>질문</label><p>{selected.question}</p><label>요약</label><p className="highlight">{selected.summary}</p><label>전체 답변</label><p>{selected.answer}</p><label>근거</label><p>{selected.source} · 신뢰도 {selected.confidence}%</p></div><div className="modal-actions"><button className="knowledge-submit" type="button" onClick={() => setSelected(null)}>확인</button></div></section></div>}
    </main>
  );
}
