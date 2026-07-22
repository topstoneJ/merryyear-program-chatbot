"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type SourceType = "website" | "pdf" | "text";
type Business = { id: string; name: string; shortName: string; code: string };
type KnowledgeSource = {
  id: string;
  businessId: string;
  type: SourceType;
  title: string;
  url: string | null;
  fileName: string | null;
  status: "ready" | "stored" | "error";
  enabled: boolean;
  contentLength: number;
  content?: string;
  createdAt: number;
  updatedAt: number;
};

const TYPE_META: Record<SourceType, { label: string; icon: string; description: string }> = {
  website: { label: "웹사이트", icon: "↗", description: "공고 페이지나 안내 사이트의 내용을 가져옵니다." },
  pdf: { label: "PDF", icon: "PDF", description: "공고문·안내문 PDF를 분석해 데이터로 등록합니다." },
  text: { label: "텍스트", icon: "T", description: "담당자 안내와 자주 바뀌는 내용을 직접 작성합니다." },
};

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 80); pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push(`[${pageNumber}쪽]\n${text}`);
  }
  return pages.join("\n\n").slice(0, 120_000);
}

export default function KnowledgePage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("enterprise");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourceType, setSourceType] = useState<SourceType>("website");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessDialog, setBusinessDialog] = useState<{ mode: "add" | "rename"; name: string } | null>(null);
  const [detail, setDetail] = useState<KnowledgeSource | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const business = businesses.find((item) => item.id === businessId) || businesses[0];
  const filteredSources = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? sources.filter((source) => [source.title, source.url, source.fileName].some((value) => value?.toLowerCase().includes(term))) : sources;
  }, [query, sources]);
  const activeCount = sources.filter((source) => source.enabled).length;
  const readyCount = sources.filter((source) => source.status === "ready").length;

  useEffect(() => {
    fetch("/api/businesses").then(async (response) => {
      const payload = await response.json() as { businesses?: Business[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setBusinesses(payload.businesses || []);
      const requested = new URLSearchParams(window.location.search).get("businessId");
      if (requested && payload.businesses?.some((item) => item.id === requested)) setBusinessId(requested);
      else if (payload.businesses?.length && !payload.businesses.some((item) => item.id === businessId)) setBusinessId(payload.businesses[0].id);
    }).catch(() => setNotice({ tone: "error", text: "사업 목록을 불러오지 못했습니다." }));
  }, []);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/knowledge?businessId=${encodeURIComponent(businessId)}`)
      .then(async (response) => {
        const payload = await response.json() as { sources?: KnowledgeSource[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "목록을 불러오지 못했습니다.");
        if (!cancelled) setSources(payload.sources || []);
      })
      .catch((error) => !cancelled && setNotice({ tone: "error", text: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [businessId]);

  function resetForm() {
    setTitle(""); setUrl(""); setContent(""); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveBusiness(event: FormEvent) {
    event.preventDefault();
    if (!businessDialog?.name.trim()) return;
    const isAdd = businessDialog.mode === "add";
    const response = await fetch("/api/businesses", {
      method: isAdd ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isAdd ? { name: businessDialog.name } : { id: businessId, name: businessDialog.name }),
    });
    const payload = await response.json() as { business?: Business; name?: string; error?: string };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "사업을 저장하지 못했습니다." });
    if (isAdd && payload.business) {
      setBusinesses((previous) => [...previous, payload.business!]);
      setBusinessId(payload.business.id);
    } else {
      setBusinesses((previous) => previous.map((item) => item.id === businessId ? { ...item, name: payload.name!, shortName: payload.name! } : item));
    }
    setBusinessDialog(null);
    setNotice({ tone: "success", text: isAdd ? "새 사업을 추가했습니다." : "사업명을 변경했습니다." });
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setNotice({ tone: "error", text: "데이터 제목을 입력해 주세요." });
    if (sourceType === "website" && !url.trim()) return setNotice({ tone: "error", text: "웹사이트 주소를 입력해 주세요." });
    if (sourceType === "text" && !content.trim()) return setNotice({ tone: "error", text: "데이터 내용을 입력해 주세요." });
    if (sourceType === "pdf" && !file) return setNotice({ tone: "error", text: "PDF 파일을 선택해 주세요." });
    setSaving(true); setNotice(null);
    try {
      const form = new FormData();
      form.set("businessId", businessId); form.set("type", sourceType); form.set("title", title.trim());
      if (sourceType === "website") form.set("url", url.trim());
      if (sourceType === "text") form.set("content", content.trim());
      if (sourceType === "pdf" && file) { form.set("file", file); form.set("extractedText", await extractPdfText(file)); }
      const response = await fetch("/api/knowledge", { method: "POST", body: form });
      const payload = await response.json() as { source?: KnowledgeSource; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error || "데이터를 등록하지 못했습니다.");
      setSources((previous) => [payload.source!, ...previous]); resetForm();
      setNotice({ tone: payload.source.status === "error" ? "error" : "success", text: payload.source.status === "error" ? "주소는 등록했지만 웹사이트 내용을 가져오지 못했습니다." : "새 데이터를 등록했습니다. 다음 질문부터 답변에 사용됩니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "데이터를 등록하지 못했습니다." });
    } finally { setSaving(false); }
  }

  async function openDetail(source: KnowledgeSource) {
    setDetailLoading(true);
    const response = await fetch(`/api/knowledge?id=${encodeURIComponent(source.id)}`);
    const payload = await response.json() as { source?: KnowledgeSource; error?: string };
    setDetailLoading(false);
    if (response.ok && payload.source) setDetail(payload.source);
    else setNotice({ tone: "error", text: payload.error || "데이터를 불러오지 못했습니다." });
  }

  async function saveDetail(event: FormEvent) {
    event.preventDefault(); if (!detail) return;
    const response = await fetch("/api/knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, title: detail.title, content: detail.content }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "데이터를 수정하지 못했습니다." });
    setSources((previous) => previous.map((item) => item.id === detail.id ? { ...item, title: detail.title, contentLength: detail.content?.length || 0, updatedAt: Date.now() } : item));
    setDetail(null); setNotice({ tone: "success", text: "데이터를 수정했습니다." });
  }

  async function toggleSource(source: KnowledgeSource) {
    const enabled = !source.enabled;
    setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, enabled } : item));
    const response = await fetch("/api/knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: source.id, enabled }) });
    if (!response.ok) setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, enabled: source.enabled } : item));
  }

  async function removeSource(source: KnowledgeSource) {
    if (!window.confirm(`‘${source.title}’ 데이터를 삭제할까요?`)) return;
    const response = await fetch(`/api/knowledge?id=${encodeURIComponent(source.id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice({ tone: "error", text: "데이터를 삭제하지 못했습니다." });
    setSources((previous) => previous.filter((item) => item.id !== source.id)); setDetail(null);
    setNotice({ tone: "success", text: "데이터를 삭제했습니다." });
  }

  return (
    <main className="knowledge-shell">
      <header className="topbar knowledge-topbar">
        <a className="brand brand-logo" href="/" aria-label="열매나눔재단 사업 안내 챗봇 홈"><img src="/merryyear-logo.png" alt="열매나눔재단" width={210} height={53} /><b>데이터 관리</b></a>
        <a className="admin-link back-link" href="/">← 챗봇으로 돌아가기</a>
      </header>
      <div className="knowledge-layout">
        <aside className="knowledge-sidebar">
          <div className="sidebar-heading sidebar-heading-actions"><div><span>DATA</span><h2>사업별 데이터</h2></div><button className="business-add-button" type="button" aria-label="신규 사업 추가" onClick={() => setBusinessDialog({ mode: "add", name: "" })}>＋</button></div>
          <p className="sidebar-copy">챗봇이 참고할 자료와 상담 내역을 사업 단위로 관리합니다.</p>
          <nav aria-label="사업 선택">
            {businesses.map((item) => (
              <button className={item.id === businessId ? "active" : ""} type="button" key={item.id} onClick={() => setBusinessId(item.id)}>
                <span className="business-code">{item.code}</span><span><b>{item.shortName}</b><small>{item.id === businessId ? `${sources.length}개 데이터` : "사업 데이터"}</small></span>
                <i className="business-edit" role="button" tabIndex={0} aria-label={`${item.name} 이름 수정`} onClick={(event) => { event.stopPropagation(); setBusinessId(item.id); setBusinessDialog({ mode: "rename", name: item.name }); }}>수정</i>
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><span>✦</span><p><b>사업마다 답변 범위가 달라요</b><br />현재 선택한 사업의 활성 데이터만 챗봇이 참고합니다.</p></div>
          <a className="consultation-link" href={`/consultations?businessId=${encodeURIComponent(businessId)}`}>상담 내역 <span>→</span></a>
        </aside>
        <section className="knowledge-main">
          <div className="knowledge-breadcrumb">데이터 관리 <span>›</span> {business?.shortName}</div>
          <div className="knowledge-title-row">
            <div><span className="folder-kicker">사업 데이터 폴더</span><h1>{business?.name}</h1><button className="title-edit-button" type="button" onClick={() => business && setBusinessDialog({ mode: "rename", name: business.name })}>사업명 수정</button><p>공고문과 보완 안내를 한곳에서 관리하고, 답변에 사용할 자료를 직접 선택하세요.</p></div>
            <div className="knowledge-stats"><div><b>{sources.length}</b><span>전체 데이터</span></div><div><b>{activeCount}</b><span>답변에 사용</span></div><div><b>{readyCount}</b><span>분석 완료</span></div></div>
          </div>
          <section className="knowledge-add" aria-labelledby="add-source-title">
            <div className="add-heading"><div><span className="add-mark">＋</span><h2 id="add-source-title">새 데이터 추가</h2></div><p>웹사이트, PDF, 직접 입력 중 자료에 맞는 방식을 선택하세요.</p></div>
            <div className="source-tabs" role="tablist" aria-label="자료 형식">
              {(Object.keys(TYPE_META) as SourceType[]).map((type) => <button className={sourceType === type ? "active" : ""} type="button" role="tab" aria-selected={sourceType === type} key={type} onClick={() => setSourceType(type)}><span>{TYPE_META[type].icon}</span><b>{TYPE_META[type].label}</b><small>{TYPE_META[type].description}</small></button>)}
            </div>
            <form className="source-form" onSubmit={addSource}>
              <label className="field"><span>데이터 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예) 2026년 사업 신청 안내" maxLength={120} /></label>
              {sourceType === "website" && <label className="field field-wide"><span>웹사이트 주소</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.org/program" /></label>}
              {sourceType === "pdf" && <div className="field field-wide"><span>PDF 파일</span><input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><button className={`file-drop${file ? " selected" : ""}`} type="button" onClick={() => fileRef.current?.click()}><span className="file-symbol">PDF</span><span><b>{file ? file.name : "PDF 파일을 선택하세요"}</b><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB · 텍스트 분석 준비됨` : "최대 20MB · 텍스트가 포함된 PDF 권장"}</small></span><strong>{file ? "변경" : "파일 선택"}</strong></button></div>}
              {sourceType === "text" && <label className="field field-wide"><span>데이터 내용</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="담당자 추가 안내를 입력해 주세요." /></label>}
              <div className="source-form-footer"><p><span>✓</span> 등록한 데이터는 이 사업의 챗봇 답변에만 반영됩니다.</p><button className="knowledge-submit" disabled={saving}>{saving ? "분석하고 있어요…" : "데이터 추가"}</button></div>
            </form>
          </section>
          {notice && <div className={`knowledge-notice ${notice.tone}`} role="status"><span>{notice.tone === "success" ? "✓" : "!"}</span>{notice.text}<button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}>×</button></div>}
          <section className="knowledge-list" aria-labelledby="knowledge-list-title">
            <div className="list-toolbar"><div><h2 id="knowledge-list-title">등록된 데이터</h2><span>{sources.length}개</span></div><label className="knowledge-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목 또는 주소 검색" /></label></div>
            <div className="knowledge-table-head"><span>자료</span><span>상태</span><span>답변 사용</span><span>관리</span></div>
            <div className="knowledge-rows">
              {loading || detailLoading ? <div className="knowledge-empty"><span className="loading-ring" /><b>데이터를 불러오고 있어요</b></div> : filteredSources.length ? filteredSources.map((source) => (
                <article className={`knowledge-row clickable${source.enabled ? "" : " muted"}`} key={source.id} tabIndex={0} onClick={() => openDetail(source)} onKeyDown={(event) => event.key === "Enter" && openDetail(source)}>
                  <div className="source-identity"><span className={`source-type-icon ${source.type}`}>{TYPE_META[source.type].icon}</span><div><b>{source.title}</b><p>{source.type === "website" ? source.url : source.type === "pdf" ? source.fileName : `${source.contentLength.toLocaleString("ko-KR")}자 직접 입력`}</p><small>{TYPE_META[source.type].label} · {new Date(source.updatedAt).toLocaleDateString("ko-KR")}</small></div></div>
                  <div><span className={`status-pill ${source.status}`}>{source.status === "ready" ? "✓ 분석 완료" : source.status === "stored" ? "업로드 완료" : "확인 필요"}</span></div>
                  <div><button className={`knowledge-switch${source.enabled ? " on" : ""}`} type="button" role="switch" aria-checked={source.enabled} onClick={(event) => { event.stopPropagation(); toggleSource(source); }}><span /></button></div>
                  <div><button className="row-detail" type="button">보기</button></div>
                </article>
              )) : <div className="knowledge-empty"><span>▤</span><b>{query ? "검색 결과가 없습니다" : "아직 등록된 데이터가 없습니다"}</b><p>{query ? "다른 검색어를 입력해 보세요." : "위에서 웹사이트, PDF 또는 텍스트를 추가해 주세요."}</p></div>}
            </div>
          </section>
        </section>
      </div>

      {businessDialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setBusinessDialog(null)}><form className="modal compact-modal" onSubmit={saveBusiness}><button className="modal-close" type="button" onClick={() => setBusinessDialog(null)}>×</button><span className="modal-kicker">사업별 데이터</span><h2>{businessDialog.mode === "add" ? "신규 사업 추가" : "사업명 수정"}</h2><label className="field"><span>사업명</span><input autoFocus value={businessDialog.name} onChange={(event) => setBusinessDialog({ ...businessDialog, name: event.target.value })} maxLength={120} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setBusinessDialog(null)}>취소</button><button className="knowledge-submit">저장</button></div></form></div>}
      {detail && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}><form className="modal detail-modal" onSubmit={saveDetail}><button className="modal-close" type="button" onClick={() => setDetail(null)}>×</button><span className="modal-kicker">{TYPE_META[detail.type].label} 데이터</span><h2>등록 데이터 확인 및 수정</h2><label className="field"><span>제목</span><input value={detail.title} onChange={(event) => setDetail({ ...detail, title: event.target.value })} /></label><label className="field"><span>내용</span><textarea className="detail-content" value={detail.content || ""} onChange={(event) => setDetail({ ...detail, content: event.target.value })} /></label><div className="modal-actions split"><button type="button" className="danger-button" onClick={() => removeSource(detail)}>삭제</button><span /><button type="button" className="cancel-button" onClick={() => setDetail(null)}>취소</button><button className="knowledge-submit">수정 저장</button></div></form></div>}
    </main>
  );
}
