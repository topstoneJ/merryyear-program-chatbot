"use client";
import { useEffect, useState } from "react";
import { HomeClient, type SiteSettings } from "@/app/home-client";
export default function SettingsPreview() {
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      const key = new URLSearchParams(window.location.search).get("draft");
      const raw = key && sessionStorage.getItem(`settings-preview:${key}`);
      if (!raw) throw new Error("missing");
      setDraft(JSON.parse(raw));
    } catch { setError(true); }
  }, []);
  if (error) return <p>미리보기가 만료되었습니다. 설정에서 다시 열어 주세요.</p>;
  if (!draft) return <p>미리보기를 불러오는 중입니다.</p>;
  return <HomeClient previewSettings={draft} />;
}
