열매나눔재단 사업 안내 챗봇

사업 자료를 근거로 질문에 답하고 상담 기록과 운영 설정을 관리하는 Next.js 기반 챗봇입니다. 사용자 화면에서는 사업별 질문과 근거가 있는 답변을 제공하고, 관리자 화면에서는 사업·지식 자료·상담 내역·답변 규칙·브랜드·API 사용 설정을 관리합니다.

제출용 사업 설명, 이용자·관리자 가이드, 임팩트 계획, 개인정보·AI 윤리 안내는 [최종 제출 문서](docs/FINAL_SUBMISSION.md)에서 확인할 수 있습니다.

## 도입 전 필수 확인

- 최초 관리자 암호를 확인하고 교체하며 설정·사업·상담 권한은 필요한 범위만 부여합니다. 기존 설치의 암호는 코드 업데이트로 바뀌지 않습니다.
- 사용할 AI 공급자와 모델을 정하고 실제 계약의 전송 국가·보관·삭제 조건, 기관 담당자·연락처·시행일을 개인정보처리방침에 반영합니다. 공급자를 바꾸면 설정에서 초안을 갱신한 뒤 검토하고 저장합니다.
- 채팅 화면의 고정 개인정보 안내와 기관 안내 문구를 확인합니다. 이름·주소 등 모든 개인정보를 자동으로 찾을 수 있는 것은 아닙니다.
- 공급사 콘솔에서 예산 알림과 사용 한도를 설정합니다. 이 앱의 IP별 질문 제한이 기관 전체의 비용 상한을 보장하지는 않습니다.
- 보안 패치와 테스트를 적용하고 Azure 실제 실행 Node 버전, HTTPS 전용·최소 TLS, DB·Blob의 지역을 확인합니다.
- 상담 만료 삭제와 파일 삭제 재시도 작업을 활성화하고 실행 실패를 점검합니다. 설정 방법과 한계는 [운영 보안 안내](docs/OPERATIONS_SECURITY.md)에 있습니다.
- `DRIVE_EXPORT_KEY`와 `RETENTION_MAINTENANCE_KEY`는 서로 다른 32자 이상의 난수로 설정합니다. 기능을 쓰지 않으면 비워 둡니다.

이 안내는 법률 자문이 아니며, 기관은 실제 처리 방식에 맞춰 법률 검토를 진행해야 합니다.

## 주요 기능

- 메인 컬러(기본 검정)로 버튼·테두리·강조색을, 서브 컬러(기본 회색)로 메인 배경·사용자 말풍선을 설정합니다. 기존에 저장된 기관 색상은 유지합니다.
- 링크 공유 썸네일의 초기 상태는 흰색입니다. 디자인 설정의 ‘기본 이미지’는 현재 기관 로고를 흰색 배경 중앙에 배치한 PNG를 생성·등록합니다.
- API 설정 화면은 사용 모델과 키 등록 여부를 구분하며, 키 등록만으로 실제 연결 성공이라고 표시하지 않습니다.
- 관리자 가이드 챗봇은 API 키 없이 문서 기반 기본 안내를 제공합니다. 현재 운영 상태를 활용한 AI 답변에는 API 연결이 필요하며 가이드 대화는 상담내역에 기록하지 않습니다.
- 활성 사업과 지식 자료를 범위로 제한한 근거 기반 답변
- 자료 관리에서 정책 규칙 초안·원문 대조·버전 승인. 승인된 금액·예외는 서버가 처리하며 자료 변경 시 재승인 전까지 적용 중단
- 출처 문서와 페이지 검증, 자료 충돌 감지, 자료 부족 안내
- 상담 기록 조회·분류·보완 답변·내보내기
- PDF 기반 지식 자료 등록과 공개 범위 관리
- Azure 내부 Docling 컨테이너를 통한 OCR·표·레이아웃 보존 PDF 분석(미설정 시 PDF.js 사용)
- 답변 규칙, 모델, API, 브랜드 이미지와 화면 문구 설정
- 관리자 계정별 상담·자료·설정 화면 접근 권한
- Azure PostgreSQL과 Azure Blob Storage 연동
- GitHub Actions를 통한 Azure App Service 자동 배포와 상태 확인

답변 판정과 근거 처리의 기존 정책은 [docs/answer-rules-v4.md](docs/answer-rules-v4.md), 판정 계약은 [docs/answer-contract-v5.md](docs/answer-contract-v5.md), 현재 API 공통 근거 검수와 오류 처리·운영 방법은 [docs/answer-contract-v6.md](docs/answer-contract-v6.md)를 참고하세요.

