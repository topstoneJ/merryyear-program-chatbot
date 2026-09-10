import type { CSSProperties } from "react";
import AdminNav from "@/app/admin-nav";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import GuidePanel from "./guide-panel";

export default async function GuidePage() {
  let primaryColor = "#f26a2e";
  try {
    const DB = await ensureKnowledgeSchema();
    const settings = await DB.prepare("SELECT primary_color FROM site_settings WHERE id = 'default'").first<{ primary_color: string }>();
    if (/^#[0-9a-f]{6}$/i.test(settings?.primary_color || "")) primaryColor = settings!.primary_color;
  } catch { /* Use the default brand color if settings are temporarily unavailable. */ }

  return <main className="settings-shell" style={{ "--brand-preview": primaryColor, "--orange": primaryColor, "--gold": primaryColor } as CSSProperties}>
    <header className="topbar knowledge-topbar">
      <a className="brand brand-logo" href="/" aria-label="열매나눔재단 사업 안내 챗봇 홈"><img src="/merryyear-logo.png" alt="열매나눔재단" width={210} height={53} /><b>사업 안내 챗봇</b></a>
      <AdminNav current="guide" />
    </header>
    <section className="settings-page">
      <section className="settings-heading"><h1>가이드</h1></section>
      <GuidePanel />
    </section>
  </main>;
}
