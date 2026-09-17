# 답변 계약 v5

Gemini, OpenAI GPT, Anthropic Claude가 같은 질문·자료·시스템 규칙과 서버 검증을 사용한다. 모델이 규칙을 완벽히 지킨다는 보장은 하지 않는다. 이 계약은 확인 가능한 모순과 근거 위조를 차단하며, 원문 해석·조건 누락·계산의 의미적 정확성은 모델 평가와 운영 검토가 여전히 필요하다.

## 응답 생성과 검증

`answer-rules.ts`의 사업 정책과 저장된 표현 옵션에 `answer-contract.ts`의 계약을 적용한다. 12개 출력 필드 중 `questionTarget`은 일반 정보/특정 항목/개인 전체 자격/시스템 기능/개별 상태/무관한 질문을 구분한다. `eligibilityEvidence`는 개인 자격 판정에만 채우며, 나머지는 빈 배열이다.

| 확인 상태 | 허용 판정 |
| --- | --- |
| complete | fact 또는 근거가 확인된 possible/impossible |
| partial | fact, 검토 필요 |
| needs_user | need_info |
| missing_policy / conflict / action_required | consult, 검토 필요 |

개인 전체 자격의 possible/impossible은 document 근거가 있고 검토 표시가 없는 complete 답변에만 허용한다. 원문 인용은 해당 자료의 한 섹션에 실제 있어야 하고, 사용자 조건 인용은 현재/이전 사용자 메시지에 있어야 한다. 과거 AI 답변은 사용자 조건의 근거가 아니다. possible에는 unmet 항목을 허용하지 않고 impossible에는 적어도 하나의 unmet 근거가 필요하다. 알려진 충돌에 걸리는 인용은 확정 판정에 쓸 수 없다. 모든 정책 조건이 빠짐없이 제시됐는지, 인용된 조건의 해석이 맞는지까지 문자열 검증으로 증명하지는 않는다.

일반 FAQ는 개인 판정과 개인정보 추가 질문을 하지 않는다. 부족한 자료를 임의로 fact로 바꾸지 않고 consult 또는 검토 대상 partial로 남긴다. 판정과 정면으로 충돌하는 도입부는 삭제해서 통과시키지 않고 답변 전체를 재검토하도록 한다. 출처 문단은 서버가 실제 자료명·검증된 페이지로 조립한다. 등록된 연락처가 있어도 자료 부족·충돌에 대한 검토 표시를 해제하지 않는다.

정상 응답은 모델 호출 1회다. 의미/형식 검증 실패 시 오류 코드만 시스템 지시로 추가해 최대 한 번 수정 요청한다. 모델 원문이나 질문·키를 오류 로그에 저장하지 않는다. 두 번 실패하면 오류를 반환하고 잘못된 답변을 상담내역·FAQ 사용 답변·캐시에 저장하지 않는다. 근거 없는 fact는 기존 동작대로 원문을 폐기하고 안전한 자료 부족 안내로 대체한다.

## 제공자별 연결

| 연결 키 | 기본 모델 | API | 구조화 출력 |
| --- | --- | --- | --- |
| Gemini 키 | gemini-3.8-flash | Interactions | response_format |
| sk-… | gpt-5.4-mini | Responses | text.format, strict=true |
| sk-ant-… | claude-sonnet-4-6 | Messages | output_config.format |

Claude 키를 OpenAI 키보다 먼저 구분한다. 기본 모델은 각각 `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`로 바꿀 수 있다. 커스텀 모델은 해당 제공자의 구조화 출력을 지원해야 한다. 알 수 없는 모델의 단가는 추정하지 않고 미집계로 남긴다. 별도 공급자의 OpenAI 호환 엔드포인트는 현재 지원 범위가 아니다.

관리 화면에 저장한 키가 우선이며, 미등록 상태의 환경 키 선택 순서는 OpenAI → Gemini → Anthropic이다. 명시적으로 키를 삭제한 상태에서는 환경 키로 재연결하지 않는다. Claude의 캐시 읽기·쓰기 토큰은 일반 입력과 구분해 요금에 반영하며, 이미 출력 토큰에 포함된 생각 토큰을 중복 과금하지 않는다. 기본 Claude 단가는 2026-09-17 확인 기준, 입력 $3/출력 $15/캐시 읽기 $0.30(100만 토큰당)이다.

응답의 미완료·거절 상태는 정상 답변으로 처리하지 않는다. PDF/OCR 추출 및 문서 구조화 프롬프트·스키마는 상담 답변 계약과 분리돼 있다. 공통 API 전송부만 공유하며 PDF 섹션·페이지를 상담 판정 필드로 변환하거나 합치지 않는다.

## FAQ와 변경 반영

사업 자료, 답변 옵션, 시스템 프롬프트 본문, 계약 버전, 실제 제공자·모델, 기준일이 달라지면 이전 FAQ를 재사용하지 않는다. 이전 답변은 관리자 검토용으로 남고 ‘전체 재생성’으로 새 기준에 맞게 준비한다. 자동 유료 일괄 재생성은 실행하지 않는다. 현재 대화 이력이 있으면 FAQ 바로답변을 건너뛰고 맥락을 유지한다.

`ready` 행이라도 `fact`, `review=false`, 출처·페이지·유형·본문 형식을 다시 확인한다. 검증 코드를 바꿀 때는 `ANSWER_CONTRACT_VERSION`을 함께 올린다.

## 검증

`node --test tests/answer-contract.test.mjs tests/fast-answer-contract.test.mjs tests/api-usage.test.mjs`로 제공자 변환, 판정 조합, 인용 검증, 재시도 상한, 잘못된 답변의 저장 차단, FAQ 갱신, Claude 사용량을 검사한다. 이 테스트는 모의 API 응답을 사용한다. 실제 모델별 품질·지연 평가는 각 제공자의 사용 가능한 키로 동일한 사업 자료와 질문 세트를 사용해 별도로 실시해야 한다.

공식 API 참고: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Gemini Interactions](https://ai.google.dev/api/interactions-api-v1), [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Claude Messages](https://platform.claude.com/docs/en/api/messages/create), [Claude 요금](https://platform.claude.com/docs/en/about-claude/pricing).