## 로컬 실행

### 요구 사항

- Node.js 22.23.4 이상 22.x 또는 24.22.1 이상 24.x의 최신 보안 패치
- pnpm 10
- 로컬에서는 PostgreSQL 설치가 필요 없습니다. Node.js 내장 SQLite를 사용합니다.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

기본 개발 주소는 `http://localhost:3000`입니다. `pnpm dev`는 이 컴퓨터에서만 접속 가능한 로컬 서버를 실행합니다. 데이터는 `.local-data/chatbot.sqlite`, 업로드 파일은 `.local-data/objects/`에 저장되며 서버 재시작이나 소스 업데이트 후에도 유지됩니다.

최초 실행 시 로컬 관리자 ID `administrator`, 설치마다 다른 무작위 초기 비밀번호와 암호화 키가 `.local-data/settings.json`에 생성됩니다. 초기 비밀번호는 해당 파일에서 확인하고 로그인 후 설정 화면에서 교체합니다. 이미 생성된 관리자 정보는 덮어쓰지 않으므로 기존 설치에서 사용한 알려진 초기 암호도 직접 교체해야 합니다. 이 파일의 암호화 키를 삭제하거나 교체하지 마세요. AI 사용은 로컬 설정 화면에서 API 키를 별도로 입력합니다.

Azure App Service에서는 `WEBSITE_INSTANCE_ID`로 실행 환경을 확인해 기존 PostgreSQL·Blob Storage를 사용합니다. 로컬에 Azure 연결 변수가 있어도 로컬 서버는 이를 사용하지 않습니다. Azure에서 로컬 저장소를 선택하거나 로컬에서 Azure 저장소를 선택하면 실행이 거부됩니다.

로컬 수정 작업은 이 GitHub 저장소 폴더에서 진행합니다. 저장만으로 배포되지는 않으며, 검증한 소스코드를 `main`에 커밋·푸시하면 GitHub Actions가 Azure 프로그램을 업데이트합니다. 로컬 데이터와 Azure 데이터는 서로 복사하거나 동기화하지 않습니다. 예전 작업 폴더의 데이터도 자동 이동하지 않습니다.

`.env.local`과 `.local-data/`는 Git에서 제외합니다. Actions는 추적 파일과 최종 배포 패키지에 로컬 데이터·환경 파일이 포함되면 배포를 중단합니다.

### 검증 명령

```bash
pnpm test
pnpm lint
pnpm build
```

`pnpm test`는 배포용 Next.js 빌드와 Node 회귀 테스트를 함께 실행합니다. Drizzle 스키마 변경 후 마이그레이션 파일을 만들 때는 `pnpm db:generate`를 사용합니다.

## 환경 변수

저장소에는 아래 변수의 이름과 비밀값이 없는 예시만 둡니다. 실제 값은 로컬 환경이나 Azure App Service 애플리케이션 설정에서 관리합니다.

