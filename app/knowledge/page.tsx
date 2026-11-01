"use client";
import FaqPanel from './faq-panel';

import { brandTheme } from "@/app/branding";
import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AdminNav from "@/app/admin-nav";
import BrandLink from "@/app/brand-link";
import AdminPagination, { PAGE_SIZE_OPTIONS } from "@/app/admin-pagination";
import ConflictPanel from "./conflict-panel";
import { useConflictReport } from "./use-conflict-report";
import { filterSources, sourceKind } from "./source-filter";
import { SOURCE_LIMITS, sourceLimitMessage } from "./source-limits";
import { MAX_ANALYSIS_INPUT_LENGTH } from "./knowledge-integrity";

type SourceType = "website" | "pdf" | "text";
type AddMode = SourceType | "random";
type Business = { id: string; name: string; shortName: string; code: string; sortOrder: number; isPublic: boolean; noticeUrl: string; contactDepartment: string; contactEmail: string; contactPhone: string; contactHours: string };
type BusinessDialog = { mode: "add" | "rename"; name: string; noticeUrl: string; contactDepartment: string; contactEmail: string; contactPhone: string; contactHours: string };
type RandomQuestion = { id: string; question: string; options: string[] };
type KnowledgeSection = {
  id: string;
  title: string;
  semanticTag: string;
  content: string;
  pages: number[];
  origin: "extracted" | "ai_analyzed" | "review_required" | "edited";
};
type KnowledgeSource = {
  id: string;
  businessId: string;
  type: SourceType;
  isRandom?: boolean;
  isMain?: boolean;
  originalType?: SourceType;
  title: string;
  url: string | null;
  fileName: string | null;
  status: "ready" | "stored" | "error";
  enabled: boolean;
  sharedAllBusinesses: boolean;
  contentLength: number;
  content?: string;
  createdAt: number;
  updatedAt: number;
};

const DATA_VOLUME_RULES = [
  { tone: "green", label: "자료량 적정", range: "5만 자 이하" },
  { tone: "orange", label: "자료량 점검 권장", range: "5만 자 초과~10만 자" },
  { tone: "red", label: "자료량 축소 필요", range: "10만 자 초과" },
] as const;

function dataVolumeStatus(characters: number) {
  if (characters <= 50_000) return DATA_VOLUME_RULES[0];
  if (characters <= 100_000) return DATA_VOLUME_RULES[1];
  return DATA_VOLUME_RULES[2];
}

const TYPE_META: Record<AddMode, { label: string; icon: string; description: string }> = {
  pdf: { label: "PDF", icon: "PDF", description: "공고문·안내문 PDF를 분석해 데이터로 등록합니다." },
  website: { label: "웹사이트", icon: "W", description: "공고 페이지나 안내 사이트의 내용을 가져옵니다." },
  text: { label: "텍스트", icon: "T", description: "담당자 안내와 자주 바뀌는 내용을 직접 작성합니다." },
  random: { label: "텍스트(랜덤)", icon: "?", description: "놓치기 쉬운 운영 기준을 질문으로 발견합니다." },
};

async function extractPdfText(file: File) {
  const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs-6.4.299/pdf.worker.min.mjs";
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
  const document = await loadingTask.promise;
  if (document.numPages > 80) throw new Error("PDF는 80쪽 이하만 등록할 수 있습니다. 자료를 나누어 등록해 주세요.");
  const pages: string[] = [];
  let extractedLength = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      extractedLength += text.length;
      if (extractedLength > MAX_ANALYSIS_INPUT_LENGTH) throw new Error(`PDF에서 추출한 내용이 너무 깁니다. ${MAX_ANALYSIS_INPUT_LENGTH.toLocaleString("ko-KR")}자 이하로 나누어 등록해 주세요.`);
      pages.push(`[${pageNumber}쪽]\n${text}`);
    }
  }
  return pages.join("\n\n");
  } finally { await loadingTask.destroy(); }
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

const SECTION_RULES = [
  { title: "제출 서류", semanticTag: "documents", pattern: /제출 서류|구비 서류|증빙|영수증|계산서|세금계산서|견적서|계약서|거래명세|입금증|통장 사본|사진|사후 지출|지출 내역|서류 제출|첨부 서류/ },
  { title: "지원·제공 내용", semanticTag: "benefit", pattern: /지원(?!자|대상)|지원금|금액|비용|제공|혜택|물품/ },
  { title: "대상·참여 조건", semanticTag: "eligibility", pattern: /지원 대상|참여 대상|신청 자격|자격|대상자|선정 기준|소득 기준/ },
  { title: "일정·기간", semanticTag: "schedule", pattern: /일정|기간|접수일|신청일|교육일|운영일|마감|회차/ },
  { title: "출결·수료 기준", semanticTag: "attendance", pattern: /출결|출석|결석|지각|수료|이수/ },
  { title: "신청·참여 방법", semanticTag: "procedure", pattern: /신청 방법|참여 방법|접수 방법|신청서|접수처|온라인 신청/ },
  { title: "장소·교통", semanticTag: "location", pattern: /장소|주소|오시는 길|교통|주차|교육장/ },
  { title: "준비물·활동 규칙", semanticTag: "guidelines", pattern: /준비물|활동 규칙|유의 사항|주의 사항|준수|금지/ },
  { title: "변경·취소", semanticTag: "changes", pattern: /변경|취소|환불|불참|연기/ },
  { title: "문의처", semanticTag: "contact", pattern: /문의|담당자|연락처|전화|이메일|상담/ },
];

const NOTICE_SECTIONS = [
  { title: "사업개요", semanticTag: "overview" },
  { title: "지원조건", semanticTag: "conditions" },
  { title: "신청대상", semanticTag: "eligibility" },
  { title: "모집일정", semanticTag: "schedule" },
  { title: "심사방법", semanticTag: "screening" },
  { title: "제출서류", semanticTag: "documents" },
  { title: "문의처", semanticTag: "contact" },
  { title: "기타", semanticTag: "other" },
] as const;

function isNoticeDocument(identity: string) {
  return /공고|모집|지원사업|신청 안내|모집요강|공모/.test(identity);
}

