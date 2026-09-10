"use client";
import { ANSWER_OPTIONS, ANSWER_STYLES, type AnswerSettings } from "@/app/answer-settings";

import { ANSWER_FLOW as DECISION_FLOW, ANSWER_RULE_GROUPS as RULE_GROUPS } from "@/app/answer-rules";

export default function AnswerSettingsPanel({ value, onChange, disabled }: {
  value: AnswerSettings; onChange: (value: AnswerSettings) => void; disabled: boolean;
}) {
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
      {RULE_GROUPS.map(group => <div className="answer-rule-group" key={group.title}>
        <h3>{group.title}</h3><p>{group.description}</p>
        <div className="answer-table-scroll"><table className="answer-settings-table"><caption className="sr-only">{group.title} 규칙</caption><thead><tr><th scope="col">적용</th><th scope="col">챗봇은 이렇게 답해요</th><th scope="col">쉬운 설명</th></tr></thead><tbody>{group.rules.map(rule => <tr key={rule.title}><td><input type="checkbox" checked disabled aria-label={`${rule.title}`} /></td><th scope="row">{rule.title}</th><td>{rule.description}</td></tr>)}</tbody></table></div>
      </div>)}
    </section>
    <section className="settings-card answer-settings-section" aria-labelledby="answer-options-title">
      <div className="answer-section-heading"><h2 id="answer-options-title">답변 옵션</h2><p>희망하는 안내 방식을 체크해 주세요. AI 답변에 우선적용됩니다. 체크하지 않아도 꼭 필요한 내용은 맥락에 따라 포함될 수 있어요.</p></div>
      <div className="answer-table-scroll"><table className="answer-settings-table"><caption className="sr-only">기관별로 선택하는 답변 옵션 7개</caption><thead><tr><th scope="col">사용</th><th scope="col">선택할 안내 방식</th><th scope="col">체크하면 이렇게 달라져요</th></tr></thead><tbody>{ANSWER_OPTIONS.map(option => <tr key={option.key} className={value[option.key] ? "is-enabled" : ""}><td><input id={`answer-${option.key}`} type="checkbox" checked={value[option.key]} disabled={disabled} aria-describedby={`answer-${option.key}-help`} onChange={event => onChange({ ...value, [option.key]: event.target.checked })} /></td><th scope="row"><label htmlFor={`answer-${option.key}`}>{option.title}</label></th><td id={`answer-${option.key}-help`}>{option.description}</td></tr>)}</tbody></table></div>
    </section>
    <section className="settings-card answer-settings-section" aria-labelledby="answer-style-title">
      <div className="answer-section-heading"><h2 id="answer-style-title">답변 스타일</h2><p>항목별로 하나씩 선택해 주세요.</p></div>
      <div className="answer-style-grid">{ANSWER_STYLES.map(style => <fieldset key={style.key} disabled={disabled} className="answer-style-field"><legend>{style.title}</legend><p>{style.description}</p><div className="answer-style-options">{style.choices.map(([key, title]) => <label key={key} className={value[style.key] === key ? "selected" : ""}><input type="radio" name={`answer-${style.key}`} value={key} checked={value[style.key] === key} onChange={() => onChange({ ...value, [style.key]: key })} /><span>{title}</span></label>)}</div></fieldset>)}</div>
    </section>
  </div>;
}
