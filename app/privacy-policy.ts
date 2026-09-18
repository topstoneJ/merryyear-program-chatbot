export const DEFAULT_PRIVACY_POLICY = `{기관명}(이하 “기관”)은 개인정보 보호법 등 관계 법령을 준수하며 다음과 같이 개인정보를 처리합니다.

1. 처리하는 개인정보
• 챗봇 상담: 선택한 사업, 질문과 같은 대화에서 주고받은 내용, 챗봇 답변, 답변 근거·유형·검토 상태, 상담 일시
• 관리자 계정: 아이디, 암호화된 비밀번호, 담당 사업과 권한, 계정 생성·수정 일시
• 이용자는 이름, 연락처, 주민등록번호, 상세주소, 계좌번호 등 개인을 식별할 수 있는 정보를 입력하지 않아야 합니다. 주민등록번호 형식의 정보가 입력되면 외부 AI 전송과 상담기록 저장 전에 마스킹합니다.

2. 처리 목적과 보유기간
• 챗봇 상담 정보는 질문 분석, 답변 제공, 상담 품질 확인을 위해 처리하며 상담일로부터 1년간 보관합니다.
• 관리자 계정 정보는 본인 확인과 권한 관리를 위해 계정 삭제 시까지 보관합니다.
• 보유기간이 끝나거나 목적이 달성된 개인정보는 복구할 수 없는 방법으로 지체 없이 파기합니다.

3. 개인정보 처리 위탁 및 국외 이전
• Microsoft Azure: 웹서비스, 데이터베이스와 파일 저장을 위해 Korea Central(국내 중부) 리전을 사용합니다.
• OpenAI GPT API: 질문 분석과 답변 생성을 위해 이용자의 질문, 같은 대화의 이전 질문·답변, 선택한 사업의 공개·활성 자료와 답변 설정이 암호화된 통신망을 통해 OpenAI의 해외 처리시설로 전송될 수 있습니다.
• OpenAI API 요청에는 응답 저장을 비활성화하는 설정(store: false)을 사용합니다. API 입력과 출력은 이용자가 별도로 제공에 동의하지 않는 한 모델 학습에 사용되지 않습니다. 다만 OpenAI의 기본 정책에 따라 오남용 방지 로그에 일부 내용이 포함되어 최대 30일간 보관될 수 있습니다.
• 국외 이전을 원하지 않는 이용자는 챗봇을 사용하지 않고 해당 사업 담당자에게 전화나 이메일로 문의할 수 있습니다.

4. 제3자 제공
기관은 정보주체의 동의 또는 법률상 근거가 있는 경우를 제외하고 개인정보를 제3자에게 제공하지 않습니다.

5. 이용자의 권리
이용자는 개인정보의 열람, 정정·삭제, 처리정지와 동의 철회를 요구할 수 있습니다. 상담기록 확인이나 삭제를 요청할 때에는 상담 일시, 선택한 사업, 질문 내용 등 기록을 식별할 수 있는 정보가 필요할 수 있습니다.

6. 보호조치 및 쿠키
기관은 접근권한 관리, 비밀번호 암호화, 전송구간 암호화와 접근통제 등 안전성 확보조치를 시행합니다. AI가 생성한 답변은 등록자료의 출처·페이지와 판정값을 서버에서 다시 확인하며, 최종 선정·지급 등 사람의 판단이 필요한 사항은 담당자 확인을 안내합니다. 일반 이용자를 광고 목적으로 추적하는 쿠키는 사용하지 않으며, 관리자 화면은 로그인 유지를 위한 필수 쿠키를 최대 12시간 사용합니다.

7. 개인정보 문의
개인정보 관련 문의, 열람·삭제 요청과 고충처리는 {연락처}로 연락해 주세요. 개인정보 침해 상담은 개인정보침해신고센터(국번 없이 118) 또는 개인정보분쟁조정위원회(1833-6972)를 이용할 수 있습니다.

이 방침은 2026년 9월 17일부터 적용됩니다.`;

export function resolvePrivacyPolicy(content: string | null | undefined, organizationName: string, contact: string) {
  return (content?.trim() || DEFAULT_PRIVACY_POLICY)
    .replaceAll("{기관명}", organizationName || "기관")
    .replaceAll("{연락처}", contact || "기관 개인정보 담당부서");
}

export type PrivacyRuntimeState = {
  server: string;
  region?: string;
  apiProvider: "Google" | "OpenAI" | "Anthropic" | "연결되지 않음";
  apiModel?: string;
};

export function refreshPrivacyPolicyDraft(content: string, state: PrivacyRuntimeState) {
  const current = content.trim() || DEFAULT_PRIVACY_POLICY;
  const location = state.region ? `${state.server}(${state.region})` : state.server;
  const ai = state.apiProvider === "연결되지 않음"
    ? "• AI API: 현재 연결된 외부 AI API가 없습니다. API가 연결되면 질문과 사업 자료가 답변 생성을 위해 해당 공급자에게 전송될 수 있으므로 방침을 다시 새로고침해야 합니다."
    : `• ${state.apiProvider} API${state.apiModel ? `(${state.apiModel})` : ""}: 질문 분석과 답변 생성을 위해 이용자의 질문, 같은 대화의 이전 질문·답변, 선택한 사업의 공개·활성 자료와 답변 설정이 암호화된 통신망을 통해 전송될 수 있습니다.`;
  const openAi = state.apiProvider === "OpenAI"
    ? "\n• OpenAI API 요청에는 응답 저장을 비활성화하는 설정(store: false)을 사용합니다. API 입력과 출력의 처리·보관은 OpenAI의 적용 정책을 따릅니다."
    : "";
  const section = `3. 개인정보 처리 위탁 및 국외 이전\n• 서비스 운영 서버: ${location} 환경을 사용합니다.\n${ai}${openAi}\n• 국외 이전을 원하지 않는 이용자는 챗봇을 사용하지 않고 해당 사업 담당자에게 전화나 이메일로 문의할 수 있습니다.`;
  const sectionPattern = /3\. 개인정보 처리 위탁 및 국외 이전[\s\S]*?(?=\n4\.\s)/;
  return sectionPattern.test(current) ? current.replace(sectionPattern, section) : `${current}\n\n${section}`;
}
