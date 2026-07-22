"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type BusinessId = "enterprise" | "crisis";

type Answer = {
  text: string;
  source: string;
  page: number;
  confidence: number;
  review?: boolean;
};

type ChatMessage = {
  id: number;
  question: string;
  answer?: Answer;
  thinking?: boolean;
};

type SurveyGroup = {
  question: string;
  answers: string[];
};

type Business = {
  id: BusinessId;
  name: string;
  title: string;
  date: string;
  pages: number;
  pdf: string;
  pageLabel: string;
  prompts: { icon: string; question: string }[];
  survey: SurveyGroup[];
};

const BUSINESSES: Record<BusinessId, Business> = {
  enterprise: {
    id: "enterprise",
    name: "사회적기업 시설·운영비 지원사업",
    title: "2026년 사회적기업 시설·운영비 지원사업 공고문",
    date: "2026. 4. 2.",
    pages: 5,
    pdf: "/social-enterprise-2026.pdf",
    pageLabel: "공고문",
    prompts: [
      { icon: "♙", question: "신청 자격이 뭐야?" },
      { icon: "□", question: "신청 기간을 알려줘" },
      { icon: "▤", question: "대출 조건을 정리해줘" },
    ],
    survey: [
      {
        question: "신청 전에 담당자와 상담하려면 어떤 방법을 이용할 수 있나요?",
        answers: ["전화 상담", "이메일 상담"],
      },
      {
        question: "서류를 준비하다가 발급이 어려운 자료가 있으면 어떻게 하나요?",
        answers: ["담당자에게 대체서류 문의", "발급기관에 먼저 확인"],
      },
      {
        question: "신청 접수나 심사 결과는 어떤 방식으로 안내받나요?",
        answers: ["신청기업 담당자에게 전화 안내", "신청기업 담당자에게 이메일 안내"],
      },
    ],
  },
  crisis: {
    id: "crisis",
    name: "위기아동가정 지원사업",
    title: "2026년 열매나눔재단 위기아동가정 지원사업 안내문",
    date: "2026년",
    pages: 6,
    pdf: "/crisis-family-2026.pdf",
    pageLabel: "안내문",
    prompts: [
      { icon: "♙", question: "누가 신청할 수 있어?" },
      { icon: "□", question: "지원 금액을 알려줘" },
      { icon: "▤", question: "신청 방법이 뭐야?" },
    ],
    survey: [
      {
        question: "위기아동가정 지원사업을 신청할 수 있는 유관기관은 어디인가요?",
        answers: ["지역 종합사회복지관", "행정복지센터", "주거상담소"],
      },
      {
        question: "가까운 유관기관을 찾지 못한 경우 어디에 문의하면 되나요?",
        answers: ["열매나눔재단 담당팀에 전화", "열매나눔재단 담당팀에 이메일"],
      },
      {
        question: "선정 결과는 누구에게 어떤 방식으로 안내되나요?",
        answers: ["신청기관 담당자에게 전화 안내", "신청기관 담당자에게 이메일 안내"],
      },
    ],
  },
};

