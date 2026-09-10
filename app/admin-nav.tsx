"use client";
import { useEffect, useState, type MouseEvent } from "react";
export default function AdminNav({ current }: { current: "consultations" | "knowledge" | "guide" | "settings" }) {
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("denied") === "settings") {
      url.searchParams.delete("denied");
      window.history.replaceState(window.history.state, "", url);
      window.alert("설정에 접근할 권한이 없습니다. 최고관리자에게 문의해 주세요.");
    }
  }, []);
  async function openSettings(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    try {
      const response = await fetch("/api/admin-access", { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/admin-login?returnTo=%2Fsettings"); return; }
      if (!response.ok) throw new Error("permission lookup failed");
      const result = await response.json();
      if (result.canManageSettings !== true) { window.alert("설정에 접근할 권한이 없습니다. 최고관리자에게 문의해 주세요."); return; }
      window.location.assign("/settings");
    } catch { window.alert("접근 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setChecking(false); }
  }
  return <div className="topbar-actions" aria-label="관리자 메뉴"><a className={`admin-link${current === "consultations" ? " active" : ""}`} href="/consultations">상담내역</a><a className={`admin-link${current === "knowledge" ? " active" : ""}`} href="/knowledge">사업별 관리</a><a className={`admin-link${current === "guide" ? " active" : ""}`} href="/guide">가이드</a><a className={`admin-link${current === "settings" ? " active" : ""}`} href="/settings" onClick={openSettings} aria-busy={checking}>설정</a></div>;
}
