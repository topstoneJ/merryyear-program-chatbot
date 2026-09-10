"use client";
import { useEffect, useState } from "react";
type Account = { id: string; username: string; businessIds: string[]; canViewConsultations: boolean; canDeleteConsultations: boolean; canManageSettings: boolean; isSuperAdmin: boolean };
type Business = { id: string; name: string };
const passwordGuide = "영어 대소문자, 특수기호 포함 8자 이상";
const validPassword = (value: string) => value.length >= 8 && value.length <= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[^a-zA-Z0-9]/.test(value);
export default function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]), [businesses, setBusinesses] = useState<Business[]>([]), [currentId, setCurrentId] = useState(""), [canManageSuperAdmins, setCanManageSuperAdmins] = useState(false);
  const [addOpen, setAddOpen] = useState(false), [username, setUsername] = useState(""), [password, setPassword] = useState(""), [selected, setSelected] = useState<string[]>([]), [canSettings, setCanSettings] = useState(false);
  const [canView, setCanView] = useState(false), [canDelete, setCanDelete] = useState(false), [canSuperAdmin, setCanSuperAdmin] = useState(false);
  const [passwordAccount, setPasswordAccount] = useState<Account | null>(null), [editUsername, setEditUsername] = useState(""), [currentPassword, setCurrentPassword] = useState(""), [newPassword, setNewPassword] = useState("");
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null), [deletePassword, setDeletePassword] = useState(""), [deleteError, setDeleteError] = useState(""), [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(""), [saving, setSaving] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/admin-accounts"), payload = await response.json();
      if (!response.ok) { setNotice(payload?.error || "계정 정보를 불러오지 못했습니다."); return false; }
      if (!Array.isArray(payload?.accounts) || !Array.isArray(payload?.businesses)) throw new Error("Invalid account response");
      setAccounts(payload.accounts); setBusinesses(payload.businesses); setCurrentId(payload.currentAccountId || ""); setCanManageSuperAdmins(Boolean(payload.canManageSuperAdmins));
      return true;
    } catch { setNotice("계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); return false; }
  }
  useEffect(() => { load(); }, []);
  function toggle(id: string, values: string[]) { return values.includes(id) ? values.filter(item => item !== id) : [...values, id]; }
  async function api(method: string, body?: unknown, id?: string) {
    try {
      const response = await fetch(`/api/admin-accounts${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload?.error || "처리하지 못했습니다."); return false; }
      return true;
    } catch { setNotice("처리 결과를 확인하지 못했어요. 계정 정보를 새로고침하여 확인해 주세요."); return false; }
  }
  function updateAccount(id: string, patch: Partial<Account>) { setAccounts(previous => previous.map(account => account.id === id ? { ...account, ...patch } : account)); setNotice("저장 버튼을 누르면 권한이 반영됩니다."); }
  async function savePermissions() {
    setSaving(true); setNotice("");
    try {
      for (const account of accounts) {
        if (!await api("PATCH", { id: account.id, businessIds: account.businessIds, canManageSettings: account.canManageSettings, canViewConsultations: account.canViewConsultations, canDeleteConsultations: account.canDeleteConsultations, isSuperAdmin: account.isSuperAdmin })) return;
      }
      if (await load()) setNotice("");
    } finally { setSaving(false); }
  }
  async function add() { if (!await api("POST", { username, password, businessIds: selected, canManageSettings: canSettings, canViewConsultations: canView, canDeleteConsultations: canDelete, isSuperAdmin: canSuperAdmin })) return; setAddOpen(false); setUsername(""); setPassword(""); setSelected([]); setCanSettings(false); setCanView(false); setCanDelete(false); setCanSuperAdmin(false); if (await load()) setNotice(""); }
  function openDelete(account: Account) { setDeleteAccount(account); setDeletePassword(""); setDeleteError(""); }
  function closeDelete() { if (deleting) return; setDeleteAccount(null); setDeletePassword(""); setDeleteError(""); }
  async function remove() {
    if (!deleteAccount || !deletePassword || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`/api/admin-accounts?id=${encodeURIComponent(deleteAccount.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: deletePassword }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "계정을 삭제하지 못했습니다.");
      setAccounts(previous => previous.filter(account => account.id !== deleteAccount.id));
      setDeleteAccount(null); setDeletePassword(""); setNotice("");
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "계정을 삭제하지 못했습니다. 다시 시도해 주세요."); }
    finally { setDeleting(false); }
  }
  function openPassword(account: Account) { setPasswordAccount(account); setEditUsername(account.username); setCurrentPassword(""); setNewPassword(""); setNotice(""); }
  async function changePassword() { if (!passwordAccount || !await api("PATCH", { id: passwordAccount.id, username: editUsername, currentPassword, newPassword })) return; setPasswordAccount(null); setEditUsername(""); setCurrentPassword(""); setNewPassword(""); setNotice(""); }
  return <section className="permissions-card account-manager">
    <div className="account-manager-heading"><div><h2>관리자 계정</h2></div><button className="business-add-button" type="button" aria-label="관리자 계정 추가" onClick={() => setAddOpen(true)}>＋</button></div>
    <div className="account-list">{accounts.map(account => <article key={account.id}><div className="account-title"><span className="permission-avatar">{account.username[0]?.toUpperCase()}</span><b>{account.username}{account.isSuperAdmin && <small>최고관리자</small>}{account.id === currentId && <small>현재 계정</small>}</b><div className="account-title-actions"><button type="button" onClick={() => openPassword(account)} aria-label={`${account.username} 수정`} title="관리자 수정"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" disabled={accounts.length <= 1 || account.id === currentId || account.isSuperAdmin} onClick={() => openDelete(account)} aria-label={`${account.username} 삭제`} title="계정 삭제"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div></div><div className="permission-options"><strong>1. 상담내역</strong><label><input type="checkbox" disabled={account.isSuperAdmin} checked={account.isSuperAdmin || account.canViewConsultations} onChange={e => updateAccount(account.id, { canViewConsultations: e.target.checked, ...(!e.target.checked ? { canDeleteConsultations: false } : {}) })} />상담내역 조회</label><label><input type="checkbox" disabled={account.isSuperAdmin || !account.canViewConsultations} checked={account.isSuperAdmin || account.canDeleteConsultations} onChange={e => updateAccount(account.id, { canDeleteConsultations: e.target.checked })} />상담내역 삭제</label><strong>2. 사업별 관리</strong>{businesses.map(business => <label key={business.id}><input type="checkbox" disabled={account.isSuperAdmin} checked={account.isSuperAdmin || account.businessIds.includes(business.id)} onChange={() => updateAccount(account.id, { businessIds: toggle(business.id, account.businessIds) })} />{business.name}</label>)}<strong>3. 설정</strong><label><input type="checkbox" disabled={account.isSuperAdmin} checked={account.isSuperAdmin || account.canManageSettings} onChange={() => updateAccount(account.id, { canManageSettings: !account.canManageSettings })} />설정화면 접근</label><label><input type="checkbox" disabled={!canManageSuperAdmins} checked={account.isSuperAdmin} onChange={e => updateAccount(account.id, { isSuperAdmin: e.target.checked })} />최고관리자</label></div></article>)}</div>
    <div className="account-save-actions"><button className="knowledge-submit" type="button" disabled={saving} onClick={savePermissions}>{saving ? "저장하고 있어요…" : "권한 저장"}</button></div>{notice && <p className="settings-notice">{notice}</p>}
    {addOpen && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setAddOpen(false)}><section className="modal account-add-modal"><button className="modal-close" type="button" onClick={() => setAddOpen(false)}>×</button><h2>관리자 계정 추가</h2><div className="account-fields"><label><span>아이디</span><input autoFocus maxLength={60} value={username} onChange={e => setUsername(e.target.value)} /></label><label><span>비밀번호</span><input type="password" maxLength={20} value={password} onChange={e => setPassword(e.target.value)} placeholder={passwordGuide} /></label></div><div className="permission-options"><strong>1. 상담내역</strong><label><input type="checkbox" disabled={canSuperAdmin} checked={canSuperAdmin || canView} onChange={e => { setCanView(e.target.checked); if (!e.target.checked) setCanDelete(false); }} />상담내역 조회</label><label><input type="checkbox" disabled={canSuperAdmin || !canView} checked={canSuperAdmin || canDelete} onChange={e => setCanDelete(e.target.checked)} />상담내역 삭제</label><strong>2. 사업별 관리</strong>{businesses.map(business => <label key={business.id}><input type="checkbox" disabled={canSuperAdmin} checked={canSuperAdmin || selected.includes(business.id)} onChange={() => setSelected(toggle(business.id, selected))} />{business.name}</label>)}<strong>3. 설정</strong><label><input type="checkbox" disabled={canSuperAdmin} checked={canSuperAdmin || canSettings} onChange={e => setCanSettings(e.target.checked)} />설정화면 접근</label><label><input type="checkbox" disabled={!canManageSuperAdmins} checked={canSuperAdmin} onChange={e => setCanSuperAdmin(e.target.checked)} />최고관리자</label></div><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setAddOpen(false)}>취소</button><button className="knowledge-submit" type="button" disabled={!username || !validPassword(password)} onClick={add}>추가</button></div></section></div>}
    {deleteAccount && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && closeDelete()}><section className="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title"><button className="modal-close" type="button" disabled={deleting} aria-label="닫기" onClick={closeDelete}>×</button><h2 id="delete-account-title">계정 삭제</h2><p><b>{deleteAccount.username}</b> 계정을 삭제하시겠습니까?</p><label className="field"><span>현재 로그인한 계정의 비밀번호</span><input autoFocus type="password" autoComplete="current-password" value={deletePassword} disabled={deleting} onChange={e => setDeletePassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void remove(); } }} /></label>{deleteError && <p className="answer-settings-error" role="alert">{deleteError}</p>}<div className="modal-actions"><button type="button" className="cancel-button" disabled={deleting} onClick={closeDelete}>취소</button><button type="button" className="knowledge-submit" disabled={!deletePassword || deleting} onClick={() => void remove()}>{deleting ? "삭제 중…" : "계정 삭제"}</button></div></section></div>}
    {passwordAccount && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setPasswordAccount(null)}><section className="modal password-modal"><button className="modal-close" type="button" onClick={() => setPasswordAccount(null)}>×</button><h2>관리자 수정</h2><label className="field"><span>아이디</span><input autoFocus maxLength={60} autoComplete="username" value={editUsername} onChange={e => setEditUsername(e.target.value)} /></label><label className="field"><span>기존 비밀번호</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label><label className="field"><span>새 비밀번호</span><input type="password" maxLength={20} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={passwordGuide} /></label><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setPasswordAccount(null)}>취소</button><button className="knowledge-submit" type="button" disabled={!currentPassword || !editUsername || (newPassword.length > 0 && !validPassword(newPassword)) || (editUsername === passwordAccount.username && !newPassword)} onClick={changePassword}>변경사항 저장</button></div></section></div>}
  </section>;
}