const ENTERPRISE_ANSWERS: { keys: string[]; answer: Answer }[] = [
  {
    keys: ["자격", "지원대상", "신청대상", "요건", "누가"],
    answer: {
      text: "인증 사회적기업, 지역형·부처형 예비사회적기업, 인가받은 사회적협동조합 중 하나 이상이어야 합니다. 법인 설립 1년 이상이고 전기 재무제표상 완전자본잠식 상태가 아니어야 합니다.",
      source: "공고문 1쪽 · 지원대상",
      page: 1,
      confidence: 98,
    },
  },
  {
    keys: ["기간", "기한", "마감", "언제", "접수일"],
    answer: {
      text: "2026년 4월 2일부터 11월 30일까지 상시 접수하며, 자금 소진 시 조기 마감될 수 있습니다.",
      source: "공고문 2–3쪽 · 신청기한",
      page: 2,
      confidence: 99,
    },
  },
  {
    keys: ["대출 조건", "금리", "상환", "이자", "단기대출", "장기대출"],
    answer: {
      text: "단기는 연 2.6% 고정금리, 6개월 거치 후 18개월 상환입니다. 장기는 연 3.2% 고정금리, 6개월 거치 후 54개월 상환입니다.",
      source: "공고문 2쪽 · 금리 및 상환",
      page: 2,
      confidence: 99,
    },
  },
  {
    keys: ["금액", "한도", "얼마", "지원 규모"],
    answer: {
      text: "시설·운영비 자금은 기업당 최대 1억 원 이내에서 지원합니다.",
      source: "공고문 2쪽 · 지원금액",
      page: 2,
      confidence: 99,
    },
  },
  {
    keys: ["자금용도", "용도", "시설비", "운영비", "인건비", "사용"],
    answer: {
      text: "시설비는 사업장 매입·토지 구입·임차보증금, 기계장비·차량 구입, 시설 보수와 인테리어 등에 사용할 수 있습니다. 운영비는 상품·원자재 구입과 홍보비 등에 쓸 수 있지만 인건비에는 사용할 수 없습니다.",
      source: "공고문 2쪽 · 자금용도",
      page: 2,
      confidence: 98,
    },
  },
  {
    keys: ["신청 방법", "접수 방법", "신청링크", "어떻게 신청", "제출 방법"],
    answer: {
      text: "신청서류를 1번부터 15번 순서로 스캔해 PDF 파일 1개로 병합한 뒤, 공고문에 안내된 온라인 신청 링크에서 신청정보와 PDF를 제출합니다. 이메일이나 우편 접수는 받지 않습니다.",
      source: "공고문 3쪽 · 신청방법",
      page: 3,
      confidence: 99,
    },
  },
  {
    keys: ["제출서류", "필요서류", "서류", "준비물"],
    answer: {
      text: "신청서, 사업자등록증 또는 고유번호증, 사회적기업 관련 인증서, 법인등기부등본, 사업장 계약서, 주주·조합원 명부, 4대보험 서류, 최근 3년 재무제표와 부가가치세과세표준증명, 국세·지방세 완납증명서, 기업소개자료 등 총 15개 항목을 준비해야 합니다.",
      source: "공고문 3–4쪽 · 신청 시 제출서류",
      page: 3,
      confidence: 97,
    },
  },
  {
    keys: ["문의", "연락처", "전화", "이메일", "상담"],
    answer: {
      text: "열매나눔재단 임팩트사업2팀으로 문의할 수 있습니다. 이메일은 merry_se@merryyear.org, 전화는 02-2038-8508이며 상담 가능 시간은 평일 10시~12시, 14시~16시입니다.",
      source: "공고문 5쪽 · 문의",
      page: 5,
      confidence: 99,
    },
  },
  {
    keys: ["절차", "심사", "선정", "현장실사", "신용평가"],
    answer: {
      text: "상담·접수 후 서류심사, 신용평가, 현장실사, 선정회의, 약정 순으로 진행합니다. 서류심사는 접수 5일 이내이며, 대표자는 모든 심사와 약정식에 참석해야 합니다.",
      source: "공고문 2–3쪽 · 선정절차",
      page: 2,
      confidence: 97,
    },
  },
];

