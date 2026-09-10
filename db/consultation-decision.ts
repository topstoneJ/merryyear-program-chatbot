export function decisionFromAnswer(answer: string) {
  const lead = answer.trim().split(/\n\s*\n/)[0].replace(/[*_◆]/g, "").trim();
  if (/^답변할 수 없는 질문입니다[.]?/.test(lead)) return "out_of_scope";
  if (/^말씀하신 내용에 따르면, 아쉽지만 지원해 드릴 수 없습니다[.!]?/.test(lead)) return "impossible";
  if (/^(?:아쉽지만[,，]?\s*)?불가능(?:합니다|해요)[.!]?/.test(lead)) return "impossible";
  if (/^가능(?:합니다|해요)[.!]?/.test(lead)) return "possible";
  if (/^추가\s*정보가\s*필요/.test(lead)) return "need_info";
  if (/등록된 자료\s*상으로 확인이 어렵|자료.{0,30}(충돌|서로 달라)/.test(lead)
    || /(?:담당자|담당\s*부서|담당\s*팀|재단)[\s\S]{0,100}(?:문의|확인)[\s\S]{0,40}(?:필요|주세요|하시면|바랍니다|권장|부탁)/.test(lead)) return "consult";
  return "fact";
}

export function categoryFromQuestion(question: string) {
  if (/(담당자|담당\s*(부서|팀)|연락처|전화번호|문의처|탈락|미선정|불선정|심사\s*(사유|의견)|이의\s*신청)/.test(question)) return "운영 문의";
  // Item eligibility concerns what is supported, not who may apply.
  if (/(지원\s*(물품|품목)|물품|품목|가전|가구\s*(구입|구매|지원)|냉장고|냉동고|인덕션|하이라이트|가스\s*(레인지|렌지)|세탁기|건조기|제습기|에어컨|선풍기|청소기|전기\s*(레인지|렌지|밥솥)|밥솥|전자레인지|전자렌지|텔레비전|TV|컴퓨터|노트북|침대|매트리스|책상|의자|옷장|이불|난방기|보일러|공기청정기)/i.test(question)) return "지원 내용";
  if (/(소득|월급|가구|자격|대상|신청할 수)/.test(question)) return "신청 자격";
  if (/(금액|얼마|지원금|한도|지원\s*(내용|항목|범위)|혜택|무엇을 지원|어떤 지원)/.test(question)) return "지원 내용";
  if (/(기간|언제|마감|접수)/.test(question)) return "신청 기간";
  if (/(서류|방법|어떻게|제출)/.test(question)) return "신청 방법";
  if (/가능/.test(question)) return "신청 자격";
  return "기타";
}
