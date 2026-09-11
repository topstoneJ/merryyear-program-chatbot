import { ADMIN_GUIDE_BUSINESS_ID, ADMIN_GUIDE_SECTIONS } from "@/app/admin-guide";

export default function GuidePanel() {
  return <div className="guide-panel">
    <section className="guide-connect-card">
      <div><span>관리자 전용</span><h2>가이드 챗봇 연결</h2><p>운영 방법과 현재 상태를 대화형으로 확인하려면 ‘가이드 챗봇’을 이용하세요. 로그인한 계정의 조회 권한 안에서만 답변해요.</p></div>
      <a className="knowledge-submit" href={`/?business=${encodeURIComponent(ADMIN_GUIDE_BUSINESS_ID)}`}>가이드 챗봇 열기</a>
      <small>API 키 없이도 가이드 문서의 기본 안내를 받을 수 있어요. 현재 운영 상태에 관한 AI 답변은 API 키가 필요해요. 가이드 대화는 상담내역에 저장되지 않아요.</small>
    </section>
    <section className="guide-heading"><h2><strong>사업 안내 챗봇 운영 가이드</strong></h2><p>항목을 선택하면 자세한 내용을 확인할 수 있어요.</p></section>
    <div className="guide-accordions">
      {ADMIN_GUIDE_SECTIONS.map((section, index) => <details key={section.title} open={index === 0}>
        <summary><span>{section.title}</span><i aria-hidden="true">＋</i></summary>
        <div className="guide-section-body">
          {!section.bullets && section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.steps && <ol>{section.steps.map((item, stepIndex) => <li key={item}>{item}{section.stepNotes?.filter(note => note.after === stepIndex + 1).map(note => <p className="guide-step-note" key={note.text}>- {note.text}</p>)}</li>)}</ol>}
          {section.bullets && <ul>{[...(section.paragraphs || []), ...section.bullets].map(item => <li key={item}>{item}</li>)}</ul>}
          {section.notes?.map(note => <p className="guide-note" key={note}>* {note}</p>)}
          {section.indented?.map(note => <p className="guide-note" key={note}>{note}</p>)}
        </div>
      </details>)}
    </div>
  </div>;
}
