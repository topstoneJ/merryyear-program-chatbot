"use client";

import AnswerText from "./answer-text";
import { ADMIN_GUIDE_BUSINESS_ID, ADMIN_GUIDE_BUSINESS_NAME } from "./admin-guide";
import { CHAT_LIMIT_MESSAGE, MAX_CHAT_CHARACTERS, MAX_CHAT_TURNS } from "./chat-context";
import { maskIdentityNumbers } from "./resident-number";
import { syncBrowserBranding } from "./browser-branding";
import { resolvePrivacyPolicy } from "./privacy-policy";

import { CSSProperties, FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";

type BusinessId = string;
export type SiteSettings = { updatedAt?: number; organizationName: string; contact: string; logoUrl: string; faviconUrl?: string; mainHeadline: string; mainSubcopy: string; chatbotGreeting: string; chatPlaceholder: string; privacyPolicy?: string; primaryColor: string; secondaryColor?: string };

type Answer = {
  text: string;
  source: string;
  page: number;
  confidence: number;
  review?: boolean;
};

type ChatMessage = {
  id: number;
  question: string;
  answer?: Answer;
  thinking?: boolean;
};

type SurveyGroup = {
  question: string;
  answers: string[];
};

type Business = {
  id: BusinessId;
  name: string;
  title: string;
  date: string;
  pages: number;
  pdf: string;
  pageLabel: string;
  prompts: { icon: string; question: string }[];
  survey: SurveyGroup[];
};

const ADMIN_GUIDE_BUSINESS: Business = {
  id: ADMIN_GUIDE_BUSINESS_ID,
  name: ADMIN_GUIDE_BUSINESS_NAME,
  title: "관리자용 챗봇 운영 안내",
  date: "읽기 전용",
  pages: 0,
  pdf: "",
  pageLabel: "운영 가이드",
  prompts: [
    { icon: "✓", question: "챗봇을 처음 설정하는 순서를 알려주세요" },
    { icon: "▤", question: "챗봇은 어떤 순서로 답변을 판단하나요?" },
    { icon: "?", question: "답변이 부정확할 때 어떻게 개선하나요?" },
  ],
  survey: [],
};

const EMPTY_BUSINESS: Business = {
  id: "",
  name: "등록된 사업이 없습니다",
  title: "관리자 화면에서 사업을 등록해 주세요",
  date: "",
  pages: 0,
  pdf: "",
  pageLabel: "등록 자료",
  prompts: [],
  survey: [],
};

const ANSWER_REVEAL_CHARACTERS_PER_SECOND = 30;

function AnswerReveal({ answer }: { answer: Answer }) {
  const characters = useMemo(() => Array.from(answer.text), [answer.text]);
  const revealDurationMs = characters.length / ANSWER_REVEAL_CHARACTERS_PER_SECOND * 1000;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [visibleCharacters, setVisibleCharacters] = useState(reduceMotion ? characters.length : 0);

  useEffect(() => {
    if (reduceMotion) { setVisibleCharacters(characters.length); return; }
    setVisibleCharacters(0);
    const startedAt = performance.now();
    let frame = 0;
    const reveal = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(revealDurationMs, 1));
      setVisibleCharacters(Math.ceil(characters.length * progress));
      if (progress < 1) frame = window.requestAnimationFrame(reveal);
    };
    frame = window.requestAnimationFrame(reveal);
    return () => window.cancelAnimationFrame(frame);
  }, [characters, reduceMotion, revealDurationMs]);

  if (reduceMotion) return <div data-answer-text="true" data-answer-complete="true"><AnswerText text={answer.text} /></div>;
  return <>
    <div aria-hidden="true"><AnswerText text={characters.slice(0, visibleCharacters).join("")} /></div>
    <span className="sr-only" data-answer-text="true" data-answer-complete="true">{answer.text}</span>
  </>;
}

