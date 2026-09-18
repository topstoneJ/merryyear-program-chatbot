"use client";
import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AdminNav from "@/app/admin-nav";
import ApiManagementPanel from "./api-management-panel";
import AccountManager from "@/app/settings/account-manager";
import AnswerSettingsPanel from "@/app/settings/answer-settings-panel";
import { type AnswerSettings } from "@/app/answer-settings";
import BrandImageUpload from "./brand-image-upload";
import { createDefaultSocialImage } from "./default-social-image";
import { syncBrowserBranding } from "../browser-branding";
type Settings = { organizationName: string; contact: string; logoUrl: string; faviconUrl: string; socialImageUrl: string; socialCaption: string; mainHeadline: string; mainSubcopy: string; chatbotGreeting: string; chatPlaceholder: string; privacyPolicy: string; primaryColor: string; secondaryColor: string; apiKey?: string; apiKeyConfigured?: boolean };

async function whiteImage(name: string, width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("이미지를 초기화하지 못했습니다.");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("이미지를 초기화하지 못했습니다.");
  return new File([blob], name, { type: "image/png" });
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null), [tab, setTab] = useState<"general" | "design" | "answers" | "api" | "account">("general");
  const [answerSettings, setAnswerSettings] = useState<AnswerSettings | null>(null);
  const [savedAnswers, setSavedAnswers] = useState<AnswerSettings | null>(null);
  const [answerLoading, setAnswerLoading] = useState(true), [answerError, setAnswerError] = useState("");
  const [answerSaving, setAnswerSaving] = useState(false), [answerNotice, setAnswerNotice] = useState("");
  const answerDirty = useMemo(() => JSON.stringify(answerSettings) !== JSON.stringify(savedAnswers), [answerSettings, savedAnswers]);
  async function loadAnswers() {
    setAnswerLoading(true); setAnswerError("");
    try { const response = await fetch("/api/answer-settings", { cache: "no-store" }); const payload = await response.json(); if (!response.ok || !payload.settings) throw new Error(payload.error || "답변 설정을 불러오지 못했습니다."); setAnswerSettings(payload.settings); setSavedAnswers(payload.settings); }
    catch (error) { setAnswerError(error instanceof Error ? error.message : "답변 설정을 불러오지 못했습니다."); }
    finally { setAnswerLoading(false); }
  }
  useEffect(() => { if (tab === "answers" && !answerSettings) void loadAnswers(); }, [tab, answerSettings]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (answerDirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [answerDirty]);
  async function saveAnswers(event: FormEvent) {
    event.preventDefault(); if (!answerSettings || answerSaving) return;
    setAnswerSaving(true); setAnswerNotice(""); setAnswerError("");
    try { const response = await fetch("/api/answer-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answerSettings) }); const payload = await response.json(); if (!response.ok || !payload.settings) throw new Error(payload.error || "답변 설정을 저장하지 못했습니다."); setAnswerSettings(payload.settings); setSavedAnswers(payload.settings); setAnswerNotice(""); }
    catch (error) { setAnswerError(error instanceof Error ? error.message : "답변 설정을 저장하지 못했습니다."); }
    finally { setAnswerSaving(false); }
  }
  const [previewId, setPreviewId] = useState("");
  const [privacyEditorOpen, setPrivacyEditorOpen] = useState(false);
  const [privacyDraft, setPrivacyDraft] = useState("");
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyRefreshing, setPrivacyRefreshing] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState("");
  const previewLogo = useRef("");
  function closePreview() {
    if (previewId) sessionStorage.removeItem(`settings-preview:${previewId}`);
    if (previewLogo.current) URL.revokeObjectURL(previewLogo.current);
    previewLogo.current = ""; setPreviewId("");
  }
  function openPreview() {
    if (!settings) return;
    const id = crypto.randomUUID();
    if (logo) previewLogo.current = URL.createObjectURL(logo);
    const { organizationName, contact, logoUrl, mainHeadline, mainSubcopy, chatbotGreeting, chatPlaceholder, privacyPolicy, primaryColor, secondaryColor } = settings;
    try {
      sessionStorage.setItem(`settings-preview:${id}`, JSON.stringify({ organizationName, contact, logoUrl: previewLogo.current || logoUrl, mainHeadline, mainSubcopy, chatbotGreeting, chatPlaceholder, privacyPolicy, primaryColor, secondaryColor }));
      setPreviewId(id);
    } catch { if (previewLogo.current) URL.revokeObjectURL(previewLogo.current); previewLogo.current = ""; setNotice("미리보기를 열지 못했습니다. 브라우저 저장 공간을 확인해 주세요."); }
  }
  const [logo, setLogo] = useState<File | null>(null);
  const [logoDisplayUrl, setLogoDisplayUrl] = useState("");
  const [favicon, setFavicon] = useState<File | null>(null);
  const [socialImage, setSocialImage] = useState<File | null>(null);
  const [generatingDefault, setGeneratingDefault] = useState(false);
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!logo) { setLogoDisplayUrl(""); return; }
    const url = URL.createObjectURL(logo); setLogoDisplayUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);
  useEffect(() => { fetch("/api/settings").then(r => { if (!r.ok) throw new Error("settings_load_failed"); return r.json(); }).then(payload => { setSettings(payload.settings); }).catch(() => setNotice("설정을 불러오지 못했습니다. 새로고침해 주세요.")); }, []);
  async function registerDefaultSocialImage() {
    if (saving || generatingDefault) return;
    setGeneratingDefault(true); setNotice("");
    try {
      const file = await createDefaultSocialImage(logoDisplayUrl || settings?.logoUrl);
      const form = new FormData(); form.set("action", "social-image-only"); form.set("socialCaption", settings?.socialCaption || ""); form.set("socialImage", file);
      const response = await fetch("/api/settings", { method: "PATCH", body: form });
      const payload = await response.json();
      if (!response.ok || !payload.settings) throw new Error(payload.error || "기본 이미지를 등록하지 못했습니다.");
      setSettings(previous => previous ? { ...previous, socialImageUrl: payload.settings.socialImageUrl, socialCaption: payload.settings.socialCaption } : previous);
      setSocialImage(null);
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "기본 이미지를 등록하지 못했습니다. 다시 시도해 주세요."); }
    finally { setGeneratingDefault(false); }
  }
  function openPrivacyEditor() {
    if (!settings) return;
    setPrivacyDraft(settings.privacyPolicy || "");
    setPrivacyNotice("");
    setPrivacyEditorOpen(true);
  }
  async function savePrivacyPolicy() {
    if (!settings || privacySaving) return;
    setPrivacySaving(true); setPrivacyNotice("");
    try {
      const form = new FormData(); form.set("action", "privacy-policy-only"); form.set("privacyPolicy", privacyDraft);
      const response = await fetch("/api/settings", { method: "PATCH", body: form });
      const payload = await response.json();
      if (!response.ok || !payload.settings) throw new Error(payload.error || "개인정보처리방침을 저장하지 못했습니다.");
      setSettings({ ...payload.settings, apiKey: "" });
      setPrivacyEditorOpen(false);
      setPrivacyNotice("개인정보처리방침을 저장했습니다.");
    } catch (error) { setPrivacyNotice(error instanceof Error ? error.message : "개인정보처리방침을 저장하지 못했습니다."); }
    finally { setPrivacySaving(false); }
  }
  async function refreshPrivacyPolicy() {
    if (privacySaving || privacyRefreshing) return;
    setPrivacyRefreshing(true); setPrivacyNotice("");
    try {
      const form = new FormData(); form.set("action", "privacy-policy-refresh"); form.set("privacyPolicy", privacyDraft);
      const response = await fetch("/api/settings", { method: "PATCH", body: form });
      const payload = await response.json();
      if (!response.ok || typeof payload.draft !== "string") throw new Error(payload.error || "수정본을 만들지 못했습니다.");
      setPrivacyDraft(payload.draft);
      setPrivacyNotice("현재 내용은 유지하고 서버와 API 연결 상태를 반영한 수정본을 만들었습니다. 확인 후 저장해 주세요.");
    } catch (error) { setPrivacyNotice(error instanceof Error ? error.message : "수정본을 만들지 못했습니다."); }
    finally { setPrivacyRefreshing(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings || saving || generatingDefault) return; setSaving(true); setNotice("");
    try {
      const form = new FormData();
      for (const key of ["organizationName", "contact", "mainHeadline", "mainSubcopy", "chatbotGreeting", "chatPlaceholder", "primaryColor", "secondaryColor"] as const) form.set(key, settings[key]);
      if (logo) form.set("logo", logo);
      if (favicon) form.set("favicon", favicon);
      form.set("socialCaption", settings.socialCaption || "");
      if (socialImage) form.set("socialImage", socialImage);
      const response = await fetch("/api/settings", { method: "PATCH", body: form }), payload = await response.json();
      if (!response.ok || !payload.settings) throw new Error(payload.error || "설정을 저장하지 못했습니다.");
      setSettings({ ...payload.settings, apiKey: "" }); setLogo(null); setFavicon(null); setSocialImage(null);
      syncBrowserBranding(payload.settings);
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "설정을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  }
  if (!settings) return <main className="settings-shell"><div className="knowledge-empty">{!notice && <span className="loading-ring" />}<b>{notice || "설정을 불러오고 있어요"}</b></div></main>;
  return <main className="settings-shell" style={{ "--brand-preview": settings.primaryColor, "--orange": settings.primaryColor, "--gold": settings.primaryColor } as CSSProperties}>
    <header className="topbar knowledge-topbar"><a className="brand brand-logo" href="/"><img src={settings.logoUrl} alt={settings.organizationName} /><b>사업 안내 챗봇</b></a><AdminNav current="settings" /></header>
    <form className="settings-page" onSubmit={tab === "answers" ? saveAnswers : (tab === "general" || tab === "design") ? save : event => event.preventDefault()}><section className="settings-heading"><h1>설정</h1></section>
      <nav className="settings-tabs" aria-label="설정 메뉴"><button type="button" aria-pressed={tab === "general"} className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>기본 설정</button><button type="button" aria-pressed={tab === "design"} className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}>디자인 설정</button><button type="button" aria-pressed={tab === "answers"} className={tab === "answers" ? "active" : ""} onClick={() => setTab("answers")}>답변 관리</button><button type="button" aria-pressed={tab === "api"} className={tab === "api" ? "active" : ""} onClick={() => setTab("api")}>API 관리</button><button type="button" aria-pressed={tab === "account"} className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}>관리자 계정</button></nav>
      {tab === "general" ? <div className="settings-grid">
        <section className="settings-card"><h2>기관 정보</h2><label className="field"><span>기관명</span><input value={settings.organizationName} onChange={e => setSettings({ ...settings, organizationName: e.target.value })} /></label><label className="field"><span>연락처</span><input value={settings.contact} onChange={e => setSettings({ ...settings, contact: e.target.value })} placeholder="전화번호 또는 이메일" /></label></section>
        <section className="settings-card"><h2>메인 화면</h2><label className="field"><span>메인 페이지 문구</span><textarea value={settings.mainHeadline} onChange={e => setSettings({ ...settings, mainHeadline: e.target.value })} /><small className="field-help">&#123;기관명&#125;을 입력하면 기관 정보와 자동 연동되며 브랜드 컬러로 강조됩니다.</small></label><label className="field"><span>메인 보조 문구</span><textarea value={settings.mainSubcopy} onChange={e => setSettings({ ...settings, mainSubcopy: e.target.value })} /></label></section>
        <section className="settings-card settings-card-wide"><h2>채팅화면</h2><div className="chat-settings-row"><label className="field"><span>챗봇 기본 안내문</span><textarea value={settings.chatbotGreeting} onChange={e => setSettings({ ...settings, chatbotGreeting: e.target.value })} /></label><label className="field"><span>채팅창 내 기본 문구</span><input value={settings.chatPlaceholder ?? "선택한 사업에 대해 질문해 주세요"} maxLength={150} onChange={e => setSettings({ ...settings, chatPlaceholder: e.target.value })} /><small className="field-help">질문을 입력하기 전에 채팅 입력창에 표시되는 문구입니다.</small></label></div></section>
        <section className="settings-card settings-card-wide privacy-settings-card"><div><h2>개인정보처리방침</h2><p>메인 화면 하단 버튼을 누르면 표시되는 내용을 관리합니다. <b>{'{기관명}'}</b>과 <b>{'{연락처}'}</b>는 기관 정보에 맞춰 자동 표시됩니다.</p></div><button className="cancel-button" type="button" onClick={openPrivacyEditor}>내용 편집</button></section>
        {privacyNotice && <p className="settings-notice settings-card-wide" role="status">{privacyNotice}</p>}
      </div> : tab === "design" ? <div className="settings-grid">
        <section className="settings-card design-logo-card"><h2>기관 로고</h2><div className="field"><input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={e => setLogo(e.target.files?.[0] || null)} /><div className="design-control-row"><button className="cancel-button design-reset-button" type="button" disabled={saving} onClick={() => void whiteImage("white-logo.png", 420, 106).then(setLogo)}>초기화</button><button className="logo-upload" type="button" onClick={() => fileRef.current?.click()}><img src={logoDisplayUrl || settings.logoUrl} alt="로고 미리보기" /><span><b>{logo?.name || "현재 기관 로고"}</b><small>PNG·JPG·WEBP, 최대 3MB</small></span><strong>변경</strong></button></div></div></section>
        <section className="settings-card design-color-card"><h2>브랜드 컬러</h2><div className="brand-colors-row"><div className="design-control-row"><button className="cancel-button design-reset-button" type="button" disabled={saving} onClick={() => setSettings({ ...settings, primaryColor: "#ffffff" })}>초기화</button><label className="color-setting"><input type="color" aria-label="메인 컬러" value={settings.primaryColor} onChange={e => setSettings({ ...settings, primaryColor: e.target.value })} /><span><b>메인 컬러</b><small>{settings.primaryColor}</small></span><i /></label></div>
          <div className="secondary-color-control"><div className="design-control-row"><button className="cancel-button design-reset-button" type="button" aria-label="서브컬러 초기화" disabled={saving} onClick={() => setSettings({ ...settings, secondaryColor: "#808080" })}>초기화</button><label className="color-setting"><input type="color" aria-label="서브컬러" aria-describedby="secondary-color-help" value={settings.secondaryColor || "#808080"} onChange={e => setSettings({ ...settings, secondaryColor: e.target.value })} /><span><b>서브컬러</b><small>{settings.secondaryColor || "#808080"}</small></span><i style={{ background: settings.secondaryColor || "#808080" }} /></label></div><p id="secondary-color-help" className="field-help">메인화면 타이틀 뒤 그라데이션에만 적용됩니다.</p></div></div>
        </section>
        <section className="settings-card design-favicon-card"><h2>브라우저 탭 아이콘</h2>
          <BrandImageUpload title="브라우저 탭 아이콘" hint="PNG·JPG·WEBP, 최대 3MB" currentUrl={settings.faviconUrl} value={favicon} onChange={setFavicon} disabled={saving} onReset={() => void whiteImage("white-favicon.png", 64, 64).then(setFavicon)} />
        </section>
        <section className="settings-card brand-images-card"><h2>링크 공유 썸네일</h2>
          <BrandImageUpload title="링크 공유 썸네일" hint="카카오톡·SNS 등에 링크를 공유할 때 표시돼요. 1200 × 630px 권장 · PNG·JPG·WEBP, 최대 3MB" currentUrl={settings.socialImageUrl} value={socialImage} onChange={setSocialImage} disabled={saving || generatingDefault} wide onDefault={() => void registerDefaultSocialImage()} onReset={() => void whiteImage("white-thumbnail.png", 1200, 630).then(setSocialImage)} generating={generatingDefault} />
          <label className="field"><span>썸네일 하단 문구</span><input value={settings.socialCaption || ""} disabled={saving || generatingDefault} onChange={e => setSettings({ ...settings, socialCaption: Array.from(e.target.value.normalize("NFC")).slice(0, 20).join("") })} placeholder="외부 링크 공유 시 표시할 문구" /><small className="field-help">{Array.from(settings.socialCaption || "").length}/20자 · 외부 링크 공유 시 썸네일 아래 설명으로 표시됩니다. 이미지 안에는 들어가지 않습니다.</small></label>
          <p className="field-help">이미지를 선택한 후 ‘설정 저장’을 눌러 주세요. 이미 공유한 링크는 서비스의 캐시가 갱신된 뒤 새 이미지가 표시될 수 있어요.</p>
        </section>
      </div> : tab === "answers" ? <>
        {answerLoading ? <div className="knowledge-empty" role="status"><span className="loading-ring" /><b>답변 설정을 불러오고 있어요</b></div> : answerSettings ? <AnswerSettingsPanel value={answerSettings} disabled={answerSaving} onChange={value => { setAnswerSettings(value); setAnswerNotice(""); }} /> : <button type="button" className="cancel-button" onClick={() => void loadAnswers()}>다시 불러오기</button>}
        {answerError && <p className="answer-settings-error" role="alert">{answerError}</p>}
        {answerNotice && <p className="settings-notice" role="status">{answerNotice}</p>}
        {answerSettings && <div className="settings-actions answer-settings-actions"><span role="status">{answerDirty ? "저장하지 않은 변경사항이 있어요" : "저장된 설정입니다"}</span><button type="button" className="cancel-button" disabled={answerSaving || !answerDirty} onClick={() => { if (savedAnswers) setAnswerSettings({ ...savedAnswers }); setAnswerNotice(""); setAnswerError(""); }}>변경 취소</button><button type="submit" className="knowledge-submit" disabled={answerSaving || !answerDirty}>{answerSaving ? "저장하고 있어요…" : "답변 설정 저장"}</button></div>}
      </> : tab === "api" ? <ApiManagementPanel /> : <AccountManager />}
      {(tab === "general" || tab === "design") && notice && <p className="settings-notice">{notice}</p>}{(tab === "general" || tab === "design") && <div className="settings-actions"><button type="button" className="cancel-button" onClick={openPreview}>메인 미리보기</button><button type="submit" className="knowledge-submit" disabled={saving}>{saving ? "저장하고 있어요…" : "설정 저장"}</button></div>}
    </form>
    {previewId && <div className="settings-preview-screen" role="dialog" aria-modal="true" aria-label="메인 미리보기"><div className="settings-preview-toolbar"><span>저장 전 미리보기 · 실제 설정은 변경되지 않습니다. 채팅 전송은 지원하지 않습니다.</span><button type="button" className="cancel-button" onClick={closePreview}>설정으로 돌아가기</button></div><iframe title="수정 내용이 반영된 메인 미리보기" src={`/settings/preview?draft=${encodeURIComponent(previewId)}`} /></div>}
    {privacyEditorOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && !privacySaving && !privacyRefreshing && setPrivacyEditorOpen(false)}><section className="modal privacy-editor-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-editor-title"><button type="button" className="modal-close" aria-label="닫기" disabled={privacySaving || privacyRefreshing} onClick={() => setPrivacyEditorOpen(false)}>×</button><h2 id="privacy-editor-title">개인정보처리방침</h2><textarea value={privacyDraft} maxLength={20_000} disabled={privacyRefreshing} onChange={event => { setPrivacyDraft(event.target.value); setPrivacyNotice(""); }} aria-label="개인정보처리방침 내용" /><div className="privacy-editor-meta"><span>{privacyDraft.length.toLocaleString("ko-KR")}/20,000자</span><span>{'{기관명}'}, {'{연락처}'} 사용 가능</span></div>{privacyNotice && <p className="privacy-editor-error" role="status">{privacyNotice}</p>}<div className="modal-actions"><button type="button" className="cancel-button" disabled={privacySaving || privacyRefreshing} onClick={() => void refreshPrivacyPolicy()}>{privacyRefreshing ? "수정본 생성 중…" : "새로고침"}</button><button type="button" className="cancel-button" disabled={privacySaving || privacyRefreshing} onClick={() => setPrivacyEditorOpen(false)}>취소</button><button type="button" className="knowledge-submit" disabled={privacySaving || privacyRefreshing || privacyDraft.trim().length < 20} onClick={() => void savePrivacyPolicy()}>{privacySaving ? "저장하고 있어요…" : "내용 저장"}</button></div></section></div>}
  </main>;
}
