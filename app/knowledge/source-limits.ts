export const SOURCE_LIMITS = { pdf: 10, website: 10, text: 1000, random: 1000 } as const;
export const SOURCE_LABELS = { pdf: "PDF", website: "웹사이트", text: "텍스트", random: "텍스트(랜덤)" } as const;
export type LimitedSourceKind = keyof typeof SOURCE_LIMITS;
export function sourceLimitMessage(kind: LimitedSourceKind) { return `${SOURCE_LABELS[kind]}는 사업별로 최대 ${SOURCE_LIMITS[kind].toLocaleString("ko-KR")}개까지 등록할 수 있습니다. 기존 데이터를 삭제한 후 다시 추가해 주세요.`; }
