"use client";

import type { ConflictReport, ConflictEvidence } from "@/db/conflict-check";

export default function ConflictPanel({ sourceId, report, busy, error }: {
  sourceId: string; report: ConflictReport | null; busy: boolean; error: string;
}) {
  const conflicts = report?.conflicts.filter((c) => c.left.sourceId === sourceId || c.right.sourceId === sourceId) || [];
  const unavailable = report?.unavailableIds.includes(sourceId);
  function excerpt(e: ConflictEvidence, label: string) {
    const doc = report?.documents.find((d) => d.id === e.sourceId);
    const part = doc?.parts.find((p) => p.id === e.partId);
    return <div className="conflict-excerpt"><small>{label}</small><strong>{doc?.title}{doc && !doc.enabled ? " · 사용 중지" : ""}</strong><span>{part?.title}{part?.pages.length ? ` · ${part.pages.join(", ")}쪽` : ""}</span><blockquote>{e.quote}</blockquote></div>;
  }
  return <section className="conflict-panel" role="tabpanel" id="conflict-panel" aria-labelledby="conflict-tab">
    <p className="conflict-scope">저장된 내용을 같은 사업의 다른 등록 데이터와 비교합니다. 사용 중지된 자료도 포함됩니다. 수정 중인 내용은 저장 후 검사합니다.</p>
    {busy ? <p role="status">다른 데이터와 충돌하는지 확인하고 있습니다…</p> : error ? <div role="alert"><p>{error}</p><p>데이터를 추가·수정·삭제하면 다시 검사합니다.</p></div> : !report ? <><p>저장된 검사 결과가 없습니다. 데이터를 추가·수정·삭제하면 검사합니다.</p></> : <>
      <p className="conflict-checked">검사 시각: {new Date(report.checkedAt).toLocaleString("ko-KR")}</p>
      {unavailable ? <p className="conflict-warning">이 자료는 내용을 읽을 수 없어 비교하지 못했습니다. 데이터를 확인해 주세요.</p> : <>
        {conflicts.length ? <><h3 className="conflict-warning">충돌 의심 {conflicts.length}건 · 확인 필요</h3>{conflicts.map((c, index) => {
          const current = c.left.sourceId === sourceId ? c.left : c.right;
          const other = c.left.sourceId === sourceId ? c.right : c.left;
          const otherDoc = report.documents.find((d) => d.id === other.sourceId);
          const otherPart = otherDoc?.parts.find((p) => p.id === other.partId);
          return <article className="conflict-card" key={index}><h4>‘{otherDoc?.title}’의 ‘{otherPart?.title}’ 부분과 충돌하는 것으로 의심됨. 확인 필요</h4><p>{c.reason}</p><div className="conflict-comparison">{excerpt(current, "현재 데이터")}{excerpt(other, "다른 데이터")}</div></article>;
        })}</> : <p className="conflict-clear">{report.documents.length < 2 ? "비교할 다른 데이터가 없습니다." : "비교한 데이터에서 충돌 의심 없음."}</p>}
        {report.unavailableIds.length > 0 && <p className="conflict-warning">내용을 읽을 수 없는 자료 {report.unavailableIds.length}건은 비교하지 못했습니다.</p>}
        <p className="conflict-scope">의심 항목이 발견되었으면 정확한 정보를 확인하고 원문을 수정해 주세요.</p>
      </>}
    </>}
  </section>;
}
