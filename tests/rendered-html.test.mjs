import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("data management supports dynamic businesses and editable knowledge", async () => {
  const [page, home, consultations] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/consultations/page.tsx", root), "utf8"),
  ]);
  assert.match(page, /사업별 관리/);
  assert.match(page, /신규 사업 추가/);
  assert.match(page, /사업 정보 수정/);
  assert.match(page, /사업안내 공고 링크/);
  assert.match(page, /전화 가능 시간/);
  assert.match(page, /\{index \+ 1\}/);
  assert.match(page, /사업 순서 정리/);
  assert.match(page, /order: orderDraft\.map/);
  assert.doesNotMatch(page, /className="business-move"/);
  assert.doesNotMatch(page, /className="business-edit"/);
  assert.match(page, /business-public-switch/);
  assert.match(page, /사업과 등록 데이터, 상담 내역을 모두 삭제/);
  assert.match(page, /본인 비밀번호/);
  assert.match(page, /사업 순서 정리\(메인화면 연동\)/);
  assert.match(page, /데이터 확인 및 수정/);
  assert.match(page, /<span>이메일<\/span>/);
  assert.doesNotMatch(page, /메인에 노출하기|등록 웹사이트 열기/);
  assert.match(page, /\/api\/businesses/);
  assert.match(page, /\/api\/knowledge\?id=/);
  assert.match(page, /<BrandLink \/>/);
  assert.match(page, /<AdminNav current="knowledge"/);
  assert.match(consultations, /<AdminNav current="consultations"/);
  assert.match(consultations, /전화상담 건당 평균 3분 기준/);
  assert.doesNotMatch(consultations, /주말 전체 · 평일/);
  assert.doesNotMatch(page, /className="consultation-link"/);
  assert.match(consultations, /<BrandLink \/>/);
  assert.doesNotMatch(home, /데이터 관리 <span>↗<\/span>/);
});