function classifyNoticeSegment(segment: string) {
  if (/제출|서류|증빙|영수증|계산서|세금계산서|견적서|계약서|거래명세|입금증|통장 사본|사진|사후 지출|지출 내역|첨부/.test(segment)) return "documents";
  if (/문의|담당자|연락처|전화|이메일|상담/.test(segment)) return "contact";
  if (/심사|심의|평가|선정 절차|선정 방법|발표|면접/.test(segment)) return "screening";
  if (/모집 기간|신청 기간|접수 기간|접수일|신청일|마감|일정|선정일/.test(segment)) return "schedule";
  if (/신청 대상|지원 대상|참여 대상|대상자|신청자|가구|기관|단체|개인/.test(segment)) return "eligibility";
  if (/지원 조건|신청 자격|자격 요건|소득 기준|거주 기준|필수 조건|제외 대상|중복 지원|지원 한도|지원금|금액/.test(segment)) return "conditions";
  if (/사업 목적|사업 개요|사업명|추진 배경|지원 내용|사업 내용|모집 목적/.test(segment)) return "overview";
  return "other";
}

function parseStructuredSections(content: string): KnowledgeSection[] | null {
  try {
    const stored = JSON.parse(content) as { format?: string; sections?: Array<{ key?: string; title?: string; markdown?: string; pages?: number[]; status?: string }> };
    if (stored.format === "structured-markdown" && Array.isArray(stored.sections)) {
      return stored.sections.map((section) => ({
        id: crypto.randomUUID(), title: section.title || "안내", semanticTag: section.key || "custom",
        content: section.markdown || "", pages: section.pages || [],
        origin: section.status === "review_required" ? "review_required" : "ai_analyzed",
      }));
    }
  } catch { /* 기존 자료 형식 처리 */ }
  const blocks = content.split(/\n(?=\[지식 항목\|)/).filter(Boolean);
  if (!blocks.length || !blocks[0].startsWith("[지식 항목|")) return null;
  return blocks.flatMap((block) => {
    const match = block.match(/^\[지식 항목\|([^|]+)\|([^|]+)\|([^|]*)\|([^\]]+)\]\n?([\s\S]*)$/);
    if (!match) return [];
    return [{
      id: crypto.randomUUID(), title: match[1], semanticTag: match[2],
      pages: match[3].split(",").map(Number).filter(Boolean),
      origin: match[4] === "edited" ? "edited" : "extracted", content: match[5].trim(),
    } satisfies KnowledgeSection];
  });
}

function derivePdfSections(content: string, identity = ""): KnowledgeSection[] {
  const parsed = parseStructuredSections(content);
  const notice = isNoticeDocument(identity);
  const alreadyUsesNoticeTemplate = parsed?.length === NOTICE_SECTIONS.length
    && NOTICE_SECTIONS.every((template, index) => parsed[index]?.title === template.title);
  if (parsed?.length && (!notice || alreadyUsesNoticeTemplate)) return parsed;
  const sourceContent = parsed?.length
    ? parsed.map((section) => `${section.pages[0] ? `[${section.pages[0]}쪽]\n` : ""}${section.content}`).join("\n\n")
    : content;
  const pageBlocks = sourceContent.split(/(?=\[\d+쪽\])/).filter(Boolean);
  const buckets = new Map<string, KnowledgeSection>();
  if (notice) {
    for (const template of NOTICE_SECTIONS) {
      buckets.set(template.semanticTag, { id: crypto.randomUUID(), ...template, content: "", pages: [], origin: "extracted" });
    }
  }
  for (const block of pageBlocks.length ? pageBlocks : [sourceContent]) {
    const page = Number(block.match(/^\[(\d+)쪽\]/)?.[1] || 0);
    const plain = block.replace(/^\[\d+쪽\]\s*/, "").trim();
    const segments = plain.split(/(?<=[.!?]|다\.)\s+|\s+[\-–—]\s+|\s*[•·▪■◆]\s*/).map((item) => item.trim()).filter(Boolean);
    for (const segment of segments) {
      const rule = notice ? null : SECTION_RULES.find((item) => item.pattern.test(segment));
      const key = notice ? classifyNoticeSegment(segment) : rule?.semanticTag || "other";
      const existing = buckets.get(key) || {
        id: crypto.randomUUID(), title: rule?.title || "기타 안내", semanticTag: key,
        content: "", pages: [], origin: "extracted" as const,
      };
      existing.content = [existing.content, segment].filter(Boolean).join("\n");
      if (page && !existing.pages.includes(page)) existing.pages.push(page);
      buckets.set(key, existing);
    }
  }
  return [...buckets.values()].filter((section) => notice || section.content.trim());
}

function serializeSections(sections: KnowledgeSection[]) {
  return JSON.stringify({
    version: 1, format: "structured-markdown", documentType: "관리자 편집 문서",
    sections: sections.map((section) => ({
      key: section.semanticTag, title: section.title, markdown: section.content.trim(), pages: section.pages,
      status: section.origin === "review_required" ? "review_required" : "reviewed",
    })),
  });
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  return <div className="markdown-preview">{markdown.split("\n").map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={index} />;
    if (trimmed.startsWith("### ")) return <h4 key={index}>{trimmed.slice(4)}</h4>;
    if (trimmed.startsWith("## ")) return <h3 key={index}>{trimmed.slice(3)}</h3>;
    if (/^[-*•]\s+/.test(trimmed)) return <div className="markdown-list-item" key={index}><span>•</span><p>{trimmed.replace(/^[-*•]\s+/, "")}</p></div>;
    if (/^\d+\.\s+/.test(trimmed)) return <div className="markdown-list-item" key={index}><span>{trimmed.match(/^\d+/)?.[0]}.</span><p>{trimmed.replace(/^\d+\.\s+/, "")}</p></div>;
    return <p key={index}>{trimmed}</p>;
  })}</div>;
}

