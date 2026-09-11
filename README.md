# 사업 안내 챗봇 v4

사업 자료를 근거로 질문에 답하고 상담 기록과 운영 설정을 관리하는 Next.js 기반 챗봇입니다. 사용자 화면에서는 사업별 질문과 근거가 있는 답변을 제공하고, 관리자 화면에서는 사업·지식 자료·상담 내역·답변 규칙·브랜드·API 사용 설정을 관리합니다.

## 주요 기능

- 메인 컬러(기본 검정)로 버튼·테두리·강조색을, 서브 컬러(기본 회색)로 메인 배경·사용자 말풍선을 설정합니다. 기존에 저장된 기관 색상은 유지합니다.
- 링크 공유 썸네일의 초기 상태는 흰색입니다. 디자인 설정의 ‘기본 이미지’는 현재 기관 로고를 흰색 배경 중앙에 배치한 PNG를 생성·등록합니다.
- API 설정 화면은 사용 모델과 키 등록 여부를 구분하며, 키 등록만으로 실제 연결 성공이라고 표시하지 않습니다.
- 관리자 가이드 챗봇은 API 키 없이 문서 기반 기본 안내를 제공합니다. 현재 운영 상태를 활용한 AI 답변에는 API 연결이 필요하며 가이드 대화는 상담내역에 기록하지 않습니다.
- 활성 사업과 지식 자료를 범위로 제한한 근거 기반 답변
- 출처 문서와 페이지 검증, 자료 충돌 감지, 자료 부족 안내
- 상담 기록 조회·분류·보완 답변·내보내기
- PDF 기반 지식 자료 등록과 공개 범위 관리
- 답변 규칙, 모델, API, 브랜드 이미지와 화면 문구 설정
- 관리자 계정별 상담·자료·설정 화면 접근 권한
- Azure PostgreSQL과 Azure Blob Storage 연동
- GitHub Actions를 통한 Azure App Service 자동 배포와 상태 확인

답변 판정과 근거 처리의 상세 규칙은 [docs/answer-rules-v4.md](docs/answer-rules-v4.md)를 참고하세요.

## 로컬 실행

### 요구 사항

- Node.js 22 이상
- pnpm 10
- 로컬에서는 PostgreSQL 설치가 필요 없습니다. Node.js 내장 SQLite를 사용합니다.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

기본 개발 주소는 `http://localhost:3000`입니다. `pnpm dev`는 이 컴퓨터에서만 접속 가능한 로컬 서버를 실행합니다. 데이터는 `.local-data/chatbot.sqlite`, 업로드 파일은 `.local-data/objects/`에 저장되며 서버 재시작이나 소스 업데이트 후에도 유지됩니다.

최초 실행 시 로컬 관리자 ID `chatbot01`과 무작위 비밀번호·암호화 키가 `.local-data/settings.json`에 생성됩니다. 이 파일에서 초기 비밀번호를 확인하세요. 이미 생성된 관리자 비밀번호 변경은 설정 화면에서 합니다. 이 파일의 암호화 키를 삭제하거나 교체하지 마세요. AI 사용은 로컬 설정 화면에서 API 키를 별도로 입력합니다.

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
| AI 모델 | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| 자료 내보내기 | `DRIVE_EXPORT_KEY` |
| 관리자 부트스트랩 | `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_BOOTSTRAP_REVISION` |
| 관리자 보안 | `ADMIN_SESSION_SECRET`, `API_KEY_ENCRYPTION_SECRET` |
| 데이터베이스 | `DATABASE_URL`, `DATABASE_POOL_SIZE` |
| Azure Storage | `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_CONTAINER_NAME`, `AZURE_STORAGE_CONNECTION_STRING` |
| 서비스 주소 | `SITE_URL` |

Azure에서는 Storage 연결 문자열보다 관리 ID를 우선 사용합니다. 어떤 비밀값도 README, 마이그레이션, GitHub Actions 워크플로에 직접 기록하지 않습니다.

## 관리자와 권한

- 최고관리자는 관리자 계정을 생성·수정·삭제하고 화면별 접근 권한을 관리합니다.
- 관리자 수정 화면에서 아이디와 비밀번호를 변경할 수 있습니다.
- 비밀번호는 영어 대문자·소문자·특수기호를 포함해 8자 이상이어야 하며 입력은 20자로 제한됩니다.
- `설정화면 접근` 권한과 `최고관리자` 권한은 별도로 관리합니다.
- 최고관리자 권한 변경은 최고관리자만 수행할 수 있고, 시스템에는 항상 최소 1명의 최고관리자가 남아야 합니다.
- 운영 계정의 비밀번호·해시·세션 정보는 소스와 문서에 저장하지 않습니다. 초기 최고관리자 아이디는 `ADMIN_ID` 설정으로만 지정합니다.

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

## 프로젝트 구조

| 경로 | 역할 |
| --- | --- |
| `app/` | 사용자·관리자 화면과 API 라우트 |
| `db/` | PostgreSQL 접근, 스키마 초기화, 도메인 쿼리 |
| `drizzle/` | 스키마 전용 마이그레이션과 메타데이터 |
| `public/` | 범용 정적 이미지와 PDF.js 런타임 |
| `tests/` | 기능·보안·배포 데이터 안전성 회귀 테스트 |
| `.github/workflows/` | Azure 빌드·배포 자동화 |
