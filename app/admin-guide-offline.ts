import { ADMIN_GUIDE_BUSINESS_NAME, ADMIN_GUIDE_SECTIONS, type AdminGuideSection } from "./admin-guide";
import type { Answer } from "./answer-response";

const TOPICS = [
  ["누가", "왜", "만들", "제작", "개발", "재단", "비영리"],
  ["처음", "시작", "설치", "api", "키", "제미나이", "연결"],
  ["사업 등록", "사업 추가", "사업 생성", "공개", "비공개", "사업명"],
  ["자료 등록", "자료 추가", "업로드", "pdf", "웹사이트", "텍스트", "랜덤"],
  ["자료 관리", "최신 자료", "이전 연도", "사용 해제"],
  ["링크", "공유", "외부 연결", "홈페이지"],
  ["판단 순서", "답변 순서", "근거 검색"],
  ["답변 결과", "가능", "불가능", "정보 필요", "기본 안내"],
  ["답변 원칙", "개인정보", "민감", "판정"],
  ["충돌", "서로 다른", "상충"],
  ["상담내역 확인", "조회", "필터", "통계", "근무 외"],
  ["확인 필요", "검토", "답변 보완"],
  ["부정확", "잘못", "개선", "보완"],
  ["최적화", "글자", "제한", "150", "100회", "5만"],
  ["다운로드", "엑셀", "excel", "삭제", "내려받", "복구"],
  ["기관명", "로고", "색상", "컬러", "썸네일", "아이콘", "말투", "디자인"],
  ["관리자", "계정", "권한", "비밀번호", "로그인"],
  ["주기", "주 1회", "공고 변경", "사업 종료"],
  ["주의사항", "주의", "운영 시"],
];

function sectionText(section: AdminGuideSection) {
  return [section.title, ...(section.paragraphs || []), ...(section.bullets || []).map(line => `• ${line}`),
    ...(section.steps || []).flatMap((line, index) => [`${index + 1}. ${line}`, ...(section.stepNotes || []).filter(note => note.after === index + 1).map(note => `  ${note.text}`)]),
    ...(section.notes || []), ...(section.indented || [])].join("\n");
}

// Deterministic document lookup only: no external API, credentials or operating data.
export function offlineGuideAnswer(question: string): Answer {
  const normalized = question.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const number = normalized.match(/(?:^|\s)(\d{1,2})\s*(?:번|항목|장|\.)/);
  const numbered = number ? ADMIN_GUIDE_SECTIONS[Number(number[1]) - 1] : undefined;
  const ranked = ADMIN_GUIDE_SECTIONS.map((section, index) => ({ section,
    score: (TOPICS[index] || []).reduce((score, word) => score + (normalized.includes(word) ? word.length : 0), 0),
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  const selected = numbered ? [numbered] : ranked.slice(0, 2).map(item => item.section);
  const text = selected.length
    ? `가이드 문서에서 찾은 기본 안내입니다.\n\n${selected.map(sectionText).join("\n\n")}\n\nAPI 없이 제공하는 문서 안내로, 현재 운영 데이터나 설정 상태를 조회한 결과는 아닙니다.`
    : `가이드 문서에서 관련 항목을 찾지 못했어요. ‘처음 시작하기’, ‘API 키 등록’, ‘PDF 업로드’, ‘기관 로고’, ‘관리자 권한’처럼 운영 방법을 질문하거나 가이드 항목 번호를 알려 주세요. 현재 운영 데이터에 대한 AI 답변은 API 연결이 필요해요.`;
  return { text, source: ADMIN_GUIDE_BUSINESS_NAME, page: 0, confidence: selected.length ? 100 : 0, review: false, decision: "fact" };
}