export default function KnowledgePage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState("");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourceType, setSourceType] = useState<AddMode>("pdf");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AddMode>("all");
  const [pageSize, setPageSize] = useState(10);
  const [sourcePage, setSourcePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessDialog, setBusinessDialog] = useState<BusinessDialog | null>(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [volumeDialogOpen, setVolumeDialogOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<Business[]>([]);
  const [deleteDialog, setDeleteDialog] = useState<{ step: "confirm" | "password"; password: string } | null>(null);
  const [detail, setDetail] = useState<KnowledgeSource | null>(null);
  const originalDetail = useRef<{ title: string; content?: string; sections: string } | null>(null);
  const [detailSections, setDetailSections] = useState<KnowledgeSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState("");
  const [sectionView, setSectionView] = useState<"edit" | "preview">("edit");
  const [detailTab, setDetailTab] = useState<"edit" | "conflicts">("edit");
  const { report: conflictReport, busy: conflictBusy, error: conflictError, changed: checkChangedData } = useConflictReport(businessId);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [randomQuestion, setRandomQuestion] = useState<RandomQuestion | null>(null);
  const [randomComplete, setRandomComplete] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomSelections, setRandomSelections] = useState<string[]>([]);
  const [randomNote, setRandomNote] = useState("");
  const [brandColor, setBrandColor] = useState("#f26a2e");
  const fileRef = useRef<HTMLInputElement>(null);

  const business = useMemo(() => businesses.find((item) => item.id === businessId) || businesses[0], [businesses, businessId]);
  const sourceCounts = useMemo(() => {
    const counts = { pdf: 0, website: 0, text: 0, random: 0 };
    for (const source of sources) counts[sourceKind(source)] += 1;
    return counts;
  }, [sources]);
  const sourceLimitReached = sourceCounts[sourceType] >= SOURCE_LIMITS[sourceType];
  const activeContentCharacters = useMemo(() => sources.reduce((total, source) =>
    total + (source.enabled && source.status !== "error" ? source.contentLength : 0), 0), [sources]);
  const volumeStatus = dataVolumeStatus(activeContentCharacters);
  const filteredSources = useMemo(() => filterSources(sources, typeFilter, query), [sources, typeFilter, query]);
  const sourceTotalPages = Math.max(1, Math.ceil(filteredSources.length / pageSize));
  const pagedSources = useMemo(() => filteredSources.slice((sourcePage - 1) * pageSize, sourcePage * pageSize), [filteredSources, sourcePage, pageSize]);
  const publicOrder = useMemo(() => new Map(businesses.filter(item => item.isPublic).map((item, index) => [item.id, index + 1])), [businesses]);
  const conflictSourceIds = useMemo(() => new Set(conflictReport?.conflicts.flatMap(conflict => [conflict.left.sourceId, conflict.right.sourceId]) || []), [conflictReport]);

  useEffect(() => { setSourcePage(1); }, [businessId, typeFilter, query, pageSize]);
  useEffect(() => { if (sourcePage > sourceTotalPages) setSourcePage(sourceTotalPages); }, [sourcePage, sourceTotalPages]);

  useEffect(() => {
    fetch("/api/settings").then(response => response.json()).then(payload => payload.settings?.primaryColor && setBrandColor(payload.settings.primaryColor));
    fetch("/api/businesses?includeHidden=1").then(async (response) => {
      const payload = await response.json() as { businesses?: Business[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setBusinesses(payload.businesses || []);
      const requested = new URLSearchParams(window.location.search).get("businessId");
      if (requested && payload.businesses?.some((item) => item.id === requested)) setBusinessId(requested);
      else if (payload.businesses?.length) setBusinessId(payload.businesses[0].id);
    }).catch(() => setNotice({ tone: "error", text: "사업 목록을 불러오지 못했습니다." }));
  }, []);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/knowledge?businessId=${encodeURIComponent(businessId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { sources?: KnowledgeSource[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "목록을 불러오지 못했습니다.");
        if (!cancelled) setSources(payload.sources || []);
      })
      .catch((error) => !cancelled && error?.name !== "AbortError" && setNotice({ tone: "error", text: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; controller.abort(); };
  }, [businessId]);

  useEffect(() => {
    if (sourceType !== "random" || !businessId) return;
    let cancelled = false;
    setRandomLoading(true);
    setRandomQuestion(null);
    setRandomComplete(false);
    setRandomSelections([]);
    setRandomNote("");
    fetch(`/api/random-question?businessId=${encodeURIComponent(businessId)}`)
      .then(async (response) => {
        const payload = await response.json() as { question?: RandomQuestion | null; complete?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "랜덤 질문을 불러오지 못했습니다.");
        if (!cancelled) {
          setRandomQuestion(payload.question || null);
          setRandomComplete(Boolean(payload.complete));
        }
      })
      .catch((error) => !cancelled && setNotice({ tone: "error", text: error instanceof Error ? error.message : "랜덤 질문을 불러오지 못했습니다." }))
      .finally(() => !cancelled && setRandomLoading(false));
    return () => { cancelled = true; };
  }, [businessId, sourceType]);

  function resetForm() {
    setTitle(""); setUrl(""); setContent(""); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function withBusinessSettingsPermission(action: () => void | Promise<void>) {
    try {
      const response = await fetch("/api/admin-access", { cache: "no-store" });
      if (response.status === 401) { window.alert("로그인이 만료되었습니다. 다시 로그인해 주세요."); return; }
      if (!response.ok) throw new Error("permission lookup failed");
      const access = await response.json();
      if (access.canManageSettings !== true) { window.alert("권한이 없습니다. 최고관리자에게 문의해 주세요."); return; }
    } catch { window.alert("접근 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."); return; }
    await action();
  }
  async function saveBusiness(event: FormEvent) {
    event.preventDefault();
    if (!businessDialog?.name.trim()) return;
    const isAdd = businessDialog.mode === "add";
    const response = await fetch("/api/businesses", {
      method: isAdd ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...businessDialog, ...(isAdd ? {} : { id: businessId }) }),
    });
    const payload = await response.json() as { business?: Business; name?: string; noticeUrl?: string; contactDepartment?: string; contactEmail?: string; contactPhone?: string; contactHours?: string; error?: string };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "사업을 저장하지 못했습니다." });
    if (isAdd && payload.business) {
      setBusinesses((previous) => [...previous, payload.business!]);
      setBusinessId(payload.business.id);
    } else {
      setBusinesses((previous) => previous.map((item) => item.id === businessId ? {
        ...item, name: payload.name!, shortName: payload.name!, noticeUrl: payload.noticeUrl || "",
        contactDepartment: payload.contactDepartment || "", contactEmail: payload.contactEmail || "", contactPhone: payload.contactPhone || "", contactHours: payload.contactHours || "",
      } : item));
    }
    setBusinessDialog(null);
    setNotice(null);
  }

  function openOrderDialog() {
    setOrderDraft([...businesses]);
    setOrderDialogOpen(true);
  }

  function moveOrderDraft(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderDraft.length) return;
    const next = [...orderDraft];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setOrderDraft(next);
  }

  async function saveBusinessOrder() {
    try {
      const response = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderDraft.map((item) => item.id) }),
      });
      const payload = await response.json() as { businesses?: Business[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "사업 순서를 변경하지 못했습니다.");
      setBusinesses(payload.businesses || orderDraft);
      setOrderDialogOpen(false);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "사업 순서를 변경하지 못했습니다." });
    }
  }

  async function toggleBusinessVisibility() {
    if (!business) return;
    const isPublic = !business.isPublic;
    const response = await fetch("/api/businesses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: business.id, isPublic }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "공개 여부를 변경하지 못했습니다." });
    setBusinesses((previous) => previous.map((item) => item.id === business.id ? { ...item, isPublic } : item));
    setNotice(null);
  }

  async function removeBusiness() {
    if (!business || !deleteDialog?.password) return;
    const response = await fetch(`/api/businesses?id=${encodeURIComponent(business.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: deleteDialog.password }) });
    const payload = await response.json() as { error?: string; cleanup?: { pendingFiles: number } };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "사업을 삭제하지 못했습니다." });
    const next = businesses.filter((item) => item.id !== business.id);
    setBusinesses(next);
    setBusinessId(next[0]?.id || "");
    setDeleteDialog(null);
    setNotice(payload.cleanup?.pendingFiles ? { tone: "error", text: "사업 데이터는 삭제했지만 원본 파일 일부가 삭제 대기 중입니다. 운영 담당자가 정기 정리 작업의 실행 결과를 확인해 주세요." } : null);
  }

  async function addSource(event: FormEvent) {
    event.preventDefault();
    if (sourceType === "random") return;
    if (loading || sourceLimitReached) return setNotice({ tone: "error", text: sourceLimitMessage(sourceType) });
    if (!title.trim()) return setNotice({ tone: "error", text: "데이터 제목을 입력해 주세요." });
    if (sourceType === "website" && !url.trim()) return setNotice({ tone: "error", text: "웹사이트 주소를 입력해 주세요." });
    if (sourceType === "text" && !content.trim()) return setNotice({ tone: "error", text: "데이터 내용을 입력해 주세요." });
    if (sourceType === "pdf" && !file) return setNotice({ tone: "error", text: "PDF 파일을 선택해 주세요." });
    setSaving(true); setNotice(null);
    try {
      let request: RequestInit;
      if (sourceType === "pdf" && file) {
        request = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId, type: sourceType, title: title.trim(),
            fileName: file.name, fileType: file.type,
            fileBase64: await fileToBase64(file),
            extractedText: await extractPdfText(file),
          }),
        };
      } else {
        const form = new FormData();
        form.set("businessId", businessId); form.set("type", sourceType); form.set("title", title.trim());
        if (sourceType === "website") form.set("url", url.trim());
        if (sourceType === "text") form.set("content", content.trim());
        request = { method: "POST", body: form };
      }
      const response = await fetch("/api/knowledge", request);
      const payload = await response.json() as { source?: KnowledgeSource; error?: string };
      if (!response.ok || !payload.source) throw new Error(payload.error || "데이터를 등록하지 못했습니다.");
      setSources((previous) => [payload.source!, ...previous]); resetForm(); checkChangedData(businessId);
      setNotice(payload.source.status === "error" ? { tone: "error", text: "주소는 등록했지만 웹사이트 내용을 가져오지 못했습니다." } : null);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "데이터를 등록하지 못했습니다." });
    } finally { setSaving(false); }
  }

  function toggleRandomOption(option: string) {
    setRandomSelections((previous) => previous.includes(option) ? previous.filter((item) => item !== option) : [...previous, option]);
  }

  async function saveRandomAnswer(event: FormEvent) {
    event.preventDefault();
    if (loading || sourceCounts.random >= SOURCE_LIMITS.random) return setNotice({ tone: "error", text: sourceLimitMessage("random") });
    if (!randomQuestion || (!randomSelections.length && !randomNote.trim())) {
      return setNotice({ tone: "error", text: "해당하는 항목을 하나 이상 선택해 주세요." });
    }
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/random-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, questionId: randomQuestion.id, selectedOptions: randomSelections, note: randomNote }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "선택한 내용을 저장하지 못했습니다.");

      const [sourcesResponse, nextResponse] = await Promise.all([
        fetch(`/api/knowledge?businessId=${encodeURIComponent(businessId)}`),
        fetch(`/api/random-question?businessId=${encodeURIComponent(businessId)}`),
      ]);
      const [sourcesPayload, nextPayload] = await Promise.all([
        sourcesResponse.json() as Promise<{ sources?: KnowledgeSource[] }>,
        nextResponse.json() as Promise<{ question?: RandomQuestion | null; complete?: boolean; error?: string }>,
      ]);
      if (sourcesResponse.ok) setSources(sourcesPayload.sources || []);
      checkChangedData(businessId);

      setRandomQuestion(null); setRandomSelections([]); setRandomNote(""); setRandomLoading(true);
      if (!nextResponse.ok) throw new Error(nextPayload.error || "다음 질문을 불러오지 못했습니다.");
      setRandomQuestion(nextPayload.question || null); setRandomComplete(Boolean(nextPayload.complete));
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "선택한 내용을 저장하지 못했습니다." });
    } finally { setSaving(false); setRandomLoading(false); }
  }

  async function skipRandomQuestion() {
    if (!randomQuestion) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/random-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, questionId: randomQuestion.id, action: "skip" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "질문을 건너뛰지 못했습니다.");

      setRandomQuestion(null); setRandomSelections([]); setRandomNote(""); setRandomLoading(true);
      const nextResponse = await fetch(`/api/random-question?businessId=${encodeURIComponent(businessId)}`);
      const nextPayload = await nextResponse.json() as { question?: RandomQuestion | null; complete?: boolean; error?: string };
      if (!nextResponse.ok) throw new Error(nextPayload.error || "다음 질문을 불러오지 못했습니다.");
      setRandomQuestion(nextPayload.question || null); setRandomComplete(Boolean(nextPayload.complete));
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "질문을 건너뛰지 못했습니다." });
    } finally { setSaving(false); setRandomLoading(false); }
  }

  async function openDetail(source: KnowledgeSource) {
    setDetailTab("edit");
    setDetailLoading(true);
    const response = await fetch(`/api/knowledge?id=${encodeURIComponent(source.id)}`);
    const payload = await response.json() as { source?: KnowledgeSource; error?: string };
    setDetailLoading(false);
    if (response.ok && payload.source) {
      setDetail(payload.source.type === "website" ? { ...payload.source, type: "pdf", originalType: "website", fileName: payload.source.url || payload.source.title } : payload.source);
      const sections = payload.source.type === "pdf" || payload.source.type === "website" ? derivePdfSections(payload.source.content || "", `${payload.source.title} ${payload.source.fileName || payload.source.url || ""}`) : [];
      setDetailSections(sections);
      originalDetail.current = { title: payload.source.title, content: payload.source.content, sections: JSON.stringify(sections) };
      setActiveSectionId(sections[0]?.id || "");
      setSectionView("edit");
    }
    else setNotice({ tone: "error", text: payload.error || "데이터를 불러오지 못했습니다." });
  }

  async function saveDetail(event: FormEvent) {
    event.preventDefault(); if (!detail) return;
    const nextContent = detail.type === "pdf" ? (JSON.stringify(detailSections) === originalDetail.current?.sections ? originalDetail.current.content : serializeSections(detailSections)) : detail.content;
    const sharingOnly = detail.title === originalDetail.current?.title && nextContent === originalDetail.current?.content;
    const response = await fetch("/api/knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, ...(sharingOnly ? {} : { title: detail.title, content: nextContent }), sharedAllBusinesses: Boolean(detail.sharedAllBusinesses) }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) return setNotice({ tone: "error", text: payload.error || "데이터를 수정하지 못했습니다." });
    setSources((previous) => previous.map((item) => item.id === detail.id ? { ...item, status: sharingOnly ? item.status : "ready", title: detail.title, sharedAllBusinesses: Boolean(detail.sharedAllBusinesses), contentLength: nextContent?.length || 0, updatedAt: Date.now() } : item));
    checkChangedData(detail.businessId);
    setDetail(null); setNotice(null);
  }

  function updateActiveSection(changes: Partial<KnowledgeSection>) {
    setDetailSections((previous) => previous.map((section) => section.id === activeSectionId ? { ...section, ...changes, origin: "edited" } : section));
  }

  function addDetailSection() {
    const section: KnowledgeSection = { id: crypto.randomUUID(), title: "새 안내 항목", semanticTag: "custom", content: "", pages: [], origin: "edited" };
    setDetailSections((previous) => [...previous, section]);
    setActiveSectionId(section.id);
  }

  function removeDetailSection() {
    if (detailSections.length <= 1 || !window.confirm("이 항목을 삭제할까요?")) return;
    const index = detailSections.findIndex((section) => section.id === activeSectionId);
    const next = detailSections.filter((section) => section.id !== activeSectionId);
    setDetailSections(next);
    setActiveSectionId(next[Math.max(0, index - 1)]?.id || "");
  }

  function moveDetailSection(direction: -1 | 1) {
    const index = detailSections.findIndex((section) => section.id === activeSectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= detailSections.length) return;
    const next = [...detailSections];
    [next[index], next[target]] = [next[target], next[index]];
    setDetailSections(next);
  }

  async function toggleSource(source: KnowledgeSource) {
    const enabled = !source.enabled;
    setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, enabled } : item));
    const response = await fetch("/api/knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: source.id, enabled }) });
    if (!response.ok) setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, enabled: source.enabled } : item));
    else checkChangedData(source.businessId);
  }

  async function removeSource(source: KnowledgeSource) {
    if (!window.confirm(`‘${source.title}’ 데이터를 삭제할까요?`)) return;
    const response = await fetch(`/api/knowledge?id=${encodeURIComponent(source.id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice({ tone: "error", text: "데이터를 삭제하지 못했습니다." });
    setSources((previous) => previous.filter((item) => item.id !== source.id)); setDetail(null); checkChangedData(source.businessId);
    setNotice(null);
  }

  return (
    <main className="knowledge-shell" style={brandTheme(brandColor) as CSSProperties}>
      <header className="topbar knowledge-topbar">
        <BrandLink />
        <AdminNav current="knowledge" />
      </header>
      <div className="knowledge-layout">
        <aside className="knowledge-sidebar">
          <div className="sidebar-heading sidebar-heading-actions"><h2>사업별 관리</h2><div className="sidebar-primary-actions"><button className="business-add-button" type="button" aria-label="신규 사업 추가" onClick={() => void withBusinessSettingsPermission(() => setBusinessDialog({ mode: "add", name: "", noticeUrl: "", contactDepartment: "", contactEmail: "", contactPhone: "", contactHours: "평일 10:00~12:00, 14:00~17:00" }))}>＋</button><button className="business-order-button" type="button" aria-label="사업 순서 정리" onClick={() => void withBusinessSettingsPermission(openOrderDialog)}>✎</button></div></div>
          <nav aria-label="사업 선택">
            {businesses.map((item) => (
              <button className={item.id === businessId ? "active" : ""} type="button" key={item.id} onClick={() => setBusinessId(item.id)}>
                <span className="business-code">{item.isPublic ? publicOrder.get(item.id) : "×"}</span><span><b>{item.name}</b></span>
              </button>
            ))}
          </nav>
          <div className="sidebar-note"><span>✦</span><p><b>사업마다 답변 범위가 달라요</b><br />선택한 사업의 활성 데이터와 다른 사업에도 공통 적용한 활성 자료를 챗봇이 참고합니다.</p></div>
        </aside>
        <section className="knowledge-main">
          <div className="knowledge-title-row">
            <div><h1>{business?.name}</h1></div>
            <div className="business-title-actions title-icon-actions"><button className={`business-public-switch${business?.isPublic ? " on" : ""}`} type="button" role="switch" aria-label="메인 공개 여부" title="메인 공개 여부" aria-checked={business?.isPublic} onClick={() => void withBusinessSettingsPermission(toggleBusinessVisibility)}><span /></button><button className="title-edit-button" type="button" aria-label="사업 정보 수정" title="사업 정보 수정" onClick={() => void withBusinessSettingsPermission(() => { if (business) setBusinessDialog({ mode: "rename", name: business.name, noticeUrl: business.noticeUrl || "", contactDepartment: business.contactDepartment || "", contactEmail: business.contactEmail || "", contactPhone: business.contactPhone || "", contactHours: business.contactHours || "" }); })}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button className="business-delete-button" type="button" aria-label="사업 삭제" title="사업 삭제" onClick={() => void withBusinessSettingsPermission(() => setDeleteDialog({ step: "confirm", password: "" }))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button></div>
          </div>
          <section className="knowledge-add" aria-label="데이터 추가">
            <div className="knowledge-health-row">
              <button className={`data-volume-indicator ${volumeStatus.tone}`} type="button" disabled={loading} aria-haspopup="dialog" onClick={() => setVolumeDialogOpen(true)}>
                <span className="data-volume-dot" aria-hidden="true" /><span>{loading ? "자료량 확인 중" : volumeStatus.label}</span>
              </button>
              {business && <FaqPanel key={business.id} businessId={business.id} />}
            </div>
            <div className="source-tabs" role="tablist" aria-label="자료 형식">
              {(Object.keys(TYPE_META) as AddMode[]).map((type) => <button className={sourceType === type ? "active" : ""} type="button" role="tab" aria-selected={sourceType === type} key={type} onClick={() => setSourceType(type)}><span>{TYPE_META[type].icon}</span><b>{TYPE_META[type].label}</b></button>)}
            </div>
            {sourceType !== "random" ? <form className="source-form" onSubmit={addSource}>
              <label className="field source-title-field"><span>데이터 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예) 2026년 사업 신청 안내" maxLength={120} /></label>
              {sourceType === "website" && <label className="field field-wide"><span>웹사이트 주소</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.org/program" /></label>}
              {sourceType === "pdf" && <div className="field field-wide"><span>PDF 파일</span><input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><button className={`file-drop${file ? " selected" : ""}`} type="button" onClick={() => fileRef.current?.click()}><span className="file-symbol">PDF</span><span><span className="pdf-file-label">{file ? file.name : "PDF 파일을 선택하세요 · 최대 20MB · 최대 80페이지"}</span>{file && <small>{`${(file.size / 1024 / 1024).toFixed(1)}MB · 텍스트 분석 준비됨`}</small>}</span><strong>{file ? "변경" : "파일 선택"}</strong></button></div>}
              {sourceType === "text" && <label className="field field-wide"><span>데이터 내용</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="담당자 추가 안내를 입력해 주세요." /></label>}
              <div className="source-form-footer"><p><span>✓</span> {sourceType === "pdf" ? "AI가 구조화된 JSON과 항목별 마크다운을 만듭니다." : "등록한 데이터는 이 사업의 챗봇 답변에만 반영됩니다."}</p><button className="knowledge-submit" disabled={saving || loading || sourceLimitReached}>{saving ? sourceType === "pdf" ? "AI가 문서를 분석하고 있어요…" : "분석하고 있어요…" : "데이터 추가"}</button></div>
            </form> : <form className="random-question-card" onSubmit={saveRandomAnswer}>
              <div className="random-question-heading"><span>텍스트(랜덤)</span><small>복수 선택 가능</small></div>
              {randomLoading ? <div className="random-question-state"><span className="loading-ring" /><b>사업 내용을 보고 질문을 고르고 있어요</b></div> : randomQuestion ? <>
                <h3>{randomQuestion.question}</h3>
                <p className="random-question-guide">기관에서 실제로 적용하는 내용을 모두 선택하세요. 선택 결과는 담당자 보완 데이터로 자동 등록됩니다.</p>
                <div className="random-options">
                  {randomQuestion.options.map((option) => <label className={randomSelections.includes(option) ? "selected" : ""} key={option}><input type="checkbox" checked={randomSelections.includes(option)} onChange={() => toggleRandomOption(option)} /><span>{option}</span></label>)}
                </div>
                <label className="field random-note"><span>추가 설명 <small>선택 사항</small></span><textarea value={randomNote} onChange={(event) => setRandomNote(event.target.value)} placeholder="선택지에 없거나 담당자가 추가로 정해야 할 내용을 적어 주세요." /></label>
                <div className="source-form-footer"><p><span>✓</span> 완료하거나 건너뛴 질문은 사라지고 새로운 질문이 나타납니다.</p><div className="random-actions"><button className="random-skip" type="button" disabled={saving} onClick={skipRandomQuestion}>건너뛰기</button><button className="knowledge-submit" disabled={saving || loading || sourceLimitReached}>{saving ? "처리하고 있어요…" : "데이터 추가"}</button></div></div>
              </> : <div className="random-question-state complete"><span>✓</span><b>{randomComplete ? "준비된 랜덤 질문을 모두 완료했습니다." : "질문을 불러오지 못했습니다."}</b><p>필요한 운영 기준이 생기면 직접 입력으로 추가해 주세요.</p></div>}
            </form>}
          </section>
          {sourceLimitReached && <p className="knowledge-notice error" role="status">{sourceLimitMessage(sourceType)}</p>}
          {notice && <div className={`knowledge-notice ${notice.tone}`} role="status"><span>!</span>{notice.text}<button type="button" aria-label="알림 닫기" onClick={() => setNotice(null)}>×</button></div>}
          <section className="knowledge-list" aria-labelledby="knowledge-list-title">
            <div className="list-toolbar source-list-toolbar"><h2 id="knowledge-list-title">등록된 데이터</h2>
              <div className="source-filter-bar" role="group" aria-label="등록 데이터 유형 필터">{(["all", "pdf", "website", "text", "random"] as const).map(kind => <button key={kind} type="button" className={typeFilter === kind ? "active" : ""} aria-pressed={typeFilter === kind} onClick={() => setTypeFilter(kind)}>{kind === "all" ? "전체" : TYPE_META[kind].label}</button>)}</div>
              <label className="page-size-select"><span className="sr-only">페이지당 표시 개수</span><select aria-label="페이지당 표시 개수" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map(size => <option value={size} key={size}>{size}개씩 보기</option>)}</select></label>
              <label className="knowledge-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="데이터 제목 검색" /></label>
            </div>
            <div className="knowledge-table-head"><span>자료</span><span>상태</span><span>답변 사용</span></div>
            <div className="knowledge-rows">
              {loading || detailLoading ? <div className="knowledge-empty"><span className="loading-ring" /><b>데이터를 불러오고 있어요</b></div> : filteredSources.length ? pagedSources.map((source) => (
                <article className={`knowledge-row clickable${source.enabled ? "" : " muted"}`} key={source.id} tabIndex={0} onClick={() => openDetail(source)} onKeyDown={(event) => event.key === "Enter" && openDetail(source)}>
                  <div className="source-identity"><span className={`source-type-icon ${source.type}`}>{TYPE_META[sourceKind(source)].icon}</span><div><b>{source.title}</b><small>{TYPE_META[sourceKind(source)].label} · {new Date(source.updatedAt).toLocaleDateString("ko-KR")}</small></div></div>
                  <div>{source.status === "error" || conflictSourceIds.has(source.id) || conflictReport?.unavailableIds.includes(source.id)
                    ? <button type="button" className="status-pill conflict-required" onClick={(event) => { event.stopPropagation(); void openDetail(source).then(() => setDetailTab("conflicts")); }}>확인 필요</button>
                    : conflictBusy ? <span className="status-pill stored">검사 중</span>
                    : conflictError ? <span className="status-pill stored" title={conflictError}>확인 필요</span> : null}</div>
                  <div><button className={`knowledge-switch${source.enabled ? " on" : ""}`} type="button" role="switch" aria-checked={source.enabled} onClick={(event) => { event.stopPropagation(); toggleSource(source); }}><span /></button></div>
                </article>
              )) : <div className="knowledge-empty"><span>▤</span><b>{query || typeFilter !== "all" ? "선택한 조건의 데이터가 없습니다" : "아직 등록된 데이터가 없습니다"}</b><p>{query || typeFilter !== "all" ? "검색어나 데이터 유형을 변경해 보세요." : "위에서 웹사이트, PDF 또는 텍스트를 추가해 주세요."}</p></div>}
            </div>
            {!loading && !detailLoading && <AdminPagination currentPage={sourcePage} totalPages={sourceTotalPages} onChange={setSourcePage} />}
          </section>
        </section>
      </div>

      {volumeDialogOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setVolumeDialogOpen(false)}><section className="modal compact-modal data-volume-modal" role="dialog" aria-modal="true" aria-labelledby="data-volume-title"><button className="modal-close" type="button" aria-label="닫기" onClick={() => setVolumeDialogOpen(false)}>×</button><h2 id="data-volume-title">자료량 확인</h2><p className="data-volume-note">활성화된 자료의 글자 수가 10만자를 넘으면 답변이 느려지고 오류율이 높아질 수 있어요.</p><div className={`data-volume-current ${volumeStatus.tone}`}><span className="data-volume-dot" aria-hidden="true" /><div><b>{activeContentCharacters.toLocaleString("ko-KR")}자</b><span>{volumeStatus.label}</span></div></div><div className="data-volume-rules" aria-label="자료량 표기 규칙">{DATA_VOLUME_RULES.map((rule) => <div key={rule.tone}><span className={`data-volume-dot ${rule.tone}`} aria-hidden="true" /><b>{rule.label}</b><span>{rule.range}</span></div>)}</div></section></div>}
      {businessDialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setBusinessDialog(null)}><form className="modal compact-modal business-info-modal" onSubmit={saveBusiness}><button className="modal-close" type="button" onClick={() => setBusinessDialog(null)}>×</button><h2>{businessDialog.mode === "add" ? "신규 사업 추가" : "사업 정보 수정"}</h2><p className="business-info-guide">{businessDialog.mode === "add" ? "아래 필수 정보를 모두 입력해야 생성할 수 있어요." : "아래 필수 정보를 모두 입력해야 메인 화면에 공개할 수 있어요."}</p><label className="field"><span>사업명</span><input aria-label="사업명" autoFocus value={businessDialog.name} onChange={(event) => setBusinessDialog({ ...businessDialog, name: event.target.value })} maxLength={120} required /></label><label className="field"><span>사업안내 공고 링크</span><input type="url" value={businessDialog.noticeUrl} onChange={(event) => setBusinessDialog({ ...businessDialog, noticeUrl: event.target.value })} placeholder="https://example.org/notice" required={businessDialog.mode === "add"} /></label><label className="field"><span>담당 부서</span><input value={businessDialog.contactDepartment} onChange={(event) => setBusinessDialog({ ...businessDialog, contactDepartment: event.target.value })} required={businessDialog.mode === "add"} /></label><label className="field"><span>이메일</span><input type="email" value={businessDialog.contactEmail} onChange={(event) => setBusinessDialog({ ...businessDialog, contactEmail: event.target.value })} placeholder="contact@example.org" required={businessDialog.mode === "add"} /></label><label className="field"><span>연락처</span><input value={businessDialog.contactPhone} onChange={(event) => setBusinessDialog({ ...businessDialog, contactPhone: event.target.value })} placeholder="02-0000-0000" required={businessDialog.mode === "add"} /></label><label className="field"><span>전화 가능 시간</span><input value={businessDialog.contactHours} onChange={(event) => setBusinessDialog({ ...businessDialog, contactHours: event.target.value })} placeholder="평일 10:00~12:00, 14:00~17:00" required={businessDialog.mode === "add"} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setBusinessDialog(null)}>취소</button><button className="knowledge-submit">저장</button></div></form></div>}
      {orderDialogOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOrderDialogOpen(false)}><section className="modal order-modal"><button className="modal-close" type="button" onClick={() => setOrderDialogOpen(false)}>×</button><h2>사업 순서 정리(메인화면 연동)</h2><div className="order-list">{orderDraft.map((item, index) => <div key={item.id}><span>{index + 1}</span><b>{item.name}</b><div><button type="button" disabled={index === 0} onClick={() => moveOrderDraft(index, -1)} aria-label={`${item.name} 위로`}>▲</button><button type="button" disabled={index === orderDraft.length - 1} onClick={() => moveOrderDraft(index, 1)} aria-label={`${item.name} 아래로`}>▼</button></div></div>)}</div><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setOrderDialogOpen(false)}>취소</button><button type="button" className="knowledge-submit" onClick={saveBusinessOrder}>저장</button></div></section></div>}
      {deleteDialog && business && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDeleteDialog(null)}><section className="modal compact-modal delete-business-modal"><button className="modal-close" type="button" onClick={() => setDeleteDialog(null)}>×</button><h2>사업 삭제</h2>{deleteDialog.step === "confirm" ? <><p>‘{business.name}’ 사업과 등록 데이터, 상담 내역을 모두 삭제할까요?</p><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setDeleteDialog(null)}>취소</button><button type="button" className="danger-button" onClick={() => setDeleteDialog({ ...deleteDialog, step: "password" })}>확인</button></div></> : <><label className="field"><span>본인 비밀번호</span><input autoFocus type="password" value={deleteDialog.password} onChange={(event) => setDeleteDialog({ ...deleteDialog, password: event.target.value })} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setDeleteDialog(null)}>취소</button><button type="button" className="danger-button" disabled={!deleteDialog.password} onClick={removeBusiness}>삭제</button></div></>}</section></div>}
      {detail && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}><form className={`modal detail-modal${detail.type === "pdf" ? " structured-detail" : ""}`} onSubmit={saveDetail}><button className="modal-close" type="button" onClick={() => setDetail(null)}>×</button><h2>데이터 확인 및 수정</h2><div className="knowledge-detail-toolbar"><div className="conflict-tabs" role="tablist" aria-label="등록 데이터 상세"><button type="button" role="tab" id="data-edit-tab" aria-selected={detailTab === "edit"} aria-controls="data-edit-panel" onClick={() => setDetailTab("edit")}>내용 확인 및 수정</button><button type="button" role="tab" id="conflict-tab" aria-selected={detailTab === "conflicts"} aria-controls="conflict-panel" onClick={() => setDetailTab("conflicts")}>충돌 확인</button></div><label className="shared-knowledge-toggle"><input type="checkbox" checked={Boolean(detail.sharedAllBusinesses)} onChange={(event) => setDetail({ ...detail, sharedAllBusinesses: event.target.checked })} />다른 사업에도 공통 적용</label></div>{detailTab === "conflicts" ? <ConflictPanel sourceId={detail.id} report={conflictReport} busy={conflictBusy} error={conflictError}  /> : <div role="tabpanel" id="data-edit-panel" aria-labelledby="data-edit-tab"><label className="field"><span>제목</span><input value={detail.title} onChange={(event) => setDetail({ ...detail, title: event.target.value })} /></label>{detail.type === "pdf" ? <div className="section-editor"><aside className="section-tabs" aria-label="PDF 안내 항목"><div className="section-tabs-heading"><b>안내 항목</b><button type="button" onClick={addDetailSection}>＋ 추가</button></div>{detailSections.map((section) => <button className={section.id === activeSectionId ? "active" : ""} type="button" key={section.id} onClick={() => setActiveSectionId(section.id)}><span>{section.title}</span><small>{section.pages.length ? `${section.pages.join(", ")}쪽` : "출처 미지정"}</small></button>)}</aside>{detailSections.filter((section) => section.id === activeSectionId).map((section) => <section className="section-panel" key={section.id}><div className="section-status-row"><span className={`section-origin ${section.origin}`}>{section.origin === "edited" ? "관리자 수정" : section.origin === "review_required" ? "검토 필요" : section.origin === "ai_analyzed" ? "AI 분석" : "원문 추출"}</span><div className="section-panel-actions"><span className="view-toggle"><button className={sectionView === "edit" ? "active" : ""} type="button" onClick={() => setSectionView("edit")}>편집</button><button className={sectionView === "preview" ? "active" : ""} type="button" onClick={() => setSectionView("preview")}>미리보기</button></span><button type="button" disabled={detailSections.findIndex((item) => item.id === section.id) === 0} onClick={() => moveDetailSection(-1)}>↑</button><button type="button" disabled={detailSections.findIndex((item) => item.id === section.id) === detailSections.length - 1} onClick={() => moveDetailSection(1)}>↓</button></div></div><label className="field"><span>항목 이름</span><input value={section.title} onChange={(event) => updateActiveSection({ title: event.target.value })} /></label>{sectionView === "edit" ? <label className="field"><span>마크다운 내용</span><textarea className="section-content" value={section.content} onChange={(event) => updateActiveSection({ content: event.target.value })} placeholder="목록은 - 기호, 소제목은 ## 기호를 사용할 수 있습니다." /></label> : <div className="field"><span>마크다운 미리보기</span><MarkdownPreview markdown={section.content} /></div>}<div className="section-source"><span>원본 출처</span><b>{detail.fileName || detail.title}</b><label>페이지 <input value={section.pages.join(", ")} onChange={(event) => updateActiveSection({ pages: event.target.value.split(",").map((value) => Number(value.trim())).filter(Boolean) })} placeholder="예: 2, 3" /></label></div><button className="section-delete" type="button" onClick={removeDetailSection}>이 항목 삭제</button></section>)}</div> : <label className="field"><span>내용</span><textarea className="detail-content" value={detail.content || ""} onChange={(event) => setDetail({ ...detail, content: event.target.value })} /></label>}</div>}<div className="modal-actions split"><button type="button" className="danger-button" onClick={() => removeSource(detail)}>자료 삭제</button><span /><button type="button" className="cancel-button" onClick={() => setDetail(null)}>취소</button><button className="knowledge-submit">변경사항 저장</button></div></form></div>}
    </main>
  );
}
