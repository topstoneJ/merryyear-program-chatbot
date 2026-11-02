# 공개 라이선스와 적용 범위

네이버커넥트재단 검토 문서에 명시된 공개 동의에 따라 다음과 같이 적용합니다.

| 대상 | 적용 조건 |
| --- | --- |
| 프로젝트 자체의 프로그램 코드·설정·테스트·배포 스크립트 | Apache-2.0. 전문은 루트 `LICENSE` |
| README, `docs/`, 서비스 안내 문서 | CC BY 4.0. 전문은 루트 `LICENSE-DOCS` |
| AI에 전달하는 자연어 지시·시스템 프롬프트·답변 규칙 문구 | CC BY 4.0. 소스에 포함된 자연어 문구에도 적용하며 이를 조립·검증·실행하는 프로그램 로직은 Apache-2.0 |
| 글꼴·PDF.js·라이브러리·모델 등 제3자 구성요소 | 원래 라이선스 유지. `THIRD_PARTY_NOTICES.md`와 해당 파일의 고지 참조 |
| 기관 로고·발표자료·등록 사업자료·상담기록·인증정보 | 위 공개 라이선스의 대상에서 제외 |

프롬프트는 `app/answer-rules.ts`, `app/answer-review.ts`, `app/answer-settings.ts`,
`app/api/chat/route.ts`, `app/api/knowledge/route.ts`,
`app/api/knowledge/conflicts/route.ts`, `app/api/consultations/reclassify/route.ts`,
`db/faq.ts`, `db/semantic-category.ts` 등의 AI 지시문을 포함합니다.
변수명·타입·제어문·검증 코드나 이용자가 입력한 자료를 프롬프트 문구와 혼동하지 않습니다.

문서·프롬프트를 재사용할 때는 프로젝트명, 원본 저장소 링크, CC BY 4.0 링크와
변경 여부를 표시합니다. 기존 저작자·출처 고지를 유지합니다. 프로그램과 문서·프롬프트를
함께 배포하면 양쪽 라이선스와 제3자 고지를 함께 제공합니다. `package.json`의
`license: Apache-2.0`은 프로그램의 기본 라이선스이며 위 예외 범위를 없애지 않습니다.

표시 예: 열매나눔재단 사업 안내 챗봇 기여자, 원본 저장소
https://github.com/topstoneJ/merryyear-program-chatbot, CC BY 4.0
https://creativecommons.org/licenses/by/4.0/, 수정 여부 명시.
