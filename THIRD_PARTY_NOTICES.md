# 외부 구성요소와 모델 고지

확인일: 2026-11-01. 이 목록은 현재 `package.json`, `pnpm-lock.yaml`, 설치된 패키지의 메타데이터·라이선스 파일, `services/docling/requirements.txt`와 공식 배포처를 기준으로 작성했습니다. 각 구성요소의 저작권과 이용 조건은 해당 권리자에게 있습니다. 이 문서는 이 프로젝트 자체의 소스·문서·로고에 새로운 라이선스를 부여하지 않습니다.

아래 `node_modules/` 경로는 의존성 설치 후의 위치이며 Git 저장소에 포함되는 파일 경로와 구분합니다. 재배포하는 패키지에 딸린 저작권·LICENSE·NOTICE 파일도 함께 보존해야 합니다. 이 표는 주요 직접 의존성에 대한 안내이며, 간접 의존성·운영체제 패키지까지 포함한 배포물 전체의 목록을 대체하지 않습니다.

## 웹서비스 운영 의존성

| 구성요소와 확인 버전 | 용도 | 라이선스 | 라이선스 파일 또는 공식 출처 |
| --- | --- | --- | --- |
| `@azure/identity` 4.14.1 | Azure 인증 | MIT | `node_modules/@azure/identity/LICENSE` |
| `@azure/storage-blob` 12.33.0 | Azure Blob 파일 저장 | MIT | `node_modules/@azure/storage-blob/LICENSE` |
| `drizzle-orm` 0.45.2 | DB 스키마·질의 도구 | Apache-2.0 | 설치본 `package.json`의 license 및 [공식 LICENSE](https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE). 확인한 설치본 최상위에는 별도 LICENSE 파일이 없음 |
| `next` 16.4.3 | 웹서비스·API 프레임워크 | MIT | `node_modules/next/license.md` |
| `pdfjs-dist` 6.4.299 | 브라우저 PDF 텍스트 추출 | Apache-2.0 | `node_modules/pdfjs-dist/LICENSE`, 저장소에 포함된 `public/vendor/pdfjs-6.4.299/LICENSE` |
| `pg` 8.23.0 | PostgreSQL 연결 | MIT | `node_modules/pg/LICENSE` |
| `react` 19.2.6 | 사용자 화면 | MIT | `node_modules/react/LICENSE` |
| `react-dom` 19.2.6 | 화면 렌더링 | MIT | `node_modules/react-dom/LICENSE` |
| `sharp` 0.35.5 | 파비콘 등 이미지 처리 | Apache-2.0, 포함 바이너리는 별도 조건 | `node_modules/sharp/LICENSE`, 아래 libvips 고지 참조 |

