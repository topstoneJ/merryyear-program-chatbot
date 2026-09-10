"use client";
import { useEffect, useRef, useState } from "react";
import type { ConflictReport } from "@/db/conflict-check";
import { checkAfterMutation } from "./conflict-client";

export function useConflictReport(businessId: string) {
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const currentBusiness = useRef(businessId);
  currentBusiness.current = businessId;
  const queues = useRef(new Map<string, Promise<void>>());
  useEffect(() => {
    const requestId = ++sequence.current;
    let disposed = false;
    setReport(null); setError(""); setBusy(false);
    if (!businessId) return;
    fetch(`/api/knowledge/conflicts?businessId=${encodeURIComponent(businessId)}`, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("저장된 검사 결과를 불러오지 못했습니다."); return response.json(); })
      .then(payload => { if (!disposed && requestId === sequence.current) setReport(payload.report || null); })
      .catch(error => { if (!disposed && requestId === sequence.current) setError(error.message); });
    return () => { disposed = true; };
  }, [businessId]);

  // Called only after a successful data write, never by a sources/render effect.
  function changed(changedBusinessId: string) {
    const requestId = ++sequence.current;
    const visible = () => currentBusiness.current === changedBusinessId && requestId === sequence.current;
    if (visible()) { setBusy(true); setError(""); setReport(null); }
    const previous = queues.current.get(changedBusinessId) || Promise.resolve();
    const job = previous.then(async () => {
      try { const result = await checkAfterMutation(changedBusinessId); if (visible()) setReport(result); }
      catch (error) { if (visible()) setError(error instanceof Error ? error.message : "검사 결과를 확인해 주세요."); }
      finally { if (visible()) setBusy(false); }
    });
    queues.current.set(changedBusinessId, job);
    void job.finally(() => { if (queues.current.get(changedBusinessId) === job) queues.current.delete(changedBusinessId); });
  }
  return { report, busy, error, changed };
}
