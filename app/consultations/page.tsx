"use client";

import { brandTheme } from "@/app/branding";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import AnswerSupplement from "./answer-supplement";
import AdminNav from "@/app/admin-nav";
import BrandLink from "@/app/brand-link";
import AdminPagination, { PAGE_SIZE_OPTIONS } from "@/app/admin-pagination";
import CategoryManager, { type Category } from "./category-manager";

type Business = { id: string; name: string; shortName: string };
type Consultation = {
  id: string;
  sessionId: string;
  turnIndex: number;
  question: string;
  answer: string;
  summary: string;
  decision: string;
  category: string;
  categoryId: string;
  source: string;
  confidence: number;
  review: boolean;
  createdAt: number;
};
type Summary = { reviewTotal?: number; offHoursTotal?: number; total: number; byDecision: Record<string, number>; byCategory: Array<{ category: string; count: number }> };

const DECISION_LABELS: Record<string, string> = {
  possible: "가능", impossible: "불가능", consult: "담당자 문의", need_info: "정보 필요", fact: "기본 안내", out_of_scope: "답변 범위 외",
};

function dateInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function shiftYear(value: string, years: number) { const date = new Date(`${value}T00:00:00`); date.setFullYear(date.getFullYear() + years); return dateInput(date); }

export default function ConsultationsPage() {
  const now = new Date();
  const today = dateInput(now);
  const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [from, setFrom] = useState(dateInput(monthAgo));
  const [to, setTo] = useState(dateInput(now));
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, byDecision: {}, byCategory: [] });
  const [categories, setCategories] = useState<Category[]>([]);
  const [manageCategories, setManageCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<"denied" | "scope" | "confirm" | null>(null);
  const [bulkDeleteScope, setBulkDeleteScope] = useState<"page" | "all">("page");
  const [exportDialog, setExportDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Consultation | null>(null);
  const [reviewFilter, setReviewFilter] = useState(false);
  const [decisionFilter, setDecisionFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [consultationPage, setConsultationPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [brandColor, setBrandColor] = useState("#f26a2e");

  const business = useMemo(() => businesses.find((item) => item.id === businessId), [businesses, businessId]);
  const savedMinutes = summary.total * 3;
  const reviewCount = useMemo(() => summary.reviewTotal ?? consultations.reduce((count, item) => count + Number(item.review), 0), [summary.reviewTotal, consultations]);
  const filteredConsultations = useMemo(() => consultations.filter((item) => (!decisionFilter || item.decision === decisionFilter) && (!categoryFilter || item.category === categoryFilter) && (!reviewFilter || item.review)), [consultations, decisionFilter, categoryFilter, reviewFilter]);
  const consultationTotalPages = Math.max(1, Math.ceil(filteredConsultations.length / pageSize));
  const pagedConsultations = useMemo(() => filteredConsultations.slice((consultationPage - 1) * pageSize, consultationPage * pageSize), [filteredConsultations, consultationPage, pageSize]);
  const sessionConsultations = selected?.sessionId ? consultations
    .filter(item => item.sessionId === selected.sessionId)
    .sort((a, b) => a.turnIndex - b.turnIndex || a.createdAt - b.createdAt) : [];
  const selectedSessionIndex = selected ? sessionConsultations.findIndex(item => item.id === selected.id) : -1;
  const previousConsultation = selectedSessionIndex > 0 ? sessionConsultations[selectedSessionIndex - 1] : null;
  const nextConsultation = selectedSessionIndex >= 0 && selectedSessionIndex < sessionConsultations.length - 1 ? sessionConsultations[selectedSessionIndex + 1] : null;

  function openConsultation(item: Consultation) {
    setDeleteError(""); setCategoryMessage(""); setReviewMessage(""); setEditingCategory(item.categoryId); setSelected(item);
  }

  useEffect(() => { setConsultationPage(1); }, [businessId, from, to, decisionFilter, categoryFilter, reviewFilter, pageSize]);
  useEffect(() => { if (consultationPage > consultationTotalPages) setConsultationPage(consultationTotalPages); }, [consultationPage, consultationTotalPages]);

  useEffect(() => {
    fetch("/api/settings").then(response => response.json()).then(payload => payload.settings?.primaryColor && setBrandColor(payload.settings.primaryColor));
    fetch("/api/businesses?includeHidden=1").then((response) => response.json()).then((payload: { businesses?: Business[] }) => {
      const list = payload.businesses || [];
      setBusinesses(list);
      const requested = new URLSearchParams(window.location.search).get("businessId");
      setBusinessId(list.some((item) => item.id === requested) ? requested! : "");
    });
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    let cancelled = false;
    const fromMs = new Date(`${from}T00:00:00`).getTime();
    const toMs = new Date(`${to}T23:59:59.999`).getTime();
    const controller = new AbortController();
    fetch(`/api/consultations?businessId=${encodeURIComponent(businessId)}&from=${fromMs}&to=${toMs}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { consultations?: Consultation[]; summary?: Summary; canDelete?: boolean; categories?: Category[] }) => {
        if (cancelled) return;
        setCanDelete(Boolean(payload.canDelete));
        setCategories(payload.categories || []);
        setConsultations(payload.consultations || []); setSummary(payload.summary || { total: 0, byDecision: {}, byCategory: [] });
      })
      .catch(() => { if (!cancelled) setDeleteError("상담내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [businessId, from, to, refreshKey]);

  async function saveReview(review: boolean) {
    if (!selected || savingReview) return;
    const item = selected;
    setSavingReview(true); setReviewMessage("");
    try {
      const response = await fetch("/api/consultations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, review }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "확인 필요 상태를 저장하지 못했습니다.");
      setSelected(current => current?.id === item.id ? { ...current, review } : current);
      setConsultations(current => current.map(row => row.id === item.id ? { ...row, review } : row));
      setSummary(current => ({ ...current, reviewTotal: Math.max(0, (current.reviewTotal || 0) + Number(review) - Number(item.review)) }));
      setReviewMessage(review ? "확인 필요로 저장했습니다." : "확인 필요를 해제했습니다.");
    } catch (error) { setReviewMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSavingReview(false); }
  }

  async function saveCategory() {
    if (!selected || !editingCategory || savingCategory) return;
    setSavingCategory(true); setCategoryMessage("");
    try {
      const response = await fetch("/api/consultations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, categoryId: editingCategory }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "질문 유형을 저장하지 못했습니다.");
      setSelected({ ...selected, categoryId: editingCategory, category: categories.find(item => item.id === editingCategory)!.name });
      setCategoryMessage("질문 유형을 저장했습니다."); setCategoryFilter(""); setRefreshKey(key => key + 1);
    } catch (error) { setCategoryMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSavingCategory(false); }
  }

  async function deleteConsultation() {
    if (!selected || !canDelete || deleting) return;
    if (!window.confirm("이 상담내역을 삭제할까요? 삭제한 내역은 복구할 수 없습니다.")) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/consultations?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "상담내역을 삭제하지 못했습니다.");
      setSelected(null);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "상담내역을 삭제하지 못했습니다.");
    } finally { setDeleting(false); }
  }

  function openBulkDelete() {
    setDeleteError("");
    setBulkDeleteDialog(canDelete ? "scope" : "denied");
  }

  async function deleteSelectedConsultations() {
    const target = bulkDeleteScope === "page" ? pagedConsultations : filteredConsultations;
    if (!canDelete || deleting || !target.length) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/consultations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: target.map((item) => item.id) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "상담내역을 삭제하지 못했습니다.");
      setSelected(null);
      setBulkDeleteDialog(null);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "상담내역을 삭제하지 못했습니다.");
    } finally { setDeleting(false); }
  }

  function downloadCsv(scope: "page" | "all") {
    const escape = (value: unknown) => { const text = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`; };
    const target = scope === "page" ? pagedConsultations : filteredConsultations;
    const rows = [["상담 질문", "요약", "유형", "답변 결과", "확인 필요", "전체 답변", "근거", "일시"], ...target.map(item => [item.question, item.summary, item.category, DECISION_LABELS[item.decision] || "기본 안내", item.review ? "확인 필요" : "", item.answer, item.source, new Date(item.createdAt).toLocaleString("ko-KR")])];
    const blob = new Blob(["\uFEFF", rows.map(row => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `상담내역_${from}_${to}_${scope === "page" ? `${consultationPage}페이지` : "전체"}.csv`; link.click(); URL.revokeObjectURL(url); setExportDialog(false);
  }

  return (
    <main className="consultation-shell" style={brandTheme(brandColor) as CSSProperties}>
      <header className="topbar knowledge-topbar"><BrandLink /><AdminNav current="consultations" /></header>
      <div className="consultation-page">
        <section className="consultation-heading">
          <div><h1>상담내역</h1></div>
          <section className="consultation-controls"><label className="business-filter"><select aria-label="사업 선택" value={businessId} onChange={(event) => setBusinessId(event.target.value)}><option value="">사업 전체</option>{businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="period-panel"><label><input aria-label="시작일" type="date" min={shiftYear(to, -1)} max={to} value={from} onChange={(event) => setFrom(event.target.value)} /></label><i>–</i><label><input aria-label="종료일" type="date" min={from} max={[today, shiftYear(from, 1)].sort()[0]} value={to} onChange={(event) => setTo(event.target.value)} /></label></div></section>
        </section>
        <section className="consultation-stats">
          <article><span>챗봇으로 절감한 시간</span><b>{Math.floor(savedMinutes / 60).toLocaleString("ko-KR")}시간 {savedMinutes % 60}분</b><small>전화상담 건당 평균 3분 기준</small></article>
          <article><span>상담 건수</span><b>{summary.total.toLocaleString("ko-KR")}건</b></article>
          <article><span>근무 외 시간 상담건수</span><b>{(summary.offHoursTotal || 0).toLocaleString("ko-KR")}건</b></article>
          <button type="button" className={`review-filter-card${reviewFilter ? " active" : ""}`} aria-pressed={reviewFilter} onClick={() => setReviewFilter(current => !current)}><span>확인 필요</span><b>{reviewCount.toLocaleString("ko-KR")}건</b></button>
        </section>
        <section className="consultation-summary-panel">
          <div className="summary-block"><h2>답변 결과 요약</h2><div className="decision-bars">{Object.entries(DECISION_LABELS).sort(([a], [b]) => (summary.byDecision[b] || 0) - (summary.byDecision[a] || 0)).map(([key, label]) => <button type="button" className={decisionFilter === key ? "active" : ""} aria-pressed={decisionFilter === key} key={key} onClick={() => setDecisionFilter(current => current === key ? "" : key)}><span>{label}</span><span className="bar"><i style={{ width: `${summary.total ? Math.max(4, ((summary.byDecision[key] || 0) / summary.total) * 100) : 0}%` }} /></span><b>{summary.byDecision[key] || 0}</b></button>)}</div></div>
          <div className="summary-block"><div className="category-heading"><h2>질문 유형</h2><button type="button" className="category-plus" aria-label="질문 유형 추가 및 관리" onClick={() => setManageCategories(true)} disabled={loading}><svg viewBox="0 0 16 16" aria-hidden="true" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></div><div className="category-chips">{categories.length ? [...categories].sort((a, b) => (summary.byCategory.find(item => item.category === b.name)?.count || 0) - (summary.byCategory.find(item => item.category === a.name)?.count || 0)).map((type) => ({ category: type.name, count: summary.byCategory.find(item => item.category === type.name)?.count || 0 })).map((item) => <button type="button" className={categoryFilter === item.category ? "active" : ""} aria-pressed={categoryFilter === item.category} key={item.category} onClick={() => setCategoryFilter(current => current === item.category ? "" : item.category)}>{item.category}<b>{item.count}</b></button>) : <p>선택 기간의 상담 내역이 없습니다.</p>}</div></div>
        </section>
        <section className="consultation-list">
          <div className="list-toolbar"><div><h2>상담내역 상세</h2></div><div className="consultation-list-actions"><label className="page-size-select"><span className="sr-only">페이지당 표시 개수</span><select aria-label="페이지당 표시 개수" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map(size => <option value={size} key={size}>{size}개씩 보기</option>)}</select></label><button className="drive-folder-link" type="button" disabled={loading || !filteredConsultations.length} onClick={() => setExportDialog(true)}>Excel</button><button className="consultation-delete-button" type="button" aria-label="상담내역 삭제" title="상담내역 삭제" disabled={loading || (canDelete && !filteredConsultations.length)} onClick={openBulkDelete}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button></div></div>
          <div className="consultation-table-head"><span>상담 질문</span><span>유형</span><span>답변 결과</span><span>확인 필요</span><span>일시</span></div>
          <div className="consultation-rows">
            {loading ? <div className="knowledge-empty"><span className="loading-ring" /><b>상담 내역을 불러오고 있어요</b></div> : filteredConsultations.length ? pagedConsultations.map((item) => <button key={item.id} type="button" className="consultation-row" onClick={() => openConsultation(item)}><span><b>{item.question}</b><small>{item.summary}</small></span><i>{item.category}</i><strong className={`decision ${item.decision}`}>{DECISION_LABELS[item.decision] || "기본 안내"}</strong><em className={`consultation-review-status${item.review ? " required" : ""}`}>{item.review ? "확인 필요" : "—"}</em><time>{new Date(item.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></button>) : <div className="knowledge-empty"><span>◷</span><b>{decisionFilter || categoryFilter || reviewFilter ? "선택한 조건의 상담 내역이 없습니다" : "선택 기간의 상담 내역이 없습니다"}</b><p>{decisionFilter || categoryFilter || reviewFilter ? "선택한 필터를 해제하거나 다른 조건을 선택해 보세요." : "챗봇에서 질문이 들어오면 이곳에 자동으로 기록됩니다."}</p></div>}
          </div>
          {!loading && <AdminPagination currentPage={consultationPage} totalPages={consultationTotalPages} onChange={setConsultationPage} />}
        </section>
      </div>
      {selected && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="modal consultation-modal"><button className="modal-close" type="button" onClick={() => setSelected(null)}>×</button><span className="modal-kicker">{new Date(selected.createdAt).toLocaleString("ko-KR")} · {selected.category}</span><h2>상담 세부내역</h2><div className="consultation-detail"><label>질문</label><p>{selected.question}</p><label>전체 답변</label><p>{selected.answer}</p><label>근거</label><p>{selected.source}</p></div><div className="consultation-category-edit"><label htmlFor="consultation-category">질문 유형</label><div><select id="consultation-category" value={editingCategory} disabled={savingReview || savingCategory || deleting} onChange={event => { setEditingCategory(event.target.value); setCategoryMessage(""); }}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={savingReview || savingCategory || deleting || editingCategory === selected.categoryId} onClick={saveCategory}>{savingCategory ? "저장 중…" : "변경 저장"}</button></div><small>직접 변경한 유형은 이후에도 유지됩니다.</small>{categoryMessage && <p role="status">{categoryMessage}</p>}</div><div className="consultation-review-edit"><label><input type="checkbox" checked={selected.review} disabled={savingReview || savingCategory || deleting} onChange={event => saveReview(event.target.checked)} />확인 필요</label><small>검토를 마쳤다면 체크를 해제해 주세요. 변경 즉시 저장됩니다.</small>{(savingReview || reviewMessage) && <p role="status">{savingReview ? "저장 중…" : reviewMessage}</p>}</div><AnswerSupplement key={selected.id} consultationId={selected.id} />{deleteError && <p role="alert" className="conflict-warning">{deleteError}</p>}<div className="modal-actions consultation-detail-actions"><div className="consultation-session-nav"><button className="cancel-button" type="button" disabled={!previousConsultation || deleting || savingCategory || savingReview} onClick={() => previousConsultation && openConsultation(previousConsultation)}>이전</button><button className="cancel-button" type="button" disabled={!nextConsultation || deleting || savingCategory || savingReview} onClick={() => nextConsultation && openConsultation(nextConsultation)}>다음</button></div><div>{canDelete && <button className="danger-button" type="button" disabled={deleting || savingCategory || savingReview} onClick={deleteConsultation}>{deleting ? "삭제 중…" : "삭제"}</button>}<button className="knowledge-submit" type="button" disabled={deleting || savingCategory || savingReview} onClick={() => setSelected(null)}>확인</button></div></div></section></div>}
      {exportDialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setExportDialog(false)}><section className="modal compact-modal export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title"><button className="modal-close" type="button" onClick={() => setExportDialog(false)}>×</button><h2 id="export-dialog-title">Excel 다운로드</h2><p>다운로드할 상담내역의 범위를 선택해 주세요.</p><div className="export-scope-options"><button type="button" onClick={() => downloadCsv("page")}><b>현재 화면</b><span>{pagedConsultations.length.toLocaleString("ko-KR")}건 · {consultationPage}페이지</span></button><button type="button" onClick={() => downloadCsv("all")}><b>최근 1,000건</b><span>현재 검색·필터 결과 {filteredConsultations.length.toLocaleString("ko-KR")}건</span></button></div></section></div>}
      {bulkDeleteDialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setBulkDeleteDialog(null)}><section className="modal compact-modal consultation-bulk-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="consultation-delete-title"><button className="modal-close" type="button" disabled={deleting} onClick={() => setBulkDeleteDialog(null)}>×</button><h2 id="consultation-delete-title">상담내역 삭제</h2>{bulkDeleteDialog === "denied" ? <><p>상담내역 삭제 권한이 없습니다.</p><div className="modal-actions"><button className="knowledge-submit" type="button" onClick={() => setBulkDeleteDialog(null)}>확인</button></div></> : bulkDeleteDialog === "scope" ? <><p>삭제할 상담내역의 범위를 선택해 주세요.</p><div className="export-scope-options"><button type="button" onClick={() => { setBulkDeleteScope("page"); setBulkDeleteDialog("confirm"); }}><b>현재 화면</b><span>{pagedConsultations.length.toLocaleString("ko-KR")}건 · {consultationPage}페이지</span></button><button type="button" onClick={() => { setBulkDeleteScope("all"); setBulkDeleteDialog("confirm"); }}><b>최근 1,000건</b><span>현재 검색·필터 결과 {filteredConsultations.length.toLocaleString("ko-KR")}건</span></button></div></> : <><p><b>{bulkDeleteScope === "page" ? "현재 화면" : "최근 1,000건"}</b>의 상담내역 <b>{(bulkDeleteScope === "page" ? pagedConsultations.length : filteredConsultations.length).toLocaleString("ko-KR")}건</b>이 삭제됩니다.</p><p>삭제한 내역은 복구할 수 없습니다. 계속할까요?</p>{deleteError && <p role="alert" className="conflict-warning">{deleteError}</p>}<div className="modal-actions"><button className="cancel-button" type="button" disabled={deleting} onClick={() => setBulkDeleteDialog("scope")}>이전</button><button className="danger-button" type="button" disabled={deleting || !(bulkDeleteScope === "page" ? pagedConsultations.length : filteredConsultations.length)} onClick={deleteSelectedConsultations}>{deleting ? "삭제 중…" : "삭제"}</button></div></>}<small className="consultation-retention-help">모든 상담내역은 개인정보보호를 위해 1년 경과시 자동 삭제돼요</small></section></div>}
      {manageCategories && <CategoryManager categories={categories} onClose={() => setManageCategories(false)} onChange={items => { setCategories(items); setCategoryFilter(""); setRefreshKey(key => key + 1); }} />}
    </main>
  );
}
