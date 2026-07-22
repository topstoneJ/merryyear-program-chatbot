import { getBusiness, loadKnowledgeContext, recordConsultation } from "@/db/knowledge";

type BusinessId = string;

type Answer = {
  text: string;
  source: string;
  page: number;
  confidence: number;
  review?: boolean;
};

type GeminiPayload = {
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

const HOUSEHOLD_THRESHOLDS: Record<number, number> = {
  1: 2_564_238,
  2: 4_199_292,
  3: 5_359_036,
  4: 6_494_738,
  5: 7_556_719,
};

const KNOWLEDGE: Record<string, string> = {
  enterprise: `
[2026년 사회적기업 시설·운영비 지원사업 공고문]
- 신청자격: 인증 사회적기업, 지역형·부처형 예비사회적기업, 인가받은 사회적협동조합 중 하나 이상. 법인 설립 1년 이상이며 전기 재무제표상 완전자본잠식 상태가 아니어야 함. (1쪽)
- 지원금액: 기업당 최대 1억 원. (2쪽)
- 시설비: 사업장 매입, 토지 구입, 임차보증금, 기계장비·차량 구입, 시설 보수·인테리어. 운영비: 상품·원자재 구입, 홍보비 등. 인건비 사용 불가. (2쪽)
- 단기대출: 연 2.6% 고정금리, 6개월 거치 후 18개월 원리금 균등분할상환. 장기대출: 연 3.2% 고정금리, 6개월 거치 후 54개월 원리금 균등분할상환. (2쪽)
- 접수: 2026년 4월 2일~11월 30일 상시 접수, 자금 소진 시 조기 마감. (2~3쪽)
- 신청: 1~15번 서류를 순서대로 스캔해 PDF 1개로 병합하고 온라인 신청 링크로 제출. 이메일·우편 접수 불가. (3쪽)
- 문의: merry_se@merryyear.org, 02-2038-8508, 평일 10~12시·14~16시. (5쪽)
`,
  crisis: `
[2026년 열매나눔재단 위기아동가정 지원사업 안내문]
- 대상: 전국의 만 19세 이하 아동이 포함된 기준중위소득 100% 이하 가정. 6개월 이내 갑작스러운 위기로 경제·사회·심리적 어려움에 처하고, 사례관리기관과 협조 가능하며, 지원을 통한 긍정적 변화가 가능한 가정. 기관 신청만 가능, 개인 신청 불가. (1~2쪽)
- 2026년 기준중위소득 100% 월 기준: 1인 2,564,238원 / 2인 4,199,292원 / 3인 5,359,036원 / 4인 6,494,738원 / 5인 7,556,719원. (1쪽)
- 우선지원: 조손가정, 한부모가정, 북한이탈 배경 가정, 이주배경 가정, 자립준비청년(보호아동 포함) 가정. (2쪽)
- 신청기관: 종합복지관, 노인복지관, 장애인복지관, 드림스타트, 병원, 학교, 주민센터 등 사례관리가 가능한 사회복지 유관기관. (2쪽)
- 접수: 연중 상시. 매달 2·4주 화요일 15시까지 접수된 신청서를 같은 주 목·금요일 심의. 결과는 심의 후 업무일 3일 내 안내. (2쪽)
- 신청: 신청기관이 서류를 취합해 impact@merryyear.org로 제출. (2쪽)
- 지원: 생계돌봄·건강돌봄·주거돌봄 세부 항목별 중복 신청 가능, 전체 최대 300만원. 생활비 최대 150만원, 공과금·관리비 50만원, 필수가전 100만원, 이사비 100만원. 수술·입원치료비 최대 300만원, 진단·검사비 100만원, 치과치료 최대 100만원, 간병비 최대 300만원, 보장기구 최대 300만원. 월임대료 최대 150만원, 임시주거비·주거환경개선비 최대 300만원. (3~5쪽)
- 이미 납부한 비용은 신청 불가. 자살 시도·자살로 발생한 의료비는 지원 불가. 건강돌봄비는 민간보험 또는 의료비 산정특례 적용 시 신청 불가. (4~5쪽)
- 문의: 임팩트사업1팀 02-2665-0046. (6쪽)
`,
};

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function extractHouseholdSize(question: string): number | null {
  const numeric = question.match(/(\d+)\s*(?:인|명)\s*(?:가구|가족)?/);
  if (numeric) return Number(numeric[1]);

  const korean: Array<[RegExp, number]> = [
    [/(?:한|하나)\s*명/, 1],
    [/(?:두|둘)\s*명/, 2],
    [/(?:세|셋)\s*명/, 3],
    [/(?:네|넷)\s*명/, 4],
    [/(?:다섯)\s*명/, 5],
  ];
  return korean.find(([pattern]) => pattern.test(question))?.[1] ?? null;
}

function extractMonthlyIncome(question: string): number | null {
  const compact = question.replace(/,/g, "");
  const units: Array<[RegExp, number]> = [
    [/(\d+(?:\.\d+)?)\s*억\s*원?/, 100_000_000],
    [/(\d+(?:\.\d+)?)\s*천만\s*원?/, 10_000_000],
    [/(\d+(?:\.\d+)?)\s*백만\s*원?/, 1_000_000],
    [/(\d+(?:\.\d+)?)\s*만\s*원?/, 10_000],
  ];

  for (const [pattern, multiplier] of units) {
    const match = compact.match(pattern);
    if (match) return Number(match[1]) * multiplier;
  }

  const wonValue = compact.match(/(\d{6,9})\s*원/);
  return wonValue ? Number(wonValue[1]) : null;
}

function incomeAnswer(question: string): Answer | null {
  const asksAboutIncome = /(월급|월소득|소득|중위소득|자격|가능)/.test(question);
  if (!asksAboutIncome) return null;

  const income = extractMonthlyIncome(question);
  const household = extractHouseholdSize(question);
  const conditions = "다만 이는 소득 조건만 단순 비교한 결과입니다. 실제 신청에는 만 19세 이하 아동 포함, 최근 6개월 이내의 갑작스러운 위기, 사례관리기관 협조, 기관을 통한 신청 등 나머지 조건도 모두 확인해야 합니다. 또한 월급 한 사람의 금액이 아니라 가구 전체 소득과 제출서류를 기준으로 최종 판단합니다.";

  if (income !== null && household !== null) {
    const threshold = HOUSEHOLD_THRESHOLDS[household];
    if (!threshold) {
      return {
        text: `담당자 문의가 필요합니다.\n\n월 소득은 ${won(income)}으로 이해했습니다. 안내문에는 1~5인 가구 기준만 있어 ${household}인 가구의 정확한 기준은 안내문만으로 계산할 수 없습니다. 열매나눔재단 임팩트사업1팀(02-2665-0046)에 확인해 주세요.`,
        source: "안내문 1쪽 · 기준중위소득 100%",
        page: 1,
        confidence: 99,
        review: true,
      };
    }

    const difference = Math.abs(threshold - income);
    const meets = income <= threshold;
    return {
      text: `${meets ? "가능합니다. 소득 조건만 보면 기준 이하입니다." : "불가능합니다. 소득 조건 기준을 초과합니다."}\n\n월 소득 ${won(income)}은 ${household}인 가구 기준 ${won(threshold)}보다 ${won(difference)} ${meets ? "낮습니다" : "높습니다"}.\n\n${conditions}`,
      source: "안내문 1쪽 · 기준중위소득 100%",
      page: 1,
      confidence: 99,
    };
  }

  if (income !== null) {
    const below = Object.entries(HOUSEHOLD_THRESHOLDS)
      .filter(([, threshold]) => income <= threshold)
      .map(([size]) => Number(size));
    const above = Object.entries(HOUSEHOLD_THRESHOLDS)
      .filter(([, threshold]) => income > threshold)
      .map(([size]) => Number(size));
    const comparison = [
      above.length ? `${above.join("·")}인 가구 기준은 초과` : "1~5인 가구 기준을 모두 충족",
      below.length ? `${below.join("·")}인 가구 기준은 이하` : "1~5인 가구 기준을 모두 초과",
    ].join("하고, ");

    return {
      text: `추가 정보가 필요합니다. 가구원 수를 알려주세요.\n\n월 소득 ${won(income)}을 안내문 기준표와 비교하면 ${comparison}입니다.\n\n기준표: 1인 ${won(HOUSEHOLD_THRESHOLDS[1])}, 2인 ${won(HOUSEHOLD_THRESHOLDS[2])}, 3인 ${won(HOUSEHOLD_THRESHOLDS[3])}, 4인 ${won(HOUSEHOLD_THRESHOLDS[4])}, 5인 ${won(HOUSEHOLD_THRESHOLDS[5])}.\n\n${conditions}`,
      source: "안내문 1쪽 · 기준중위소득 100%",
      page: 1,
      confidence: 99,
    };
  }

  if (household !== null && HOUSEHOLD_THRESHOLDS[household]) {
    return {
      text: `추가 정보가 필요합니다. 가구 전체 월소득을 알려주세요.\n\n${household}인 가구의 기준중위소득 100% 월 기준은 ${won(HOUSEHOLD_THRESHOLDS[household])}입니다. 소득을 알려주시면 기준과의 차액까지 계산해 드릴게요.\n\n${conditions}`,
      source: "안내문 1쪽 · 기준중위소득 100%",
      page: 1,
      confidence: 99,
    };
  }

  return null;
}

function parseGeminiAnswer(raw: string): Answer {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as Partial<Answer> & {
    decision?: "possible" | "impossible" | "consult" | "need_info" | "fact";
  };
  if (!parsed.text || !parsed.source || !Number.isFinite(parsed.page)) throw new Error("Invalid Gemini response");
  const decisionPrefixes = {
    possible: "가능합니다.",
    impossible: "불가능합니다.",
    consult: "담당자 문의가 필요합니다.",
    need_info: "추가 정보가 필요합니다.",
  } as const;
  const prefix = parsed.decision && parsed.decision !== "fact" ? decisionPrefixes[parsed.decision] : "";
  const answerText = prefix && !parsed.text.trim().startsWith(prefix)
    ? `${prefix}\n\n${parsed.text.trim()}`
    : parsed.text.trim();
  const confidence = parsed.review || parsed.decision === "consult"
    ? 65
    : parsed.decision === "need_info"
      ? 80
      : 95;
  return {
    text: answerText,
    source: parsed.source,
    page: Math.max(1, Math.round(parsed.page ?? 1)),
    confidence,
    review: Boolean(parsed.review),
  };
}

async function askGemini(businessId: BusinessId, businessName: string, question: string, knowledge: string): Promise<Answer> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  if (!apiKey) throw new Error("Gemini API key is not configured");

  const response = await fetch("https://generativelanguage.googleapis.com/v1/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model,
      store: false,
      system_instruction: "당신은 열매나눔재단 사업 안내 챗봇입니다. 제공된 공고문 지식과 관리자 추가 안내만 사용하세요. 모든 답변은 결론을 첫 문장에 두세요. 자격·가능 여부 질문의 decision은 possible, impossible, consult, need_info 중 하나로 정하고 첫 문장을 각각 '가능합니다.', '불가능합니다.', '담당자 문의가 필요합니다.', '추가 정보가 필요합니다.'로 시작하세요. 단순 정보 질문은 decision을 fact로 정하고 핵심 사실부터 말하세요. 질문에 숫자, 소득, 가구원 수가 포함되면 값을 추출하고 기준과의 차액을 계산해 설명하세요. 변수가 부족하면 무엇이 필요한지 말한 뒤, 현재 정보로 가능한 범위 비교를 보여주세요. 단일 조건 충족을 전체 자격 확정처럼 말하지 말고 나머지 필수 조건을 구분하세요. 근거가 없으면 추측하지 마세요. 한국어로 간결하고 친절하게 답하세요.",
      input: `사업: ${businessName} (${businessId})\n\n등록된 사업 데이터:\n${knowledge || "등록된 데이터 없음"}\n\n질문:\n${question}`,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            decision: {
              type: "string",
              enum: ["possible", "impossible", "consult", "need_info", "fact"],
            },
            text: { type: "string" },
            source: { type: "string" },
            page: { type: "integer" },
            review: { type: "boolean" },
          },
          required: ["decision", "text", "source", "page", "review"],
        },
      },
    }),
  });

  const payload = await response.json() as GeminiPayload;
  if (!response.ok) throw new Error(payload.error?.message || "Gemini request failed");
  const text = payload.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === "text")
    .map((content) => content.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response");
  return parseGeminiAnswer(text);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { businessId?: BusinessId; question?: string; manual?: string };
    const businessId = body.businessId;
    const question = body.question?.trim();
    if (!businessId || !question) {
      return Response.json({ error: "올바른 질문을 입력해 주세요." }, { status: 400 });
    }
    const business = await getBusiness(businessId);
    if (!business) return Response.json({ error: "선택한 사업을 찾을 수 없습니다." }, { status: 404 });

    const calculated = businessId === "crisis" ? incomeAnswer(question) : null;
    const managedKnowledge = calculated ? "" : await loadKnowledgeContext(businessId);
    const knowledge = [KNOWLEDGE[businessId] || "", managedKnowledge, body.manual?.slice(0, 6_000) || ""].filter(Boolean).join("\n\n");
    const answer = calculated ?? await askGemini(businessId, business.name, question, knowledge);
    await recordConsultation({
      businessId,
      question,
      answer: answer.text,
      source: answer.source,
      confidence: answer.confidence,
      review: answer.review,
    }).catch((error) => console.error("Consultation recording failed", error));
    return Response.json({ answer });
  } catch (error) {
    console.error("Chat answer failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "답변을 만드는 중 문제가 생겼습니다. 잠시 후 다시 질문해 주세요." }, { status: 502 });
  }
}