test("business order is persisted in D1", async () => {
  const [route, knowledge, schema] = await Promise.all([
    readFile(new URL("app/api/businesses/route.ts", root), "utf8"),
    readFile(new URL("db/knowledge.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);
  assert.match(route, /UPDATE businesses SET sort_order/);
  assert.match(route, /uniqueIds\.size === current\.length/);
  assert.match(knowledge, /ORDER BY sort_order ASC/);
  assert.match(schema, /sortOrder: integer\("sort_order"\)/);
});

test("public answers omit confidence labels", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.doesNotMatch(page, /근거 신뢰도/);
  assert.doesNotMatch(page, /신뢰도 \$\{message\.answer\.confidence\}/);
  assert.doesNotMatch(page, /확인 필요 답변|공고문 기반 답변/);
  assert.doesNotMatch(page, /데이터 안에서만 답변|여러 사업 한곳에서/);
  assert.doesNotMatch(page, /최근 사업 공고<\/span><span className="ready"/);
  assert.doesNotMatch(page, /관리자 추가 안내/);
  assert.doesNotMatch(page, /▣ 자료 기반 답변|♢ 추측 없는 안내/);
  assert.match(page, /등록된 안내 자료를 바탕으로 답변해 드릴게요/);
  assert.match(page, /홈페이지 안내 보러가기/);
  assert.match(page, /homepage-link disabled/);
  assert.match(page, /aria-disabled="true"/);
  assert.doesNotMatch(page, /홈페이지 안내 보러가기[^<]*↗/);
  assert.match(page, /homepage-slot/);
  assert.doesNotMatch(page, /무엇이 궁금하신가요/);
  assert.match(page, /\/api\/business-link\?businessId=/);
  assert.doesNotMatch(page, /sources\?\.find/);
  assert.doesNotMatch(page, /최근 사업 공고/);
  assert.doesNotMatch(page, /총 \{business\.pages\}쪽/);
  assert.match(css, /\.welcome p:last-child \{ margin-bottom: 0; \}/);
  assert.doesNotMatch(page, /공고문 근거 답변/);
  assert.match(css, /\.answer p \{ white-space: pre-line; margin: 0 0 15px;/);
  assert.match(page, /welcome message-row assistant-row/);
  assert.match(page, /className="bot small"/);
  assert.match(page, /자료를 확인하고 있어요/);
  assert.doesNotMatch(page, /공고문에서 근거를 찾고 있어요/);
});

test("home layout supports a configurable multiline title and narrows the chat column", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /siteSettings\.mainHeadline\.split\("\{기관명\}"\)/);
  assert.match(page, /className="headline-brand">\{siteSettings\.organizationName\}<\/span>/);
  assert.match(css, /\.headline-brand \{ color: transparent; background: linear-gradient/);
  assert.match(css, /background-clip: text/);
  assert.match(css, /grid-template-columns: minmax\(500px, 1fr\) minmax\(500px, 600px\)/);
  assert.match(css, /max-width: 600px;\s*justify-self: end/);
});

test("mobile home introduction stays compact while sitting slightly lower", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.intro \{ padding: 24px 4px 8px; transform: none; \}/);
  assert.match(css, /\.workspace \{[^}]*gap: 12px; padding: 18px 14px 28px; \}/);
  assert.doesNotMatch(css, /\.intro \{ min-height: calc\(100svh - 64px\)/);
});

test("consultation summaries filter the detail list by result and category", async () => {
  const page = await readFile(new URL("app/consultations/page.tsx", root), "utf8");
  assert.match(page, /decisionFilter/);
  assert.match(page, /categoryFilter/);
  assert.match(page, /filteredConsultations/);
  assert.match(page, /삭제할 상담내역의 범위를 선택해 주세요/);
  assert.match(page, /target\.map\(\(item\) => item\.id\)/);
  assert.match(page, /상담내역 삭제 권한이 없습니다/);
  assert.match(page, /aria-pressed=\{decisionFilter === key\}/);
  assert.match(page, /aria-pressed=\{categoryFilter === item\.category\}/);
  assert.match(page, /pagedConsultations\.map/);
  assert.match(page, /PAGE_SIZE_OPTIONS\.map/);
  assert.match(page, /<AdminPagination currentPage=\{consultationPage\}/);
  assert.match(page, /Excel 다운로드/);
  assert.match(page, /downloadCsv\("page"\)/);
  assert.match(page, /downloadCsv\("all"\)/);
  assert.match(page, /scope === "page" \? pagedConsultations : filteredConsultations/);
  assert.match(page, /bulkDeleteScope === "page" \? pagedConsultations : filteredConsultations/);
  assert.match(page, /최근 1,000건/);
});

test("business names clamp in management and the desktop home stays inside the viewport", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.knowledge-sidebar nav b \{[^}]*-webkit-line-clamp: 2/);
  assert.match(css, /\.order-list > div > b \{[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.document-select-wrap select \{[^}]*color: #fff;[^}]*background: var\(--orange\)/s);
  assert.match(css, /body:has\(> main > \.workspace\) \{[^}]*overflow: hidden/);
});

test("knowledge sources paginate filtered results with selectable page sizes", async () => {
  const [page, pagination] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("app/admin-pagination.tsx", root), "utf8"),
  ]);
  assert.match(page, /pagedSources\.map/);
  assert.match(page, /PAGE_SIZE_OPTIONS\.map/);
  assert.match(page, /<AdminPagination currentPage=\{sourcePage\}/);
  assert.match(pagination, /\[10, 20, 30, 40, 50\]/);
  assert.match(pagination, /aria-current=\{item === currentPage \? "page"/);
});

test("chat input enforces question and conversation limits and cycles thinking dots", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /정확한 답변을 위해 150자 이내로 질문해주세요/);
  assert.match(page, /question\.length > 150/);
  assert.match(page, /completedMessages\.length >= MAX_CHAT_TURNS/);
  assert.match(page, /conversationCharacters >= MAX_CHAT_CHARACTERS/);
  assert.match(page, /disabled=\{!businessId \|\| conversationLimitReached\}/);
  assert.match(css, /\.conversation-limit/);
  assert.match(css, /animation: thinking-dot-one 3s steps\(1, end\) infinite/);
  assert.match(css, /@keyframes thinking-dot-three/);
});

