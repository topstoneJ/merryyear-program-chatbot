"use client";
import { ANSWER_OPTIONS, ANSWER_STYLES, type AnswerSettings } from "@/app/answer-settings";

import { ANSWER_FLOW as DECISION_FLOW } from "@/app/answer-rules";

const DISPLAY_RULES = [
  { title: "수행범위", description: "선택한 사업을 안내하지만 신청·승인·지급 등 실제 업무는 처리하지 않아요." },
  { title: "질문 이해", description: "질문의 의도 파악을 위해 대화 맥락을 반영하고, 필요한 내용은 추가로 물을 수 있어요." },
  { title: "판단 순서", description: "질문을 이해한 뒤 자료를 확인하고, 근거에 맞는 결론을 내려요." },
  { title: "자료 선택", description: "선택한 사업의 공개된 자료만 사용하고, 다른 사업의 내용은 섞지 않아요." },
  { title: "미확인 처리", description: "자료가 부족하거나 서로 다르면 추측하지 않고, 확인이 필요하다고 안내해요." },
  { title: "개인정보 보호", description: "불필요한 개인정보는 요구하지 않고 주민등록번호 등 고유식별정보가 입력되면 자동으로 마스킹해요." },
  { title: "수치 확인", description: "금액·날짜·기간·한도를 구분해 정확히 안내해요." },
  { title: "출처 위치", description: "출처를 표시할 때는 문의처와 모든 안내 뒤, 답변 가장 마지막에 표시해요." },
  { title: "담당자 연락처", description: "이메일 주소와 전화번호를 항상 함께 표시해요. 자료에 없는 항목은 확인되지 않음으로 안내해요." },
  { title: "답변 설정", description: "관리자가 선택한 길이·말투·형식을 적용하되 사실은 바꾸지 않아요." },
] as const;

export default function AnswerSettingsPanel({ value, onChange, disabled }: {
  value: AnswerSettings; onChange: (value: AnswerSettings) => void; disabled: boolean;
}) {
  const selectedOptionCount = ANSWER_OPTIONS.filter(option => value[option.key]).length;
  return <div className="answer-settings-panel">
    <section className="settings-card answer-settings-section answer-decision-map" aria-labelledby="decision-map-title">
      <div className="answer-section-heading"><h2 id="decision-map-title">챗봇 답변 판단 순서</h2><p>질문 해석부터 답변 확인까지의 처리 흐름이에요. 정확성·공개 범위·개인정보 규칙은 모든 단계에 적용돼요.</p></div>
      <ol className="decision-flow-list">{DECISION_FLOW.map(item => <li key={item.code}>
        <span className="decision-flow-step" aria-hidden="true">{item.step}</span>
        <div className="decision-flow-copy"><b>{item.question}</b><small>{item.note}</small></div>
        <span className={`decision-flow-result ${item.code}`}>{item.result}</span>
      </li>)}</ol>
    </section>
    <section className="settings-card answer-settings-section" aria-labelledby="answer-rules-title">
      <div className="answer-section-heading"><h2 id="answer-rules-title">기본 규칙</h2><p>정확성과 정보 보호를 위한 규칙으로, 해제할 수 없어요.</p></div>
      <div className="answer-table-scroll"><table className="answer-settings-table"><caption className="sr-only">챗봇 기본 규칙</caption><thead><tr><th scope="col">적용</th><th scope="col">챗봇의 규칙</th><th scope="col">쉬운 설명</th></tr></thead><tbody>{DISPLAY_RULES.map(rule => <tr key={rule.title}><td><input type="checkbox" checked disabled aria-label={`${rule.title}`} /></td><th scope="row">{rule.title}</th><td>{rule.description}</td></tr>)}</tbody></table></div>
    </section>
    <section className="settings-card answer-settings-section" aria-labelledby="answer-options-title">
      <div className="answer-section-heading"><h2 id="answer-options-title">답변 옵션</h2><p>희망하는 답변 방식을 최대 3개 체크해 주세요. 체크하지 않아도 꼭 필요한 내용은 맥락에 따라 포함될 수 있어요.</p></div>
      <div className="answer-table-scroll"><table className="answer-settings-table"><caption className="sr-only">기관별로 선택하는 답변 옵션 7개</caption><thead><tr><th scope="col">사용</th><th scope="col">챗봇의 안내 방식</th><th scope="col">체크하면 이렇게 달라져요</th></tr></thead><tbody>{ANSWER_OPTIONS.map(option => <tr key={option.key} className={value[option.key] ? "is-enabled" : ""}><td><input id={`answer-${option.key}`} type="checkbox" checked={value[option.key]} disabled={disabled || (!value[option.key] && selectedOptionCount >= 3)} aria-describedby={`answer-${option.key}-help`} onChange={event => { if (event.target.checked && selectedOptionCount >= 3) return; onChange({ ...value, [option.key]: event.target.checked }); }} /></td><th scope="row"><label htmlFor={`answer-${option.key}`}>{option.title}</label></th><td id={`answer-${option.key}-help`}>{option.description}</td></tr>)}</tbody></table></div>
    </section>
    <section className="settings-card answer-settings-section" aria-labelledby="answer-style-title">
      <div className="answer-section-heading"><h2 id="answer-style-title">답변 스타일</h2><p>항목별로 하나씩 선택해 주세요.</p></div>
      <div className="answer-style-grid">{ANSWER_STYLES.map(style => <fieldset key={style.key} disabled={disabled} className="answer-style-field"><legend>{style.title}</legend><p>{style.description}</p><div className="answer-style-options">{style.choices.map(([key, title]) => <label key={key} className={value[style.key] === key ? "selected" : ""}><input type="radio" name={`answer-${style.key}`} value={key} checked={value[style.key] === key} onChange={() => onChange({ ...value, [style.key]: key })} /><span>{title}</span></label>)}</div></fieldset>)}</div>
    </section>
  </div>;
}