`sharp`의 Apache-2.0 표기만으로 포함 바이너리 전체의 조건을 설명할 수 없습니다. 사전 빌드된 libvips와 관련 라이브러리에는 LGPLv3 및 기타 조건이 적용되는 구성요소가 포함됩니다. 실제 플랫폼용 `@img/sharp-*`, `@img/sharp-libvips-*` 패키지의 라이선스와 고지를 확인하고, 바이너리·컨테이너를 재배포할 때 해당 조건을 함께 검토해야 합니다. 패키징 스크립트와 바이너리의 라이선스가 구분된다는 점은 [공식 sharp-libvips 안내](https://github.com/lovell/sharp-libvips#licences), 구성요소별 조건은 [공식 THIRD-PARTY-NOTICES](https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md)를 참고합니다. 설치 플랫폼과 사전 빌드 선택은 [sharp 설치 문서](https://sharp.pixelplumbing.com/install/)를 참고합니다.

## 개발 도구와 타입 정의

| 구성요소와 확인 버전 | 용도 | 라이선스 | 라이선스 파일 또는 확인 위치 |
| --- | --- | --- | --- |
| `@tailwindcss/postcss` 4.2.1 | CSS 빌드 | MIT | `node_modules/@tailwindcss/postcss/LICENSE` |
| `tailwindcss` 4.2.1 | 스타일 도구 | MIT | `node_modules/tailwindcss/LICENSE` |
| `@types/node` 22.19.19 | Node.js 타입 정의 | MIT | `node_modules/@types/node/LICENSE` |
| `@types/pg` 8.23.1 | PostgreSQL 타입 정의 | MIT | `node_modules/@types/pg/LICENSE` |
| `@types/react` 19.2.14 | React 타입 정의 | MIT | `node_modules/@types/react/LICENSE` |
| `@types/react-dom` 19.2.3 | React DOM 타입 정의 | MIT | `node_modules/@types/react-dom/LICENSE` |
| `drizzle-kit` 0.31.10 | DB 마이그레이션 생성 | MIT | `node_modules/drizzle-kit/package.json`의 license. 확인한 설치본 최상위에는 별도 LICENSE 파일이 없음; 재배포 시 해당 릴리스의 원문 고지 확인 |
| `eslint` 9.39.4 | 코드 검사 | MIT | `node_modules/eslint/LICENSE` |
| `eslint-config-next` 16.4.3 | Next.js 코드 검사 설정 | MIT | 설치본 `package.json`의 license, `node_modules/next/license.md` |
| `typescript` 5.9.3 | 타입 검사·컴파일 | Apache-2.0 | `node_modules/typescript/LICENSE.txt`, `node_modules/typescript/ThirdPartyNoticeText.txt` |

## 글꼴

Noto Sans KR은 한글 화면 표시를 위해 포함되어 있으며 SIL Open Font License 1.1을 따릅니다. 저장소의 `public/fonts/noto-sans-kr/OFL.txt`에 저작권 고지와 라이선스 전문이 있습니다. 해당 파일에 기재된 저작권·Reserved Font Name 조건을 유지합니다.

## 선택 설치하는 Docling 서비스

`services/docling/requirements.txt`의 직접 패키지 기준입니다. Python 패키지 설치 후에는 해당 배포본의 `.dist-info/` 아래 라이선스 파일과 메타데이터를 함께 확인합니다. 아래 링크는 공식 원문 위치이며, 실제 이미지의 정확한 패키지 버전과 함께 고지를 보관해야 합니다.

| 구성요소와 고정 버전 | 용도 | 라이선스 | 공식 원문 |
| --- | --- | --- | --- |
| `docling[easyocr]` 2.145.0 | PDF 구조·표·OCR 변환 | MIT, 모델은 별도 | [Docling LICENSE](https://github.com/docling-project/docling/blob/main/LICENSE) |
| `fastapi` 0.162.0 | 변환 HTTP API | MIT | 설치 경로의 `fastapi-0.162.0.dist-info/licenses/LICENSE`, [공식 원문](https://github.com/fastapi/fastapi/blob/master/LICENSE) |
| `python-multipart` 0.0.33 | PDF 업로드 처리 | Apache-2.0 | 설치 경로의 `python_multipart-0.0.33.dist-info/licenses/LICENSE.txt`, [공식 원문](https://github.com/Kludex/python-multipart/blob/main/LICENSE.txt) |
| `uvicorn` 0.54.0 | ASGI 서버 | BSD-3-Clause | 설치 경로의 `uvicorn-0.54.0.dist-info/licenses/LICENSE.md`, [공식 원문](https://raw.githubusercontent.com/Kludex/uvicorn/main/LICENSE.md) |
| EasyOCR 코드 | 한국어·영어 OCR, Docling의 추가 의존성 | Apache-2.0 | [EasyOCR LICENSE](https://github.com/JaidedAI/EasyOCR/blob/master/LICENSE); 실제 설치 버전은 이미지의 패키지 목록에서 확인 |

## Docling이 다운로드하는 모델

Dockerfile은 이미지 빌드 중 `docling-tools models download`로 `layout`, `tableformer`, `easyocr` 및 한국어·영어 OCR 모델을 받습니다. 아래 표는 공식 모델 카드의 확인 결과이며, 모델 파일의 라이선스를 Docling 또는 EasyOCR 코드 라이선스와 동일하다고 일괄 판단하지 않습니다.

| 모델 | 용도 | 확인된 조건과 출처 |
| --- | --- | --- |
| `docling-layout-heron` | 문서 영역·레이아웃 인식 | 공식 모델 카드에 Apache-2.0 표기. [모델 카드](https://huggingface.co/docling-project/docling-layout-heron) |
| `docling-models`의 TableFormer | 표 구조 인식 | 공식 모델 카드에 CDLA-Permissive-2.0과 Apache-2.0이 함께 표기되어 있음. 실제 다운로드한 파일·리비전에 해당하는 조건을 구분하여 보존. [모델 카드](https://huggingface.co/docling-project/docling-models) |
| EasyOCR 검출·한국어·영어 인식 가중치 | OCR 문자 검출·인식 | 코드의 Apache-2.0만으로 개별 가중치의 조건이 확인되는 것은 아님. 별도 가중치 이용 조건은 이번 확인에서 확정하지 못했으며 배포·재배포 전에 해당 파일의 조건 확인 필요. 공식 [모델 설정과 다운로드 출처](https://github.com/JaidedAI/EasyOCR/blob/master/easyocr/config.py), [프로젝트](https://github.com/JaidedAI/EasyOCR) |

현재 Dockerfile은 다운로드할 모델의 저장소 리비전·파일 해시를 직접 지정하지 않습니다. 따라서 이 문서의 모델 이름만으로 실제 배포 이미지의 가중치 버전이 고정되었다고 볼 수 없습니다. 이미지 빌드 시 Python 패키지 전체 목록, 모델 저장소와 리비전, 파일명·해시, 다운로드 당시 모델 카드·라이선스 및 이미지 digest를 기록해 보관합니다. 모델을 변경하거나 이미지를 다시 빌드하면 이 목록도 대조합니다. 운영 모델이 위 표와 다르면 실제 모델을 기준으로 고지를 수정해야 합니다.

## 배포물 확인

- 저장소에 포함된 글꼴·PDF.js의 라이선스 파일을 배포에서 제외하지 않습니다.
- Node 의존성은 `pnpm-lock.yaml`과 설치 패키지의 라이선스 파일을 대조합니다. 설치 시점의 개발 도구가 제거된 운영 패키지와 구분합니다.
- Docling 이미지는 직접 패키지 외에도 PyTorch, Docling 하위 패키지, 이미지 처리 라이브러리와 Debian 시스템 패키지를 포함할 수 있습니다. 실제 이미지의 패키지 목록과 `/usr/share/doc/*/copyright` 등 배포본 고지를 함께 확인합니다.
- 프로젝트 자체의 공개 범위는 `LICENSE`, `LICENSE-DOCS`, `NOTICE`, `docs/LICENSING.md`를 따릅니다. 이 고지는 제3자 구성요소의 라이선스를 변경하지 않으며 로고·발표자료·등록 사업자료의 권리를 부여하지 않습니다.