export function HomeClient({ previewSettings, initialSettings }: { previewSettings?: SiteSettings; initialSettings?: SiteSettings } = {}) {
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(previewSettings || initialSettings || { organizationName: "기관명 미설정", contact: "", logoUrl: "/default-organization-logo.svg", mainHeadline: "사업 안내,\n질문으로 쉽게 확인하세요", mainSubcopy: "관리자 화면에서 기관과 사업 정보를 설정해 주세요.", chatbotGreeting: "등록된 안내 자료를 바탕으로 답변해 드릴게요.", primaryColor: "#f26a2e", chatPlaceholder: "선택한 사업에 대해 질문해 주세요" });
  const [settingsLoaded, setSettingsLoaded] = useState(Boolean(previewSettings || initialSettings));
  const [businessId, setBusinessId] = useState<BusinessId>("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [manuals, setManuals] = useState<Record<string, string>>({});
  const [manualDraft, setManualDraft] = useState("");
  const [selectedSurvey, setSelectedSurvey] = useState<string[]>([]);
  const [uploadedNames, setUploadedNames] = useState<Record<string, string>>({});
  const [websiteLinks, setWebsiteLinks] = useState<Record<string, string>>({});
  const [shareCopied, setShareCopied] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  useEffect(() => { if (previewSettings || initialSettings) return; fetch("/api/settings").then((response) => response.json()).then((payload: { settings?: SiteSettings }) => payload.settings && setSiteSettings(payload.settings)).catch(() => undefined).finally(() => setSettingsLoaded(true)); }, [previewSettings, initialSettings]);
  useEffect(() => {
    if (!previewSettings && siteSettings.faviconUrl) syncBrowserBranding({ organizationName: siteSettings.organizationName, faviconUrl: siteSettings.faviconUrl });
  }, [previewSettings, siteSettings.organizationName, siteSettings.faviconUrl]);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const sessionId = useRef("");

  const business = businesses.find((item) => item.id === businessId) || businesses[0] || EMPTY_BUSINESS;
  const isAdminGuide = businessId === ADMIN_GUIDE_BUSINESS_ID;
  const completedMessages = useMemo(() => messages.filter(message => !message.thinking && message.answer), [messages]);
  const conversationCharacters = completedMessages.reduce((total, message) => total + message.question.length + message.answer!.text.length, 0);
  const conversationLimitReached = completedMessages.length >= MAX_CHAT_TURNS || conversationCharacters >= MAX_CHAT_CHARACTERS;
  const privacyPolicyText = useMemo(() => resolvePrivacyPolicy(siteSettings.privacyPolicy, siteSettings.organizationName, siteSettings.contact), [siteSettings.privacyPolicy, siteSettings.organizationName, siteSettings.contact]);

  useEffect(() => {
    if (!privacyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPrivacyOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [privacyOpen]);

  useEffect(() => {
    fetch("/api/businesses", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { businesses?: Array<{ id: string; name: string }> }) => {
        if (!payload.businesses) return;
        const next = payload.businesses.map((item) => item.id === ADMIN_GUIDE_BUSINESS_ID ? ADMIN_GUIDE_BUSINESS : {
          id: item.id,
          name: item.name,
          title: item.name,
          date: "등록 데이터 기반",
          pages: 0,
          pdf: "",
          pageLabel: "등록 데이터",
          prompts: [
            { icon: "✓", question: "신청 자격을 알려주세요" },
            { icon: "₩", question: "지원 금액을 알려주세요" },
            { icon: "▤", question: "신청 방법을 알려주세요" },
          ],
          survey: [],
        });
        setBusinesses(next);
        const sharedBusinessId = new URLSearchParams(window.location.search).get("business");
        setBusinessId(sharedBusinessId && next.some((item) => item.id === sharedBusinessId) ? sharedBusinessId : (next[0]?.id || ""));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!businessId || businessId === ADMIN_GUIDE_BUSINESS_ID || previewSettings) return;
    const controller = new AbortController();
    fetch(`/api/faq?businessId=${encodeURIComponent(businessId)}&view=questions`, { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((payload: { questions?: string[] }) => {
        const questions = [...new Set((payload.questions || []).map(value => value.trim()).filter(Boolean))];
        if (!questions.length) return;
        for (let index = questions.length - 1; index > 0; index--) {
          const selected = Math.floor(Math.random() * (index + 1));
          [questions[index], questions[selected]] = [questions[selected], questions[index]];
        }
        const icons = ["✓", "₩", "▤"];
        const prompts = questions.slice(0, 3).map((value, index) => ({ icon: icons[index], question: /[?？]$/.test(value) ? value : `${value}?` }));
        setBusinesses(current => current.map(item => item.id === businessId ? { ...item, prompts } : item));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [businessId, previewSettings]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("program-guide-chatbot-guidance");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const guidance = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
          setManuals((previous) => ({ ...previous, ...guidance }));
        }
      }
    } catch {
      // The chatbot still works when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!businessId) return;
    if (businessId === ADMIN_GUIDE_BUSINESS_ID) return;
    const controller = new AbortController();
    fetch(`/api/business-link?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { url?: string }) => {
        if (!controller.signal.aborted) setWebsiteLinks((previous) => ({ ...previous, [businessId]: typeof payload.url === "string" ? payload.url : "" }));
      })
      .catch(() => { if (!controller.signal.aborted) setWebsiteLinks((previous) => ({ ...previous, [businessId]: "" })); });
    return () => controller.abort();
  }, [businessId]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const selectedSurveyText = useMemo(() => new Set(selectedSurvey), [selectedSurvey]);

  function changeBusiness(next: BusinessId) {
    setBusinessId(next);
    setMessages([]);
    setQuestion("");
    setSelectedSurvey([]);
    sessionId.current = "";
  }

  async function copyShareLink() {
    if (!businessId) return;
    const shareUrl = new URL("/", window.location.origin);
    shareUrl.searchParams.set("business", businessId);
    if (siteSettings.updatedAt) shareUrl.searchParams.set("share", String(siteSettings.updatedAt));
    shareUrl.hash = "";
    try { await navigator.clipboard.writeText(shareUrl.toString()); }
    catch { console.error("share_copy_failed"); return; }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }

  async function ask(nextQuestion: string) {
    if (!businessId || previewSettings || conversationLimitReached || dailyLimitReached || messages.some(message => message.thinking)) return;
    const trimmed = maskIdentityNumbers(nextQuestion.trim());
    if (!trimmed || nextQuestion.length > 150) return;

    const id = nextId.current++;
    setQuestion("");
    setMessages((previous) => [...previous, { id, question: trimmed, thinking: true }]);

    try {
      sessionId.current ||= crypto.randomUUID();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, question: trimmed, sessionId: sessionId.current, history: completedMessages.map(message => ({ question: message.question, answer: message.answer!.text })) }),
      });
      const payload = await response.json() as { answer?: Answer; error?: string; code?: string };
      if (response.status === 429 && payload.code === "daily_question_limit") {
        setDailyLimitReached(true);
        setMessages(previous => previous.filter(message => message.id !== id));
        return;
      }
      if (!response.ok || !payload.answer) throw new Error(payload.error || "Answer request failed");

      setMessages((previous) =>
        previous.map((message) =>
          message.id === id ? { ...message, thinking: false, answer: payload.answer } : message,
        ),
      );
    } catch {
      const answer: Answer = { text: "답변을 만드는 중 문제가 생겼어요. 잠시 후 다시 질문해 주세요.", source: "", page: 0, confidence: 65, review: true };
      setMessages((previous) =>
        previous.map((message) => (message.id === id ? { ...message, thinking: false, answer } : message)),
      );
    }
  }

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    if (question.length > 150) return;
    ask(question);
  }

  function closeAdmin() {
    setAdminOpen(false);
    setSelectedSurvey([]);
  }

  function toggleSurvey(key: string) {
    setSelectedSurvey((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    );
  }

  function applySurvey() {
    const additions = business.survey.flatMap((group) => {
      const checked = group.answers.filter((answer) => selectedSurveyText.has(`${group.question}|${answer}`));
      if (!checked.length) return [];
      return [`Q. ${group.question}\n${checked.map((answer) => `A. ${answer}`).join("\n")}`];
    });

    if (additions.length) {
      setManualDraft((previous) => [previous.trim(), additions.join("\n\n")].filter(Boolean).join("\n\n"));
      setSelectedSurvey([]);
    }
  }

  function saveGuidance() {
    const next = { ...manuals, [businessId]: manualDraft };
    setManuals(next);
    try {
      window.localStorage.setItem("program-guide-chatbot-guidance", JSON.stringify(next));
    } catch {
      // Keep the current-session value even if storage is unavailable.
    }
    closeAdmin();
  }

  return (
    <main className="public-shell" style={{ "--orange": siteSettings.primaryColor, "--gold": siteSettings.primaryColor, "--hero-gradient-color": siteSettings.secondaryColor || "#808080" } as CSSProperties}>
      <header className="topbar">
        <a className="brand brand-logo" href="#" aria-label={`${siteSettings.organizationName} 사업 안내 챗봇 홈`}>
          <span className="brand-logo-media">{settingsLoaded && <img src={siteSettings.logoUrl} alt={siteSettings.organizationName} />}</span>
          <b>사업 안내 챗봇</b>
        </a>
        <a className="admin-link" href={previewSettings ? undefined : "/consultations"} aria-disabled={Boolean(previewSettings)}>
          챗봇 관리
        </a>
      </header>

      <div className="workspace">
        <section className="intro">
          <h1 className="configurable-headline">{siteSettings.mainHeadline.split("{기관명}").map((part, index) => <Fragment key={index}>{index > 0 && <span className="headline-brand">{siteSettings.organizationName}</span>}{part}</Fragment>)}</h1>

          {siteSettings.mainSubcopy && <p className="main-subcopy">{siteSettings.mainSubcopy}</p>}
          <label className="sr-only" htmlFor="document-select">상담할 사업</label>
          <div className="document-select-wrap">
            <select id="document-select" value={businessId} onChange={(event) => changeBusiness(event.target.value)}>
              {businesses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </div>

          {!isAdminGuide && <div className="homepage-slot">{websiteLinks[businessId] ? <a className="homepage-link" href={websiteLinks[businessId]} target="_blank" rel="noreferrer"><span>홈페이지 안내 보러가기</span></a> : <span className="homepage-link disabled" aria-disabled="true"><span>홈페이지 안내 보러가기</span></span>}</div>}
          <div className="home-utility-actions"><button className={`share-business${shareCopied ? " copied" : ""}`} type="button" disabled={!businessId} onClick={copyShareLink} aria-label="현재 사업 챗봇 링크 복사" title="현재 사업 링크 복사">{shareCopied ? "✓ 복사됨" : <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></svg>}</button><button className="privacy-home-button" type="button" onClick={() => setPrivacyOpen(true)}>개인정보처리방침</button></div>
        </section>

        <section className="chat" aria-label="사업 공고문 상담 채팅">
          <div className="conversation" ref={conversationRef}>
            <div className="welcome message-row assistant-row">
              <span className="bot small">✦</span>
              <article className="answer welcome-answer">
                <p><b>{business.name}</b>을 선택하셨어요.</p>
                <p>{isAdminGuide ? "API 없이도 운영 가이드의 기본 내용을 안내해 드려요. API를 연결하면 현재 계정에 허용된 운영 상태도 함께 확인할 수 있어요." : siteSettings.chatbotGreeting}</p>
              </article>
            </div>

            {!messages.length && (
              <div className="starter">
                <div className="prompts">
                  {business.prompts.map((prompt) => (
                    <button type="button" key={prompt.question} disabled={dailyLimitReached} onClick={() => ask(prompt.question)}>
                      {prompt.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="message-list" aria-live="polite">
              {messages.map((message) => (
                <div className="message-block" key={message.id}>
                  <div className="message-row user-row"><div className="user-message">{message.question}</div></div>
                  <div className="message-row assistant-row">
                    <span className="bot small">✦</span>
                    {message.thinking ? (
                      <div className="thinking" role="status" aria-label="자료를 확인하고 있어요">
                        <span /><span /><span /> 자료를 확인하고 있어요
                      </div>
                    ) : message.answer ? (
                      <article className={`answer${message.answer.review ? " review" : ""}`}>
                        <AnswerReveal answer={message.answer} />
                      </article>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {dailyLimitReached && <p className="conversation-limit" role="alert">오늘은 너무 많이 질문하셨어요. 내일 다시 해주세요.</p>}
          {!dailyLimitReached && conversationLimitReached && <p className="conversation-limit" role="alert">{CHAT_LIMIT_MESSAGE}</p>}
          {!conversationLimitReached && question.length > 150 && <p className="question-limit" role="alert">정확한 답변을 위해 150자 이내로 질문해주세요({question.length}/150)</p>}
          <form className={`composer${question.length > 150 ? " over-limit" : ""}${conversationLimitReached || dailyLimitReached ? " conversation-locked" : ""}`} onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor="question">공고문 질문</label>
            <input id="question" disabled={!businessId || conversationLimitReached || dailyLimitReached} placeholder={previewSettings || businessId ? (isAdminGuide ? "챗봇 운영 방법을 질문해 주세요" : siteSettings.chatPlaceholder ?? "선택한 사업에 대해 질문해 주세요") : "관리자 화면에서 사업을 먼저 등록해 주세요"} value={question} onChange={(event) => setQuestion(maskIdentityNumbers(event.target.value))} />
            {question && <button className="clear" type="button" aria-label="질문 지우기" onClick={() => setQuestion("")}>×</button>}
            <button className="send" disabled={!businessId || conversationLimitReached || dailyLimitReached || !question.trim() || question.length > 150 || messages.some(message => message.thinking)} aria-label="질문 보내기">➤</button>
          </form>
          <p className="notice">{isAdminGuide ? "운영 가이드와 현재 계정의 조회 권한 안에 있는 상태만 답변합니다." : "해당 사업과 관련 없는 내용은 답변하지 않습니다."}</p>
        </section>
      </div>

      {privacyOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPrivacyOpen(false)}>
          <section className="modal privacy-policy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-policy-title">
            <button className="modal-close" type="button" autoFocus aria-label="닫기" onClick={() => setPrivacyOpen(false)}>×</button>
            <h2 id="privacy-policy-title">개인정보처리방침</h2>
            <div className="privacy-policy-content">{privacyPolicyText}</div>
            <div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setPrivacyOpen(false)}>닫기</button></div>
          </section>
        </div>
      )}

      {adminOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAdmin()}>
          <section className="modal admin-modal" role="dialog" aria-modal="true" aria-label="데이터 관리">
            <button className="modal-close" type="button" aria-label="닫기" onClick={closeAdmin}>×</button>
            <div className="upload-icon">▤</div>
            <h2>데이터 관리</h2>
            <p className="admin-current">현재 선택: <b>{business.name}</b></p>

            <div className="admin-section">
              <label>PDF 공고문 업로드</label>
              <input
                className="sr-only"
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const name = event.target.files?.[0]?.name ?? "";
                  setUploadedNames((previous) => ({ ...previous, [businessId]: name }));
                }}
              />
              <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}>PDF 파일 선택</button>
              {uploadedNames[businessId] && <div className="manual-indicator">✓ 선택됨: {uploadedNames[businessId]}</div>}
              <small>텍스트 추출 가능한 PDF를 등록해 주세요.</small>
            </div>

            <div className="admin-section discovery-section">
              <label>AI 추가 안내 제안</label>
              <p className="section-description">공고문을 처음 접한 사람이 추가로 궁금해할 질문입니다. 실제 안내할 답변을 복수 선택하면 아래 수기 입력란에 자동으로 누적됩니다.</p>
              {business.survey.map((group) => (
                <fieldset className="discovery-card" key={group.question}>
                  <legend>Q. {group.question}</legend>
                  {group.answers.map((answer) => {
                    const key = `${group.question}|${answer}`;
                    return (
                      <label className="check-option" key={key}>
                        <input type="checkbox" checked={selectedSurvey.includes(key)} onChange={() => toggleSurvey(key)} />
                        <span>A. {answer}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              <button className="survey-save" type="button" disabled={!selectedSurvey.length} onClick={applySurvey}>선택 답변을 추가 안내에 반영</button>
              <small>반영 후 아래 입력란에서 내용을 자유롭게 수정할 수 있습니다.</small>
            </div>

            <div className="admin-section">
              <label htmlFor="manual-guidance">공고문에 없는 추가 안내 수기 입력</label>
              <textarea
                id="manual-guidance"
                placeholder={"예) 전화 상담 가능 시간은 평일 오전 10시~오후 5시입니다.\n예) 접수 완료 문자는 다음 영업일에 발송됩니다."}
                value={manualDraft}
                onChange={(event) => setManualDraft(event.target.value)}
              />
              <small>입력한 내용은 현재 선택한 사업에만 적용되며, 챗봇 답변 근거로 사용됩니다.</small>
            </div>

            <div className="admin-actions">
              <button className="cancel-button" type="button" onClick={closeAdmin}>취소</button>
              <button className="upload-button" type="button" onClick={saveGuidance}>안내 저장</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
