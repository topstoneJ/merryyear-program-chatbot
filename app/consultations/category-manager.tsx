"use client";
import { useEffect, useState } from "react";

export type Category = { id: string; name: string };
export default function CategoryManager({ categories, onChange, onClose }: { categories: Category[]; onChange: (items: Category[]) => void; onClose: () => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [removing, setRemoving] = useState("");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setNames(Object.fromEntries(categories.map(item => [item.id, item.name]))); }, [categories]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [busy, onClose]);
  async function save(action: string, id?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/consultation-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, name: action === "add" ? newName : names[id!], replacementId: replacement }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "질문 유형을 저장하지 못했습니다.");
      onChange(data.categories); setNewName(""); setRemoving(""); setReplacement("");
    } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="modal category-manager" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <button className="modal-close" type="button" aria-label="닫기" disabled={busy} onClick={onClose}>×</button>
      <h2 id="category-manager-title">질문 유형 관리</h2>
      <p className="category-help">모든 사업에 공통으로 적용됩니다. 이름을 수정하면 기존 상담에도 반영됩니다.</p>
      <div className="category-manage-list">{categories.map(item => <div key={item.id} className="category-manage-row">
        <input aria-label={`${item.name} 유형 이름`} maxLength={30} value={names[item.id] ?? item.name} disabled={busy} onChange={event => setNames({ ...names, [item.id]: event.target.value })} />
        <button type="button" disabled={busy || !names[item.id]?.trim() || names[item.id] === item.name} onClick={() => save("rename", item.id)}>수정</button>
        <button type="button" className="category-delete" disabled={busy || categories.length < 2} onClick={() => { setRemoving(item.id); setReplacement(""); setError(""); }}>삭제</button>
      </div>)}</div>
      {removing && <div className="category-removal"><p><b>{categories.find(item => item.id === removing)?.name}</b> 유형의 기존 상담과 자동 분류 결과를 다음 유형으로 옮깁니다.</p>
        <select aria-label="삭제할 유형의 상담을 옮길 유형" value={replacement} disabled={busy} onChange={event => setReplacement(event.target.value)}><option value="">옮길 유형 선택</option>{categories.filter(item => item.id !== removing).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <div><button type="button" disabled={busy} onClick={() => setRemoving("")}>취소</button><button type="button" className="danger-button" disabled={busy || !replacement} onClick={() => save("delete", removing)}>옮기고 삭제</button></div>
      </div>}
      <form className="category-add" onSubmit={event => { event.preventDefault(); if (!busy && newName.trim()) save("add"); }}><input aria-label="새 질문 유형" placeholder="새 질문 유형" maxLength={30} value={newName} disabled={busy} onChange={event => setNewName(event.target.value)} /><button type="submit" disabled={busy || !newName.trim()}>추가</button></form>
      <p className="category-help">새 유형은 상담 세부내역에서 선택해 지정할 수 있습니다. 유형은 최소 1개가 필요합니다.</p>
      {error && <p role="alert" className="conflict-warning">{error}</p>}
      <div className="modal-actions"><button className="knowledge-submit" type="button" disabled={busy} onClick={onClose}>{busy ? "저장 중…" : "확인"}</button></div>
    </section>
  </div>;
}