const CRISIS_ANSWERS: { keys: string[]; answer: Answer }[] = [
  {
    keys: ["누가", "자격", "대상", "신청할 수", "조건"],
    answer: {
      text: "전국의 만 19세 이하 아동이 포함된 중위소득 100% 이하 가정 중, 6개월 이내 갑작스러운 위기로 어려움을 겪고 있으며 사례관리기관과 협조할 수 있는 가정이 대상입니다. 기관을 통한 신청만 가능하며 개인 신청은 불가합니다.",
      source: "안내문 1–2쪽 · 사업대상",
      page: 1,
      confidence: 98,
    },
  },
  {
    keys: ["지원 금액", "금액", "한도", "얼마"],
    answer: {
      text: "생계돌봄·건강돌봄·주거돌봄비의 세부 항목별 중복 신청이 가능하며, 전체 지원 한도는 최대 300만원입니다. 세부 항목별 한도는 서로 다릅니다.",
      source: "안내문 3–4쪽 · 지원내용",
      page: 3,
      confidence: 99,
    },
  },
  {
    keys: ["신청 방법", "접수 방법", "어떻게 신청", "이메일", "개인 신청"],
    answer: {
      text: "사례관리가 가능한 사회복지 유관기관이 제출서류를 취합해 impact@merryyear.org로 신청합니다. 개인은 직접 신청할 수 없습니다.",
      source: "안내문 2쪽 · 신청 방법",
      page: 2,
      confidence: 99,
    },
  },
  {
    keys: ["기간", "언제", "접수", "심의", "선정 결과"],
    answer: {
      text: "연중 상시 접수하며 매달 2·4주 화요일 오후 3시까지 접수된 신청서를 같은 주 목·금요일에 심의합니다. 최종선정 결과는 심의 후 업무일 기준 3일 안에 신청기관에 안내합니다.",
      source: "안내문 2쪽 · 사업진행",
      page: 2,
      confidence: 98,
    },
  },
  {
    keys: ["지원 내용", "어떤 지원", "생계", "건강", "주거", "의료비", "생활비"],
    answer: {
      text: "생계돌봄비는 생활비·공과금·필수가전·이사비, 건강돌봄비는 수술·입원·검사·간병·보장기구, 주거돌봄비는 월임대료·임시주거·주거환경개선비를 지원합니다. 전체 지원 한도는 최대 300만원입니다.",
      source: "안내문 3–5쪽 · 지원내용",
      page: 3,
      confidence: 97,
    },
  },
  {
    keys: ["제출서류", "필요서류", "서류", "준비"],
    answer: {
      text: "신청서와 공문, 개인정보 동의서, 가족관계증명서, 주민등록표등본, 신청기관 사업자등록증, 통장사본, 소득증빙 서류를 공통으로 제출합니다. 신청 항목에 따라 견적서·진단서·고지서·임대차계약서 등 추가 근거서류가 필요합니다.",
      source: "안내문 7–9쪽 · 제출서류",
      page: 7,
      confidence: 96,
    },
  },
  {
    keys: ["지원 불가", "제외", "보험", "기납부", "자살"],
    answer: {
      text: "이미 납부한 비용은 신청할 수 없습니다. 자살 시도 또는 자살로 발생한 의료비는 지원하지 않으며, 건강돌봄비는 민간보험이나 의료비 산정특례 적용을 받는 경우 신청할 수 없습니다.",
      source: "안내문 4–5쪽 · 유의사항",
      page: 4,
      confidence: 98,
    },
  },
  {
    keys: ["문의", "연락처", "전화", "담당"],
    answer: {
      text: "사업 문의는 열매나눔재단 임팩트사업본부 임팩트사업1팀 02-2665-0046으로 연락해 주세요.",
      source: "안내문 6쪽 · 문의처",
      page: 6,
      confidence: 99,
    },
  },
];

