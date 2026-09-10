"use client";
import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [id, setId] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/knowledge";
    const response = await fetch("/api/admin-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password, returnTo }) });
    const payload = await response.json();
    if (response.ok) window.location.assign(payload.returnTo); else { setError(payload.error || "로그인하지 못했습니다."); setLoading(false); }
  }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}><a className="login-brand" href="/"><img src="/merryyear-logo.png" alt="열매나눔재단" /><b>사업 안내 챗봇</b></a><h1>관리자 로그인</h1><label className="field"><span>아이디</span><input autoComplete="username" value={id} onChange={event => setId(event.target.value)} /></label><label className="field"><span>비밀번호</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="knowledge-submit" disabled={loading || !id || !password}>{loading ? "확인하고 있어요…" : "로그인"}</button><a className="login-back" href="/">메인으로 돌아가기</a></form></main>;
}