| 구분 | 변수 |
| --- | --- |
| AI 모델 | `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| 자료 내보내기 | `DRIVE_EXPORT_KEY` |
| 관리자 부트스트랩 | `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_BOOTSTRAP_REVISION` |
| 관리자 보안 | `ADMIN_SESSION_SECRET`, `API_KEY_ENCRYPTION_SECRET` |
| 데이터베이스 | `DATABASE_URL`, `DATABASE_POOL_SIZE` |
| Azure Storage | `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER_NAME`, `AZURE_STORAGE_CONNECTION_STRING` |
| PDF 분석 | `DOCLING_SERVICE_URL`, `DOCLING_SHARED_SECRET`, `DOCLING_TIMEOUT_MS` |
| 서비스 주소 | `SITE_URL` |
| 보존 작업 | `RETENTION_MAINTENANCE_KEY` |
| AI 요청 제한 시간 | `AI_REQUEST_TIMEOUT_MS` (기본 60,000ms, 1,000~180,000ms) |

Azure에서는 Storage 연결 문자열보다 관리 ID를 우선 사용합니다. 어떤 비밀값도 README, 마이그레이션, GitHub Actions 워크플로에 직접 기록하지 않습니다.

## 관리자와 권한

- 최고관리자는 관리자 계정을 생성·수정·삭제하고 화면별 접근 권한을 관리합니다.
- 관리자 수정 화면에서 아이디와 비밀번호를 변경할 수 있습니다.
- 비밀번호는 영어 대문자·소문자·특수기호를 포함해 8자 이상이어야 하며 입력은 20자로 제한됩니다.
- `설정화면 접근` 권한과 `최고관리자` 권한은 별도로 관리합니다.
- 최고관리자 권한 변경은 최고관리자만 수행할 수 있고, 시스템에는 항상 최소 1명의 최고관리자가 남아야 합니다.
- 운영 계정의 비밀번호·해시·세션 정보는 소스와 문서에 저장하지 않습니다. 초기 최고관리자 아이디는 `ADMIN_ID` 설정으로만 지정합니다.
- 설정관리자는 본인의 사업·상담 권한을 넘는 권한을 다른 계정에 부여하거나 상위 권한 계정을 수정·삭제할 수 없습니다. 전체 사업의 순서를 바꾸려면 모든 사업에 대한 권한이 필요합니다.
- 로그인 시도는 성공 여부와 관계없이 15분 고정 구간당 계정 10회, 주소 30회로 제한합니다. 제한 시 남은 대기 시간을 응답합니다.

## GitHub Actions와 Azure 배포

워크플로 파일은 `.github/workflows/azure-deploy.yml`입니다. `main` 브랜치에 변경 사항이 합쳐지거나 수동 실행하면 다음 순서로 배포합니다.

1. pnpm 의존성 설치
2. 빌드 및 전체 테스트 실행
3. Next.js standalone 배포 패키지 구성
4. Azure App Service 배포
5. `/api/health` 상태 확인

GitHub 저장소의 `production` 환경에는 Azure 로그인 정보인 `AZURE_CREDENTIALS` 시크릿이 필요합니다. 배포 대상은 소스코드에 직접 적지 않고 아래 저장소 변수로 설정합니다.

| GitHub 저장소 변수 | 내용 |
| --- | --- |
| `AZURE_WEBAPP_NAME` | Azure App Service 이름 |
| `AZURE_RESOURCE_GROUP` | App Service가 속한 리소스 그룹 |
| `AZURE_WEBAPP_URL` | 상태 확인에 사용할 공개 서비스 주소 |

배포 대상 App Service의 시작 명령은 standalone 출력의 `server.js`를 실행하도록 구성해야 합니다. 데이터베이스·Storage·AI·관리자 관련 환경 변수는 Azure App Service에서 별도로 유지되므로 소스 배포 패키지에 운영 데이터를 넣지 않습니다.

## 내부 데이터 제외 원칙

- PostgreSQL 행 데이터, 관리자 계정 데이터, 상담 기록, 지식 자료 원문과 Storage 객체를 Git에 커밋하지 않습니다.
- `drizzle/`에는 스키마 변경만 저장하며 운영 데이터를 넣는 `INSERT` 문을 두지 않습니다.
- 데이터베이스 파일, 백업, 배포 압축 파일, 로컬 빌드 결과는 `.gitignore`에서 제외합니다.
- GitHub Actions는 저장소 소스에서 새 standalone 패키지를 만들며 로컬 데이터 디렉터리나 기존 배포 압축 파일을 재사용하지 않습니다.
- 배포 전 `tests/deployment-data-safety.test.mjs`가 데이터 포함 방지 규칙을 검사합니다.

## 새 기관 설치와 기존 운영 데이터

- 새 데이터베이스에는 기관명, 연락처, 사업, 안내 자료가 자동 등록되지 않습니다. 최초 최고관리자가 설정 화면에서 기관 정보와 사업을 직접 등록합니다.
- 범용 기본 로고·파비콘·공유 이미지만 소스에 포함되며 특정 기관의 문서나 이미지 예시는 포함하지 않습니다.
- 프로그램 배포는 App Service의 실행 파일만 교체합니다. PostgreSQL의 사업·안내 자료·상담내역과 Blob Storage의 브랜드 이미지는 별도 저장소에 유지됩니다.
- 다른 기관에 설치할 때는 새로운 PostgreSQL, Blob Storage, App Service 설정을 사용해야 하며 기존 기관의 운영 저장소를 복제하지 않습니다.

### 필요한 서비스와 비용 산정

| 서비스 | 용도 | 필요 여부 | 비용 확인 항목 |
| --- | --- | --- | --- |
| Azure App Service | 웹·API 실행 | 운영 필수 | 리전, OS, 플랜, 인스턴스 수와 가동 시간 |
| Azure Database for PostgreSQL | 운영 자료·상담 저장 | 운영 필수 | 컴퓨팅, 저장 용량, 백업 보존 |
| Azure Blob Storage | PDF·기관 이미지 저장 | 운영 필수 | 용량, 읽기·쓰기, 네트워크 전송 |
| OpenAI·Google·Anthropic 중 선택한 API | 답변·자료 분석 | AI 기능 사용 시 | 모델, 입력·출력 토큰, 검수·재시도 횟수 |
| Container Apps·Container Registry | 자체 Docling PDF 분석 | 선택 | CPU·메모리·실행 시간·이미지 보관 |
| 로컬 Node.js·SQLite | 개발·검증 | 로컬 필수 | Azure 인프라 요금 없음, 외부 AI 사용분은 별도 |

설치 순서와 가정을 명시한 [월 비용 계산 예시](docs/INSTALLATION_COSTS.md)를 제공합니다. 2026-11-02 공개 단가를 적용한 소규모 예시의 인프라 소계는 월 약 USD 36.47이며 AI·추가 네트워크·백업·로그·세금·선택 Docling은 별도입니다. 실제 사용량은 [Azure 가격 계산기](https://azure.microsoft.com/pricing/calculator/)와 선택한 공급사의 가격표로 계산합니다. 제출 문서의 예상 비용은 당시 가정에 따른 예시이며 현재 요금 견적이 아닙니다.

## AI 공급자와 전송 범위

입력한 API 키가 `sk-ant-`로 시작하면 Anthropic, 그 밖의 `sk-`이면 OpenAI, 나머지는 Google 경로를 선택합니다. 자동 판별은 키의 실제 유효성이나 계약 조건을 검증하지 않으므로 공급사에서 발급한 키를 확인해 등록합니다. 모델은 `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`로 바꿀 수 있습니다.

일반 사업 채팅은 마스킹한 질문, 같은 대화의 질문·답변 이력(최대 100회·5만 자), 선택한 사업의 공개·활성 자료와 공통자료, 답변 설정, 사업 담당자 연락처를 외부 AI에 보낼 수 있습니다. 일반 채팅 요청에 IP·세션 번호·관리자 계정을 넣지는 않습니다. 관리자 가이드는 권한 범위의 관리자 아이디·권한·반복 질문 등 운영 상태를 포함할 수 있으며 자료 분석·재분류에도 별도 전송 경로가 있습니다.

관리자가 승인한 FAQ가 일치하면 외부 AI 호출 없이 답변합니다. 일반 답변은 생성·검수·재시도로 여러 호출이 발생할 수 있으며 자료와 이력이 많을수록 입력 비용이 늘어납니다. 지식 JSON 약 25만 자 검사는 최종 API 요청 전체의 상한을 뜻하지 않습니다. 개별 AI 호출은 기본 60초 이내로 제한하지만 여러 호출이 이어지는 전체 작업의 시간·비용 상한은 별도입니다.

응답 저장 옵션만으로 공급사의 보관·학습·국외 처리 조건을 단정하지 않습니다. 공급사 약관은 작성일 이후 달라질 수 있으므로 계약 시점의 조건과 계정 설정을 직접 확인해야 합니다. 기존에 저장된 개인정보처리방침은 코드 배포로 자동 교체되지 않습니다.

## 공개와 제3자 구성요소

소스코드는 [Apache-2.0](LICENSE), 자체 문서와 자연어 프롬프트는 [CC BY 4.0](LICENSE-DOCS)으로 공개합니다. 코드에 포함된 자연어 AI 지시문에도 CC BY 4.0을 적용하며 이를 조립·검증·실행하는 로직은 Apache-2.0입니다. 정확한 범위와 재사용 시 출처·변경 표시 방법은 [라이선스 안내](docs/LICENSING.md)에 있습니다. 기관 로고·발표자료·등록 사업자료·상담기록·인증정보는 이 공개 라이선스에서 제외합니다.

사용 구성요소·글꼴·PDF 런타임·Docling 모델은 자체 라이선스를 유지합니다. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)와 각 구성요소의 고지를 확인하세요.

보안 문제 제보 방법은 [SECURITY.md](SECURITY.md), 보존·삭제·접속기록의 한계는 [운영 보안 안내](docs/OPERATIONS_SECURITY.md)를 참고하세요.

## 프로젝트 구조

| 경로 | 역할 |
| --- | --- |
| `app/` | 사용자·관리자 화면과 API 라우트 |
| `db/` | PostgreSQL 접근, 스키마 초기화, 도메인 쿼리 |
| `drizzle/` | 스키마 전용 마이그레이션과 메타데이터 |
| `public/` | 범용 정적 이미지와 PDF.js 런타임 |
| `tests/` | 기능·보안·배포 데이터 안전성 회귀 테스트 |
| `.github/workflows/` | Azure 빌드·배포 자동화 |
