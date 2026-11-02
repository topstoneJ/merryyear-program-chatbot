# 새 기관 설치와 월 비용 계산

로컬 검증은 Node.js 22.23.4 이상 22.x 또는 24.22.1 이상 24.x와 pnpm 10으로
`pnpm install --frozen-lockfile`, `pnpm dev`를 실행합니다. PostgreSQL 설치 없이
로컬 SQLite를 사용하며 신규 관리자 암호는 `.local-data/settings.json`에서 확인합니다.

Azure 운영 설치는 다음 순서로 진행합니다.

1. 새 기관 전용 App Service Linux, PostgreSQL Flexible Server, Blob 계정·컨테이너를 준비합니다.
2. PostgreSQL의 연결 주소·인증·접근 규칙, Blob의 관리 ID 권한을 설정합니다. 기존 기관의 데이터는 복사하지 않습니다.
3. `.env.example`에 설명한 `DATABASE_URL`, Storage 계정·컨테이너, `ADMIN_ID`, 난수 관리자 암호, `ADMIN_SESSION_SECRET`, `API_KEY_ENCRYPTION_SECRET`, `SITE_URL`을 App Service에 등록합니다. 키는 설치마다 새로 만들고 암호화 키는 보존합니다.
4. GitHub `AZURE_CREDENTIALS` 시크릿과 `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_URL` 변수를 구성합니다. 기본 시작 명령은 `node /home/site/wwwroot/server.js`입니다. HTTPS 전용과 최소 TLS 1.2를 적용합니다.
5. `main`에 푸시해 배포·테스트·DB 상태 검사 성공을 확인합니다. 관리자 로그인 후 암호·기관 정보·사업·공급자·개인정보처리방침을 설정합니다.
6. 별도 난수 `RETENTION_MAINTENANCE_KEY`를 GitHub와 App Service에 등록하고 `ENABLE_RETENTION_MAINTENANCE=true`로 예약 삭제를 활성화합니다. 실제 수동 실행 성공 후 매일 결과를 확인합니다.
7. Docling은 선택 기능입니다. 없어도 PDF.js로 PDF 텍스트를 처리합니다. 스캔 OCR이 필요할 때에만 컨테이너·Registry·네트워크 비용을 추가하고 `services/docling/README.md`대로 연결합니다.

## 계산 예시

다음은 실제 운영 청구서가 아닌 새 기관의 소규모 단일 인스턴스 예시입니다.
2026-11-02 Azure Retail Prices API의 Korea Central, 종량제, USD 공개 단가를 사용했습니다.
월 730시간, PostgreSQL 저장 32GB, Blob Hot LRS 5GB, 읽기·쓰기 각 1만 회를 가정합니다.

| 항목 | 예시 단가와 계산 | 월 USD |
| --- | --- | ---: |
| App Service Linux Basic B1 | 0.018/시간 × 730시간 | 13.14 |
| PostgreSQL Flexible Burstable B1MS | 0.026/시간 × 730시간 | 18.98 |
| PostgreSQL 기본 저장 | 0.131/GB·월 × 32GB | 4.192 |
| Blob Hot LRS 저장 | 첫 구간 0.020/GB·월 × 5GB | 0.10 |
| Blob 읽기·쓰기 | 읽기 0.004/1만 회 + 쓰기 0.050/1만 회 | 0.054 |
| 예시 소계 | 위 가정의 합계 | 약 36.47 |

AI API, 초과 백업·IOPS·추가 네트워크·로그·도메인·Docling, 세금은 별도입니다.
실제 구성·플랜의 가용성·최소 용량·청구 통화·환율·약정·비영리 크레딧에 따라 달라집니다.
이 예시는 권장 용량이나 실제 운영 비용을 확정하지 않습니다. 크레딧을 확정 수익으로 차감하지 않습니다.

AI 월 비용은 모델별로 `월 요청 수 × (요청당 총 입력 토큰 × 입력 100만 토큰당 단가 +
총 출력 토큰 × 출력 100만 토큰당 단가) / 1,000,000`으로 계산합니다. 생성뿐 아니라
검수·재시도·자료 분석의 호출을 합산합니다. 예를 들어 월 1,000건, 건당 총 입력 20,000·출력
2,000토큰이면 2,000만 입력·200만 출력 토큰의 단가를 적용합니다. 공급사 콘솔의 예산·사용 한도도 설정합니다.

공식 출처: [Azure 공개 단가 API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices),
[Azure 가격 계산기](https://azure.microsoft.com/pricing/calculator/),
[OpenAI 가격](https://openai.com/api/pricing/),
[Google 가격](https://ai.google.dev/gemini-api/docs/pricing),
[Anthropic 가격](https://platform.claude.com/docs/en/about-claude/pricing).