test("home defaults to the first business and copies a business-specific share link", async () => {
  const page = await readFile(new URL("app/home-client.tsx", root), "utf8");
  assert.match(page, /URLSearchParams\(window\.location\.search\)\.get\("business"\)/);
  assert.match(page, /next\[0\]\?\.id \|\| ""/);
  assert.match(page, /useState<BusinessId>\(""\)/);
  assert.match(page, /if \(!businessId\) return;/);
  assert.match(page, /searchParams\.set\("business", businessId\)/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /현재 사업 챗봇 링크 복사/);
});

test("knowledge management defaults to the first business and PDF input", async () => {
  const page = await readFile(new URL("app/knowledge/page.tsx", root), "utf8");
  assert.match(page, /const \[businessId, setBusinessId\] = useState\(""\)/);
  assert.match(page, /useState<AddMode>\("pdf"\)/);
  assert.match(page, /else if \(payload\.businesses\?\.length\) setBusinessId\(payload\.businesses\[0\]\.id\)/);
  assert.match(page, /PDF 파일을 선택하세요 · 최대 20MB · 최대 80페이지/);
});

test("knowledge management shows active data volume status and rules", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /source\.enabled && source\.status !== "error"/);
  assert.match(page, /characters <= 50_000/);
  assert.match(page, /characters <= 100_000/);
  assert.match(page, /활성화된 자료의 글자 수가 10만자를 넘으면 답변이 느려지고 오류율이 높아질 수 있어요/);
  assert.doesNotMatch(page, /source-limit-count/);
  assert.match(page, /data-volume-indicator/);
  assert.match(page, /data-volume-modal/);
  assert.match(css, /\.data-volume-dot/);
});

test("administrator pages use an id and password session instead of ChatGPT identity", async () => {
  const [session, login, layout] = await Promise.all([
    readFile(new URL("app/admin-session.ts", root), "utf8"),
    readFile(new URL("app/admin-login/page.tsx", root), "utf8"),
    readFile(new URL("app/admin-layout.tsx", root), "utf8"),
  ]);
  assert.match(session, /ADMIN_SESSION_SECRET/);
  assert.match(session, /iterations: 100_000/);
  assert.match(session, /HttpOnly|program_guide_admin_session/);
  assert.match(login, /관리자 로그인/);
  assert.match(layout, /getAdminSession/);
  assert.doesNotMatch(layout, /getChatGPTUser/);
});

