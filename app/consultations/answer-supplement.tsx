"use client";
import { useEffect, useState } from "react";

export default function AnswerSupplement({ consultationId }: { consultationId: string }) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");

  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/consultations/supplement?id=${encodeURIComponent(consultationId)}`, { cache: "no-store" })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!cancelled) { setContent(data.content); setSavedContent(data.content); setEnabled(data.enabled); setReady(true); } })
      .catch(error => { if (!cancelled) setMessage(error.message || "불러오지 못했습니다. 상담 세부내역을 다시 열어 주세요."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [consultationId]);
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/consultations/supplement", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: consultationId, content }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setContent(data.content); setSavedContent(data.content); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  return <div className="answer-supplement">
    <label htmlFor="answer-supplement-content">답변 보완</label>
    <textarea id="answer-supplement-content" value={content} maxLength={20000} disabled={loading || saving || !ready} onChange={event => { setContent(event.target.value); setMessage(""); }} placeholder={"답변에 추가할 내용이나 빼야 할 내용을 입력해 주세요.\n예) 추가할 내용: …\n빼야 할 내용: …"} />
    <small>해당 사업의 텍스트 자료와 연결됩니다. 사업별 관리에서 수정한 내용도 이곳에 반영됩니다.</small>
    {!enabled && <p className="conflict-warning">이 자료는 사업별 관리에서 비활성화되어 있습니다.</p>}
    <div className="supplement-actions"><button className="knowledge-submit" type="button" disabled={!ready || loading || saving || !content.trim() || content === savedContent} onClick={save}>{saving ? "저장 중…" : "답변 보완 저장"}</button></div>
    {(loading || message) && <p role="status">{loading ? "보완 내용을 불러오는 중…" : message}</p>}
  </div>;
}