function normalise(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildAnswer(businessId: BusinessId, question: string, manual: string): Answer {
  const clean = normalise(question);
  const choices = businessId === "enterprise" ? ENTERPRISE_ANSWERS : CRISIS_ANSWERS;
  const match = choices.find(({ keys }) => keys.some((key) => clean.includes(key)));

  if (match) return match.answer;

  if (manual.trim()) {
    return {
      text: manual.trim(),
      source: "관리자 추가 안내",
      page: 1,
      confidence: 92,
      review: true,
    };
  }

  return {
    text: "담당자 문의가 필요합니다.\n\n선택한 사업의 공고문과 관리자 추가 안내에서 질문에 대한 근거를 찾지 못했어요. 신청 자격, 기간, 지원 금액, 신청 방법처럼 공고문에 포함된 항목으로 다시 질문해 주세요.",
    source: "공고문 내 근거 없음",
    page: 1,
    confidence: 0,
    review: true,
  };
}

export default function Home() {
  const [businessId, setBusinessId] = useState<BusinessId>("enterprise");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [manuals, setManuals] = useState<Record<BusinessId, string>>({ enterprise: "", crisis: "" });
  const [manualDraft, setManualDraft] = useState("");
  const [selectedSurvey, setSelectedSurvey] = useState<string[]>([]);
  const [uploadedNames, setUploadedNames] = useState<Record<BusinessId, string>>({ enterprise: "", crisis: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const business = BUSINESSES[businessId];

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("merryyear-chatbot-guidance");
      if (stored) setManuals((previous) => ({ ...previous, ...JSON.parse(stored) }));
    } catch {
      // The chatbot still works when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const selectedSurveyText = useMemo(() => new Set(selectedSurvey), [selectedSurvey]);

  function changeBusiness(next: BusinessId) {
    setBusinessId(next);
    setMessages([]);
    setQuestion("");
    setSelectedSurvey([]);
  }

  async function ask(nextQuestion: string) {
    const trimmed = nextQuestion.trim();
    if (!trimmed) return;

    const id = nextId.current++;
    setQuestion("");
    setMessages((previous) => [...previous, { id, question: trimmed, thinking: true }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, question: trimmed, manual: manuals[businessId] }),
      });
      const payload = await response.json() as { answer?: Answer; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error || "Answer request failed");

      setMessages((previous) =>
        previous.map((message) =>
          message.id === id ? { ...message, thinking: false, answer: payload.answer } : message,
        ),
      );
    } catch {
      const answer = buildAnswer(businessId, trimmed, manuals[businessId]);
      setMessages((previous) =>
        previous.map((message) => (message.id === id ? { ...message, thinking: false, answer } : message)),
      );
    }
  }

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  function openAdmin() {
    setManualDraft(manuals[businessId]);
    setSelectedSurvey([]);
    setAdminOpen(true);
  }

  function closeAdmin() {
    setAdminOpen(false);
    setSelectedSurvey([]);
  }

  function toggleSurvey(key: string) {
    setSelectedSurvey((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    );
  }

  function applySurvey() {
    const additions = business.survey.flatMap((group) => {
      const checked = group.answers.filter((answer) => selectedSurveyText.has(`${group.question}|${answer}`));
      if (!checked.length) return [];
      return [`Q. ${group.question}\n${checked.map((answer) => `A. ${answer}`).join("\n")}`];
    });

    if (additions.length) {
      setManualDraft((previous) => [previous.trim(), additions.join("\n\n")].filter(Boolean).join("\n\n"));
      setSelectedSurvey([]);
    }
  }

  function saveGuidance() {
    const next = { ...manuals, [businessId]: manualDraft };
    setManuals(next);
    try {
      window.localStorage.setItem("merryyear-chatbot-guidance", JSON.stringify(next));
    } catch {
      // Keep the current-session value even if storage is unavailable.
    }
    closeAdmin();
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand brand-logo" href="#" aria-label="열매나눔재단 사업 안내 챗봇 홈">
          <img src="/merryyear-logo.png" alt="열매나눔재단" width={210} height={53} />
          <b>사업 안내 챗봇</b>
        </a>
        <a className="admin-link" href="/knowledge">
          데이터 관리 <span>↗</span>
        </a>
      </header>

      <div className="workspace">
        <section className="intro">
          <span className="eyebrow"><span>✦</span> 열매나눔재단 AI 사업 안내</span>
          <h1><span className="title-line">열매나눔재단 사업,</span><br /><em>질문으로 쉽게</em> 확인하세요</h1>
          <p className="lead">선택한 사업에 대해 궁금한 부분을<br className="desktop" /> 빠르게 안내드립니다.</p>

          <div className="benefits">
            <div><span className="icon" aria-hidden="true">✓</span><span><b>데이터 안에서만 답변</b><small>없는 내용은 추측하지 않아요</small></span></div>
            <div><span className="icon" aria-hidden="true">▤</span><span><b>여러 사업 한곳에서</b><small>사업을 선택해 질문해요</small></span></div>
          </div>

          <label className="select-label" htmlFor="document-select">상담할 사업</label>
          <div className="document-select-wrap">
            <select id="document-select" value={businessId} onChange={(event) => changeBusiness(event.target.value as BusinessId)}>
              <option value="enterprise">사회적기업 시설·운영비 지원사업</option>
              <option value="crisis">위기아동가정 지원사업</option>
            </select>
            <span>⌄</span>
          </div>

          <a className="document-card" href={business.pdf} download>
            <div className="doc-head"><span>최근 사업 공고</span><span className="ready">✓ 분석 완료</span></div>
            <div className="doc-body">
              <span className="pdf">PDF</span>
              <div><strong>{business.title}</strong><p>{business.date} · 총 {business.pages}쪽</p></div>
              <span className="download">↓<small>다운로드</small></span>
            </div>
          </a>
        </section>

        <section className="chat" aria-label="사업 공고문 상담 채팅">
          <div className="conversation" ref={conversationRef}>
            <div className="welcome">
              <span className="bot">✦</span>
              <div>
                <p><b>{business.name}</b>을 선택하셨어요.</p>
                <p>이 공고문과 관리자 추가 안내에 포함된 내용만 정확하게 답변해 드릴게요.</p>
                <div className="badges"><span>▣ 공고문 근거 답변</span><span>♢ 추측 없는 안내</span></div>
              </div>
            </div>

            {!messages.length && (
              <div className="starter">
                <h2><span>✦</span> 무엇이 궁금하신가요?</h2>
                <div className="prompts">
                  {business.prompts.map((prompt) => (
                    <button type="button" key={prompt.question} onClick={() => ask(prompt.question)}>
                      <span>{prompt.icon}</span>{prompt.question}<b>→</b>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="message-list" aria-live="polite">
              {messages.map((message) => (
                <div className="message-block" key={message.id}>
                  <div className="message-row user-row"><div className="user-message">{message.question}</div></div>
                  <div className="message-row assistant-row">
                    <span className="bot small">✦</span>
                    {message.thinking ? (
                      <div className="thinking" role="status" aria-label="공고문에서 근거를 찾고 있어요">
                        <span /><span /><span /> 공고문에서 근거를 찾고 있어요
                      </div>
                    ) : message.answer ? (
                      <article className={`answer${message.answer.review ? " review" : ""}`}>
                        <div className="answer-top">
                          <span>{message.answer.review ? "확인 필요 답변" : "공고문 기반 답변"}</span>
                          <span>{message.answer.confidence ? `신뢰도 ${message.answer.confidence}%` : "근거 없음"}</span>
                        </div>
                        <p>{message.answer.text}</p>
                        <a className="source" href={`${business.pdf}#page=${message.answer.page}`} target="_blank" rel="noreferrer">
                          ▣ 근거 보기 · {message.answer.source}<span>›</span>
                        </a>
                      </article>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form className="composer" onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor="question">공고문 질문</label>
            <input id="question" placeholder="선택한 사업에 대해 질문해 주세요" value={question} onChange={(event) => setQuestion(event.target.value)} />
            {question && <button className="clear" type="button" aria-label="질문 지우기" onClick={() => setQuestion("")}>×</button>}
            <button className="send" disabled={!question.trim()} aria-label="질문 보내기">➤</button>
          </form>
          <p className="notice">공고문과 관리자 추가 안내에 없는 내용은 답변하지 않습니다.</p>
        </section>
      </div>

      {adminOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAdmin()}>
          <section className="modal admin-modal" role="dialog" aria-modal="true" aria-label="데이터 관리">
            <button className="modal-close" type="button" aria-label="닫기" onClick={closeAdmin}>×</button>
            <div className="upload-icon">▤</div>
            <h2>데이터 관리</h2>
            <p className="admin-current">현재 선택: <b>{business.name}</b></p>

            <div className="admin-section">
              <label>PDF 공고문 업로드</label>
              <input
                className="sr-only"
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const name = event.target.files?.[0]?.name ?? "";
                  setUploadedNames((previous) => ({ ...previous, [businessId]: name }));
                }}
              />
              <button className="secondary-button" type="button" onClick={() => fileRef.current?.click()}>PDF 파일 선택</button>
              {uploadedNames[businessId] && <div className="manual-indicator">✓ 선택됨: {uploadedNames[businessId]}</div>}
              <small>텍스트 추출 가능한 PDF를 등록해 주세요.</small>
            </div>

            <div className="admin-section discovery-section">
              <label>AI 추가 안내 제안</label>
              <p className="section-description">공고문을 처음 접한 사람이 추가로 궁금해할 질문입니다. 실제 안내할 답변을 복수 선택하면 아래 수기 입력란에 자동으로 누적됩니다.</p>
              {business.survey.map((group) => (
                <fieldset className="discovery-card" key={group.question}>
                  <legend>Q. {group.question}</legend>
                  {group.answers.map((answer) => {
                    const key = `${group.question}|${answer}`;
                    return (
                      <label className="check-option" key={key}>
                        <input type="checkbox" checked={selectedSurvey.includes(key)} onChange={() => toggleSurvey(key)} />
                        <span>A. {answer}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              <button className="survey-save" type="button" disabled={!selectedSurvey.length} onClick={applySurvey}>선택 답변을 추가 안내에 반영</button>
              <small>반영 후 아래 입력란에서 내용을 자유롭게 수정할 수 있습니다.</small>
            </div>

            <div className="admin-section">
              <label htmlFor="manual-guidance">공고문에 없는 추가 안내 수기 입력</label>
              <textarea
                id="manual-guidance"
                placeholder={"예) 전화 상담 가능 시간은 평일 오전 10시~오후 5시입니다.\n예) 접수 완료 문자는 다음 영업일에 발송됩니다."}
                value={manualDraft}
                onChange={(event) => setManualDraft(event.target.value)}
              />
              <small>입력한 내용은 현재 선택한 사업에만 적용되며, 챗봇 답변 근거로 사용됩니다.</small>
            </div>

            <div className="admin-actions">
              <button className="cancel-button" type="button" onClick={closeAdmin}>취소</button>
              <button className="upload-button" type="button" onClick={saveGuidance}>안내 저장</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