test("random text prompts create persistent multi-select knowledge", async () => {
  const [page, route, schema, exportRoute] = await Promise.all([
    readFile(new URL("app/knowledge/page.tsx", root), "utf8"),
    readFile(new URL("app/api/random-question/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("app/api/export/route.ts", root), "utf8"),
  ]);
  assert.match(page, /텍스트\(랜덤\)/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /복수 선택 가능/);
  assert.match(page, />건너뛰기<\/button>/);
  assert.match(page, /action: "skip"/);
  assert.match(page, /setRandomQuestion\(nextPayload.question \|\| null\)/);
  assert.match(route, /status = 'completed'/);
  assert.match(route, /status = 'skipped'/);
  assert.match(route, /INSERT INTO knowledge_sources/);
  assert.match(schema, /randomQuestions/);
  assert.match(exportRoute, /randomQuestions/);
});

test("consultation history defaults to one month and exposes summaries", async () => {
  const page = await readFile(new URL("app/consultations/page.tsx", root), "utf8");
  const route = await readFile(new URL("app/api/consultations/route.ts", root), "utf8");
  assert.match(page, /monthAgo\.setMonth\(monthAgo\.getMonth\(\) - 1\)/);
  assert.match(page, /<h1>상담내역<\/h1>/);
  assert.match(route, /ORDER BY created_at DESC LIMIT 1000/);
  assert.doesNotMatch(page, /CONSULTATION HISTORY|질문 흐름과/);
  assert.match(page, /상담내역 상세/);
  assert.match(page, /downloadCsv/);
  assert.match(page, /상담내역_\$\{from\}_\$\{to\}_\$\{scope === "page"/);
  assert.match(page, /<option value="">사업 전체<\/option>/);
  assert.match(route, /byDecision/);
  assert.match(route, /byCategory/);
  assert.match(page, /근무 외 시간 상담건수/);
  assert.match(route, /offHoursTotal/);
  assert.match(route, /isOutsideBusinessHours/);
  assert.doesNotMatch(page, /conflict: "자료 충돌"/);
});

test("guide is a top-level page for every authenticated administrator", async () => {
  const [settings, page, layout, panel, guide, businesses, chat, home, css] = await Promise.all([
    readFile(new URL("app/settings/page.tsx", root), "utf8"),
    readFile(new URL("app/guide/page.tsx", root), "utf8"),
    readFile(new URL("app/guide/layout.tsx", root), "utf8"),
    readFile(new URL("app/guide/guide-panel.tsx", root), "utf8"),
    readFile(new URL("app/admin-guide.ts", root), "utf8"),
    readFile(new URL("app/api/businesses/route.ts", root), "utf8"),
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
    readFile(new URL("app/home-client.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.doesNotMatch(settings, />가이드<\/button>/);
  assert.match(page, /<AdminNav current="guide"/);
  assert.match(layout, /<AdminLayout returnTo="\/guide">/);
  assert.doesNotMatch(layout, /requireSettings/);
  assert.match(panel, /<details/);
  assert.match(panel, /section\.steps && <ol>/);
  assert.match(panel, /section\.bullets && <ul>/);
  assert.match(panel, /className="guide-note"/);
  assert.match(guide, /title: "5\. 외부 연결",\s*steps:/);
  assert.match(guide, /title: "10\. 상담내역 확인",\s*bullets:/);
  assert.match(guide, /title: "11\. 확인 필요 상담 처리",\s*steps:/);
  assert.match(guide, /title: "12\. 답변이 부정확할 때 개선하는 방법",\s*bullets:/);
  assert.match(guide, /답변 보완: 실제 답변 내역에 추가할 내용 또는 뺄 내용을 입력해요/);
  assert.match(guide, /위 분류는 답변 품질 관리를 위한 편의상 구분이에요/);
  assert.match(panel, /\* \{note\}/);
  assert.match(guide, /충돌 의심.*확인 필요.*담당자 문의/);
  assert.doesNotMatch(guide, /합니다\.|됩니다\.|있습니다\.|않습니다\.|입니다\./);
  assert.match(guide, /title: "13\. 자료 최적화"/);
  assert.match(guide, /질문이 100회\(질문·답변 합계 200개\)/);
  assert.match(guide, /title: "18\. 운영 시 주의사항"/);
  assert.match(css, /\.guide-section-body ul \{ list-style: disc; \}/);
  assert.match(css, /\.login-brand \{[^}]*width: fit-content;[^}]*margin: 0 auto 32px;/);
  assert.match(css, /\.login-brand b \{[^}]*16\.3px/);
  assert.match(css, /\.guide-section-body \{ padding: 22px;/);
  assert.match(css, /\.admin-pagination \{[^}]*padding: 20px 16px;/);
  assert.match(panel, /가이드 챗봇 열기/);
  assert.match(guide, /사업 안내 챗봇 운영 가이드/);
  assert.doesNotMatch(guide, /"자료 충돌: /);
  assert.match(businesses, /account \? \[\.\.\.businesses, adminGuideBusiness\] : businesses/);
  assert.match(businesses, /운영 가이드는 수정할 수 없습니다/);
  assert.match(chat, /if \(businessId === ADMIN_GUIDE_BUSINESS_ID\)/);
  assert.match(chat, /const account = await getAdminSession\(\);\s*if \(!account\)/);
  assert.match(chat, /return reply\(\{ answer, question \}\);/);
  assert.match(home, /ADMIN_GUIDE_BUSINESS_NAME/);
});

test("Drive export is protected and versioned", async () => {
  const route = await readFile(new URL("app/api/export/route.ts", root), "utf8");
  assert.match(route, /DRIVE_EXPORT_KEY/);
  assert.match(route, /authorization/);
  assert.match(route, /dataVersion/);
  assert.match(route, /Cache-Control/);
});
