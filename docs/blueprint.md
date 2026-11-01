# gcp-task-reminder AI 에이전트 개발 가이드 & 시스템 설계서

본 문서는 AI 코딩 에이전트(Claude Code, Cursor, Copilot 등)가 단일 컨텍스트로 프로젝트를 파악하고 기능 구현, 인프라 배포, 동작 검증을 완결할 수 있도록 정의한 설계서다. 구현 코드는 포함하지 않으며, 무엇을 어떤 규칙으로 만들어야 하는지를 정의한다.

---

## 1. 프로젝트 개요

* **목적:** GCP Cloud Tasks의 지연 실행(Deferred Task Execution) 메커니즘을 학습하기 위한 개인용 미니 프로젝트.
* **핵심 기능:**
  1. 사용자는 웹 페이지에서 Google 계정으로 로그인한다. 허용된 단 하나의 계정만 사용할 수 있다.
  2. 메시지와 알림 시각을 입력해 알림을 예약한다. 시각은 빠른 선택 버튼(10분 후, 1시간 후 등) 또는 날짜·시간 직접 지정으로 정한다.
  3. 서버는 Cloud Tasks 큐(`reminder-queue`)에 해당 시각에 실행될 태스크를 등록한다.
  4. 예약 시각이 되면 Cloud Tasks가 OIDC 토큰을 첨부해 `/trigger`를 호출하고, 서버는 텔레그램 Bot API로 스마트폰에 푸시 알림을 발송한다.
  5. 웹 페이지에서 대기 중인 예약 목록을 보고, 원하는 예약을 취소할 수 있다.

* **고정 인프라 정보:**
  * GCP Project ID: `woogie-sandbox-gcp`
  * GCP Project Number: `371125433847`
  * GCP Region: `asia-northeast3` (Seoul)
  * Cloud Run 서비스명: `reminder-api`
  * Cloud Run URL(결정적 URL): `https://reminder-api-371125433847.asia-northeast3.run.app`
  * 허용 사용자: `woogiereal@gmail.com`
  * Telegram Chat ID: `8509618162`
  * 비밀값(텔레그램 봇 토큰, 세션 서명 키): Secret Manager에 저장. 코드·문서·Git에 절대 기록하지 않는다.

---

## 2. 시스템 아키텍처 및 데이터 흐름

```text
[브라우저 (PC / 스마트폰)]
       │
       │ 1. Google 로그인 (Google Identity Services)
       │    → ID 토큰을 서버로 전달 → 서버 검증 → 세션 쿠키 발급
       │ 2. 알림 예약 / 목록 조회 / 취소  (세션 쿠키)
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Cloud Run: reminder-api  (공개 서비스, 인증은 앱이 담당)     │
│   웹 페이지 + /api/*  → 세션 쿠키 검증                       │
│   /trigger            → Cloud Tasks OIDC 토큰 검증           │
│   런타임 SA: reminder-api@                                   │
└──────────────────────────────────────────────────────────────┘
       │                                   ▲
       │ 3. Task 생성 / 조회 / 삭제         │ 4. 예약 시각 도래 → POST /trigger
       │    target: <SERVICE_URL>/trigger   │    Bearer OIDC 토큰
       │    oidcToken: reminder-tasks-invoker@
       ▼                                   │
┌──────────────────────────────────────────────────────────────┐
│ Cloud Tasks Queue: reminder-queue                            │
└──────────────────────────────────────────────────────────────┘

       Cloud Run /trigger
       │ 5. POST https://api.telegram.org/bot<TOKEN>/sendMessage
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Telegram Servers ──> 사용자 스마트폰 푸시 알림 수신          │
└──────────────────────────────────────────────────────────────┘
```

### 인증 모델

브라우저는 Cloud Run IAM용 ID 토큰을 붙일 수 없으므로 Cloud Run 서비스는 공개(`allUsers` invoker)로 두고, 모든 보호를 앱이 담당한다.

| 경로 | 호출 주체 | 인증 방식 | 실패 시 |
|---|---|---|---|
| `GET /` (웹 페이지 정적 파일) | 누구나 | 없음 (화면만 내려주며 데이터는 포함하지 않음) | - |
| `POST /auth/google` | 브라우저 | Google ID 토큰 검증 + 허용 이메일 확인 → 세션 쿠키 발급 | `401` / `403` |
| `POST /auth/logout` | 브라우저 | 세션 쿠키 삭제 | - |
| `/api/*` | 브라우저 | 세션 쿠키 검증 | `401` |
| `POST /trigger` | Cloud Tasks | OIDC 토큰 검증 (audience = `SERVICE_URL`, 발급 SA = `reminder-tasks-invoker`) | `401` |
| `GET /healthz` | 누구나 | 없음 | - |

**Google 로그인 규칙**
* 프런트엔드는 Google Identity Services(GIS)의 로그인 버튼으로 ID 토큰을 받아 `POST /auth/google`로 전달한다. OAuth client secret이 필요 없는 ID 토큰 방식이다.
* 서버는 `google-auth-library`로 ID 토큰을 검증한다: 서명, 만료, audience(= OAuth Client ID), `email_verified = true`, `email = ALLOWED_EMAIL`.
* 검증에 성공하면 서버가 직접 서명한 세션 쿠키를 발급한다. Google ID 토큰 자체를 쿠키에 저장하지 않는다.
* OAuth 동의 화면은 **External + Testing 상태**로 두고, 테스트 사용자에 허용 계정만 등록한다. Google 단계에서 한 번, 앱의 이메일 확인에서 한 번 더 막는 이중 잠금이 된다.

**세션 규칙**
* 서버 저장소 없이 동작하는 서명 쿠키(stateless)를 사용해 Cloud Run 인스턴스가 여러 개여도 동작하게 한다. 서명 키는 Secret Manager의 `session-secret`.
* 쿠키 속성: `HttpOnly`, `Secure`, `SameSite=Lax`, 유효기간 7일.
* CSRF 방어: 상태를 바꾸는 요청(`POST`, `DELETE`)은 `Content-Type: application/json`이어야 하고, `Origin` 헤더가 `SERVICE_URL`(로컬은 `http://localhost:8080`)과 일치해야 한다.

**`/trigger` 규칙**
* Cloud Run이 공개 상태이므로 `Authorization: Bearer` OIDC 토큰을 앱에서 직접 검증한다.
* 로컬 개발에서 `curl`로 `/trigger`를 직접 호출할 수 있도록 `SKIP_TRIGGER_AUTH=true`를 지원하되, `NODE_ENV=development`일 때만 적용한다. 배포 이미지는 `NODE_ENV=production`으로 고정되어 이 옵션이 무시된다.

---

## 3. 기술 스택 및 제약 조건

* **Language & Runtime:** TypeScript, Node.js 22 LTS
* **Framework:** Express (API + 정적 파일 서빙)
* **Frontend:** 프레임워크 없는 정적 HTML/CSS/JS 한 페이지, 모바일 우선 레이아웃
* **인증:** Google Identity Services(프런트), `google-auth-library`(ID 토큰·OIDC 토큰 검증)
* **GCP SDK:** `@google-cloud/tasks`
* **HTTP Client:** `axios`
* **Compute:** Cloud Run (v2 API)
* **Local Dev:** Docker Compose (Docker Desktop + WSL2 / macOS), `tsx watch` 핫 리로드
* **CI/CD:** GitHub Actions (`main` push → 이미지 빌드·푸시 → Cloud Run 배포), Workload Identity Federation으로 키 없이 GCP 인증
* **Container Registry:** Artifact Registry
* **Secret:** Secret Manager
* **IaC:** Terraform >= 1.11, Google Provider `~> 8.0`, Random Provider `~> 3.7` (write-only 속성 `secret_data_wo`, ephemeral `random_password` 사용), state는 GCS backend
* **제약 사항:**
  * 환경 구분(Dev/Prod) 없이 단일 환경 구성.
  * 서비스 계정 키 파일(`*.json`)을 생성·사용하지 않는다. 로컬은 gcloud ADC, Cloud Run은 연결된 서비스 계정, GitHub Actions는 Workload Identity Federation을 사용한다.
  * 인프라(API 활성화, 큐, Cloud Run 서비스, SA, IAM, 시크릿, 레지스트리, WIF)는 Terraform으로만 정의한다. 예외: Terraform으로 만들 수 없는 OAuth 동의 화면과 OAuth Client는 콘솔에서 수동 생성한다.
  * 애플리케이션 배포는 GitHub Actions가 수행한다. Terraform은 최초 생성 시 placeholder 이미지를 쓰고, 이후 이미지 변경은 무시한다.
  * Terraform은 로컬에서 수동 실행한다 (CI에서 실행하지 않음).

---

## 4. 디렉터리 구조

```text
gcp-task-reminder/
├── terraform/
│   ├── versions.tf             # terraform / provider 버전, GCS backend, provider 설정
│   ├── .terraform.lock.hcl     # provider 버전 잠금 (커밋 대상)
│   ├── variables.tf
│   ├── apis.tf                 # 필요 API 활성화
│   ├── tasks.tf                # Cloud Tasks 큐
│   ├── run.tf                  # Cloud Run 서비스 및 공개 invoker 바인딩
│   ├── iam.tf                  # 런타임 서비스 계정 및 IAM 바인딩
│   ├── secrets.tf              # Secret Manager 시크릿/버전
│   ├── registry.tf             # Artifact Registry 저장소
│   ├── github.tf               # Workload Identity Pool/Provider, 배포용 SA
│   └── outputs.tf
├── .github/
│   └── workflows/
│       └── deploy.yml          # main push 시 Cloud Run 자동 배포
├── src/
│   ├── index.ts                # 설정 로드, 서버 기동(listen), 종료 처리
│   ├── app.ts                  # Express 앱 생성 함수 (라우터·정적 파일 연결, 테스트에서 직접 호출)
│   ├── config.ts               # 환경 변수 로드·검증
│   ├── auth/
│   │   ├── google.ts           # Google ID 토큰 검증, 허용 이메일 확인
│   │   ├── session.ts          # 세션 쿠키 발급·검증, 인증 미들웨어
│   │   └── oidc.ts             # /trigger용 Cloud Tasks OIDC 토큰 검증
│   ├── routes/
│   │   ├── auth.routes.ts      # /auth/*
│   │   ├── reminder.routes.ts  # /api/reminders
│   │   └── trigger.routes.ts   # /trigger
│   └── services/
│       ├── task.service.ts     # Cloud Tasks 생성·조회·삭제
│       └── telegram.service.ts # 텔레그램 메시지 발송
├── public/
│   ├── index.html              # 로그인 화면 + 예약 화면
│   ├── app.js
│   └── style.css
├── Dockerfile                  # 멀티 스테이지 빌드 (dev / build / runtime)
├── .dockerignore
├── compose.yaml                # 로컬 개발 환경
├── .env.example                # 로컬 개발용 환경 변수 템플릿
├── .gitignore
├── package.json
├── tsconfig.json               # 타입 검사용 (테스트 포함)
├── tsconfig.build.json         # 빌드용 (테스트 제외)
└── README.md
```

---

## 5. 단계별 구현 명세 (AI 에이전트 작업 지침)

### 작업(Task) 구성과 Phase 매핑

구현은 PDCA 방식(`/new-task` → 구현 → `/check-task` → `/act-task` → `/work-log`)으로 진행하며, 아래 task 순서를 따른다. Phase는 **무엇을 만드는지**(명세 단위), task는 **어떤 순서로 만들고 검증하는지**(작업 단위)를 나타내므로 순서가 다르다.

| 순서 | Task (`docs/{n}_{name}/`) | 포함하는 명세 | 핵심 완료 기준 | 구현 시 확인 항목 |
|---|---|---|---|---|
| 1 | `gcp-infra-terraform` | Phase 0, Phase 1 | `terraform fmt -check`·`validate` 통과, apply 후 `plan` 변경 없음, `SERVICE_URL` postcondition 통과, output 값 확인 | `secret_data_wo`(google provider)와 ephemeral `random_password`(random provider)를 지원하는 최소 버전 확인 후 `versions.tf`에 반영 |
| 2 | `project-init` | 프로젝트 골격(`package.json`, `tsconfig.json`, 테스트 도구), `config.ts`, `/healthz`, Phase 4, Phase 5 | `typecheck`·`test` 통과, `docker compose up` 후 `/healthz` `200` | - |
| 3 | `reminder-api` | Phase 2 중 예약 생성·조회·취소, `/trigger`, 텔레그램 발송 | 단위·HTTP 테스트 통과, 로컬에서 실제 큐에 생성·조회·삭제 성공, `/trigger` 호출로 텔레그램 수신 | `cloudtasks.tasks.fullView` 권한이 런타임 SA 역할에 포함되는지 확인. 없으면 필요한 역할을 Terraform(`iam.tf`)에 추가 |
| 4 | `auth` | Phase 2 중 Google 로그인, 세션, `/trigger` OIDC 검증, CSRF, 보안 헤더 | 인증 관련 테스트 통과, 로컬 Google 로그인 성공, 미인증 요청 `401` | - |
| 5 | `web-ui` | Phase 3 | 로컬 브라우저 시나리오 체크리스트 통과 | - |
| 6 | `cicd-pipeline` | Phase 6, GitHub 저장소 설정 | `main` push 후 Actions 성공, 새 리비전 배포 확인 | - |
| 7 | `deploy-verification` | 7장 5~7단계 | 운영 환경 E2E 성공 (보호 확인, 알림 수신, 취소) | - |

**task 진행 규칙**
* **순서 제약:** Terraform이 Cloud Run을 `allUsers`로 공개하므로, task 4(`auth`)가 끝나기 전에는 앱 이미지를 Cloud Run에 배포하지 않는다. 그래서 task 6(`cicd-pipeline`)은 반드시 task 4 이후에 진행한다. task 3의 인증 없는 `/api`는 로컬에서만 실행한다.
* **커밋:** task가 끝날 때(`/work-log` 이후)마다 커밋해서, 다음 task의 `git diff`에 이전 변경이 섞이지 않게 한다.
* **실행 주체:** `terraform apply`, `git commit`, `git push`는 사용자가 직접 실행한다. 에이전트는 코드를 작성하고 `fmt`·`validate`·`plan`, 빌드·테스트 같은 읽기 전용 검증까지만 수행한 뒤, 실행할 명령이나 커밋 메시지를 사용자에게 전달한다.
* **수동 작업의 완료 기준:** 콘솔 작업(OAuth, GitHub 설정)은 결과물로 간접 확인한다. 예: Client ID가 `variables.tf`에 반영됨, Actions 실행 성공.

### Phase 0: 수동 사전 작업 (GCP 콘솔)

Terraform으로 만들 수 없는 항목이다. Terraform apply 전에 끝내야 한다.

1. **Terraform state 버킷:** `gs://woogie-sandbox-gcp-tfstate` (리전 `asia-northeast3`, 균일 버킷 수준 액세스, 공개 액세스 차단, 버전 관리 활성화). 프로젝트당 1회, `gcloud storage buckets create`로 생성.
2. **OAuth 동의 화면** (Google Auth Platform → 브랜딩/대상):
   * 사용자 유형: External, 게시 상태: Testing
   * 테스트 사용자: `woogiereal@gmail.com`만 등록
   * 범위: `openid`, `email`, `profile` (민감하지 않은 범위라 Google 검수 불필요)
3. **OAuth Client** (Google Auth Platform → 클라이언트):
   * 유형: 웹 애플리케이션
   * 승인된 JavaScript 원본: `https://reminder-api-371125433847.asia-northeast3.run.app`, `http://localhost:8080`
   * 리디렉션 URI: 없음 (GIS ID 토큰 방식은 사용하지 않음)
   * 발급된 **Client ID**만 사용한다. Client ID는 브라우저에 노출되는 공개 값이라 `variables.tf` 기본값으로 커밋해도 된다. Client Secret은 사용하지 않는다.

### Phase 1: Terraform 인프라 정의 (`terraform/`)

모든 리소스는 `var.project_id`, `var.region`을 참조하며 값을 하드코딩하지 않는다.

**`versions.tf`**
* `required_version >= 1.11`, `hashicorp/google ~> 8.0`, `hashicorp/random ~> 3.7`(세션 키 생성용)
  * 근거: `secret_data_wo`는 google 6.23.0에서 추가됐지만 8.0.0에서 `secret_data_wo_version`이 정수에서 **문자열** 타입으로 바뀌었다. 최신 메이저(8.x)에 맞춰 문자열로 사용한다. ephemeral `random_password`는 random 3.7.0에서 추가됐다.
* backend: GCS, 버킷 `woogie-sandbox-gcp-tfstate`, prefix `gcp-task-reminder`. 버킷 자체는 Terraform이 관리하지 않는다.
* `.terraform.lock.hcl`은 커밋해서 컴퓨터마다 같은 provider 버전을 쓰게 한다.

**`variables.tf`**

| 변수 | 기본값 | 비고 |
|---|---|---|
| `project_id` | `woogie-sandbox-gcp` | |
| `region` | `asia-northeast3` | |
| `telegram_chat_id` | `8509618162` | |
| `telegram_bot_token` | 없음 | sensitive + ephemeral. `TF_VAR_telegram_bot_token` 환경 변수로만 주입 |
| `telegram_bot_token_version` | `"1"` (string) | 토큰 교체 시 +1 |
| `session_secret_version` | `"1"` (string) | 세션 키 교체 시 +1 (모든 세션이 로그아웃됨) |
| `google_oauth_client_id` | Phase 0에서 발급한 값 | 공개 값 |
| `allowed_email` | `woogiereal@gmail.com` | |
| `placeholder_image` | `us-docker.pkg.dev/cloudrun/container/hello` | 최초 서비스 생성용 |
| `github_repository` | `woogieReal/gcp-task-reminder` | WIF 접근을 허용할 저장소 |

**`apis.tf`** — 활성화할 API: `run`, `cloudtasks`, `artifactregistry`, `secretmanager`, `iam`, `iamcredentials`, `sts`, `cloudresourcemanager`(프로젝트 번호를 조회하는 `data.google_project`용). 삭제 시 비활성화하지 않는다. 다른 리소스는 관련 API에 의존성을 건다.

**`registry.tf`** — Docker 형식 Artifact Registry 저장소 `reminder` (`var.region`). 이미지 경로: `asia-northeast3-docker.pkg.dev/woogie-sandbox-gcp/reminder/reminder-api`

**`secrets.tf`** — 두 시크릿 모두 write-only 속성으로 값을 넣어 tfstate에 저장되지 않게 한다.

| 시크릿 | 값의 출처 | 교체 방법 |
|---|---|---|
| `telegram-bot-token` | `var.telegram_bot_token` | `telegram_bot_token_version` +1 |
| `session-secret` | ephemeral `random_password` (64자) | `session_secret_version` +1 |

**`tasks.tf`** — 큐 `reminder-queue`
* rate limits: 초당 최대 디스패치 10, 최대 동시 디스패치 10
* retry: 최대 5회, backoff 10초 ~ 300초

**`iam.tf`** — 런타임 서비스 계정 2개

| SA | 용도 | 부여 권한 |
|---|---|---|
| `reminder-api` | Cloud Run 런타임 | 큐: 태스크 생성(`cloudtasks.enqueuer`), 조회(`cloudtasks.viewer`), 삭제(`cloudtasks.taskDeleter`)<br>`reminder-tasks-invoker` SA에 `iam.serviceAccountUser` (태스크에 OIDC 토큰을 붙이기 위한 actAs)<br>두 시크릿에 `secretmanager.secretAccessor` |
| `reminder-tasks-invoker` | Cloud Tasks가 `/trigger`를 호출할 때의 신원 | 없음 (OIDC 토큰의 발급 주체로만 쓰이며, 앱이 토큰의 이메일로 확인) |

> 예약 목록에 메시지 본문을 표시하려면 태스크를 FULL 뷰로 조회해야 한다. 이에 필요한 권한(`cloudtasks.tasks.fullView`)이 위 역할들에 포함되는지는 task 3에서 확인한다.

**`run.tf`** — Cloud Run 서비스 `reminder-api`
* 모든 트래픽 허용, 삭제 보호 해제, 런타임 SA `reminder-api`, 인스턴스 0~2개
* 초기 이미지는 `var.placeholder_image`. 이후 이미지 변경(그리고 gcloud가 남기는 client 정보)은 Terraform이 무시한다.
* `allUsers`에 `run.invoker`를 부여해 공개한다.
* 환경 변수 (`PORT`는 Cloud Run이 자동 주입하므로 설정하지 않음):

| 변수 | 값 |
|---|---|
| `NODE_ENV` | `production` |
| `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME` | 프로젝트, 리전, 큐 이름 |
| `SERVICE_URL` | 결정적 URL. 프로젝트 번호로 계산한 값을 `locals`에 한 번만 정의해 공유 (서비스 자기 참조 순환 방지) |
| `TASKS_INVOKER_SA_EMAIL` | invoker SA 이메일 |
| `TELEGRAM_CHAT_ID` | `var.telegram_chat_id` |
| `TELEGRAM_BOT_TOKEN` | 시크릿 `telegram-bot-token` (latest) |
| `GOOGLE_OAUTH_CLIENT_ID` | `var.google_oauth_client_id` |
| `ALLOWED_EMAIL` | `var.allowed_email` |
| `SESSION_SECRET` | 시크릿 `session-secret` (latest) |

* 계산한 `SERVICE_URL`이 실제 서비스 URL 목록에 없으면 apply를 실패시키는 postcondition을 둔다. 잘못된 URL은 OIDC audience 불일치와 OAuth 원본 불일치로 이어지기 때문이다.
* 리비전이 시크릿을 읽을 수 있도록 시크릿 버전과 접근 IAM이 먼저 만들어져야 한다.

**`github.tf`** — GitHub Actions 키리스 인증
* Workload Identity Pool `github`, Provider `github-actions` (issuer: GitHub Actions OIDC)
* 속성 매핑: subject, repository, ref
* 조건: `var.github_repository` 저장소의 `refs/heads/main`에서 실행된 워크플로만 허용
* 배포용 SA `reminder-deployer`:

| 대상 | 역할 | 이유 |
|---|---|---|
| `reminder-deployer` SA 자신 | `iam.workloadIdentityUser` → 해당 저장소의 principalSet | GitHub 워크플로가 이 SA로 위장 |
| Artifact Registry `reminder` | `artifactregistry.writer` | 이미지 push |
| Cloud Run `reminder-api` | `run.developer` | 새 리비전 배포 (IAM 정책 변경 불가) |
| `reminder-api` 런타임 SA | `iam.serviceAccountUser` | 해당 SA로 실행되는 리비전 배포 |

**`outputs.tf`**: `service_url`, `image_repository`, `queue_id`, `api_sa_email`, `tasks_invoker_sa_email`, `workload_identity_provider`, `deployer_sa_email`, `github_setup_reminder`
* `github_setup_reminder`: apply 직후 "GitHub `Production` Environment Variables에 `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`를 등록하라"는 안내와 실제 값을 출력한다.

### Phase 2: 백엔드 API 구현 (`src/`)

**환경 변수 (`config.ts`)**
* 필수: `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME`, `SERVICE_URL`, `TASKS_INVOKER_SA_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `ALLOWED_EMAIL`, `SESSION_SECRET`
* 선택: `PORT`(기본 8080), `NODE_ENV`(기본 `production`), `SKIP_TRIGGER_AUTH`(development에서만 유효)
* 필수 값이 하나라도 없으면 기동 시 즉시 종료한다.
* 앱 코드는 `.env`를 직접 읽지 않는다. 로컬은 Docker Compose가, Cloud Run은 서비스 설정이 주입한다.

**공통 규칙**
* 응답은 JSON, 에러 형식은 `{ "error": "<메시지>" }`로 통일한다.
* 시각은 API에서 항상 ISO 8601(UTC 오프셋 포함)로 주고받고, 화면 표시는 브라우저 로컬 시간대(Asia/Seoul)로 변환한다.
* 로그에 봇 토큰, 세션 키, ID 토큰, 쿠키 값이 출력되지 않게 한다. 외부 API 에러는 상태 코드와 메시지만 기록한다.
* 기본 보안 헤더를 적용한다 (Google 로그인 스크립트 도메인을 허용하는 CSP 포함).

**API 명세**

| 메서드·경로 | 인증 | 요청 | 성공 응답 | 비고 |
|---|---|---|---|---|
| `GET /api/me` | 세션 | - | `200` `{ email }` | 화면이 로그인 상태를 판단하는 데 사용. 세션 없으면 `401` |
| `GET /api/config` | 없음 | - | `200` `{ googleClientId }` | 프런트가 로그인 버튼 초기화에 사용 |
| `POST /auth/google` | 없음 | `{ credential }` (GIS ID 토큰) | `204` + 세션 쿠키 | 허용 계정이 아니면 `403` |
| `POST /auth/logout` | 없음 | - | `204` + 쿠키 삭제 | |
| `POST /api/reminders` | 세션 | `{ text, scheduleAt }` | `201` `{ id, text, scheduleAt }` | 아래 검증 규칙 참고 |
| `GET /api/reminders` | 세션 | - | `200` `[{ id, text, scheduleAt, attempts, lastError? }]` | 예약 시각 오름차순 |
| `DELETE /api/reminders/:id` | 세션 | - | `204` | 이미 실행됐거나 없는 태스크는 `404` |
| `POST /trigger` | OIDC | `{ text }` | `200` | 아래 응답 규칙 참고 |
| `GET /healthz` | 없음 | - | `200` | |

**예약 생성 (`POST /api/reminders`)**
* API는 절대 시각(`scheduleAt`)만 받는다. "10분 후" 같은 상대 시간은 프런트엔드가 절대 시각으로 변환해서 보낸다.
* 검증 (실패 시 `400`):
  * `text`: 공백이 아닌 문자열, 최대 4000자 (텔레그램 한도 4096자에서 접두어 여유분 제외)
  * `scheduleAt`: 유효한 ISO 8601 시각, 현재 시각 이후, 현재로부터 30일 이내 (Cloud Tasks 최대 예약 기간)
* 태스크 구성: 대상 `${SERVICE_URL}/trigger`, 메서드 POST, 본문 `{ text }`(JSON), 예약 시각 `scheduleAt`, OIDC 토큰(발급 SA = invoker SA, audience = `SERVICE_URL`)
* 태스크 이름은 Cloud Tasks가 자동 생성하게 두고, 응답의 `id`는 전체 이름의 마지막 부분(태스크 ID)을 사용한다.

**예약 목록 (`GET /api/reminders`)**
* 큐의 태스크를 FULL 뷰로 조회해 본문에서 `text`를 복원한다.
* Cloud Tasks는 성공한 태스크를 큐에서 삭제하므로, 목록에는 대기 중이거나 재시도 중인 예약만 나온다.
* 재시도 중인 태스크는 시도 횟수와 마지막 실패 상태를 함께 내려 화면에서 구분할 수 있게 한다.

**예약 취소 (`DELETE /api/reminders/:id`)**
* `id`는 태스크 ID 형식(영문·숫자·`-`·`_`)인지 검증한 뒤 큐 경로와 조합해 삭제한다. 임의의 전체 경로를 받지 않는다.

**알림 발송 (`POST /trigger`)**
* `X-CloudTasks-TaskName`, `X-CloudTasks-TaskRetryCount` 헤더를 로그에 남긴다.
* 텔레그램 `sendMessage`로 `chat_id = TELEGRAM_CHAT_ID`, `text = "[리마인더] <text>"`를 발송한다.
* 응답 규칙 (Cloud Tasks는 2xx만 성공으로 간주):
  * 발송 성공 → `200`
  * 본문이 잘못되어 재시도해도 소용없는 경우 → `200` + 에러 로그 (무의미한 재시도 방지)
  * 텔레그램 API 실패·타임아웃 → `500` (Cloud Tasks가 재시도)

**`package.json` scripts**: `build`(tsc), `start`(빌드 결과 실행), `dev`(tsx watch, compose의 dev 컨테이너에서 실행), `typecheck`, `test` (6장 참고)

### Phase 3: 웹 페이지 구현 (`public/`)

한 페이지 안에서 로그인 상태에 따라 화면을 전환한다. 스마트폰에서 주로 쓰므로 모바일 우선으로 만든다.

**로그인 화면 (세션 없음)**
* 서비스 이름과 "Google로 로그인" 버튼만 표시한다.
* 허용되지 않은 계정으로 로그인하면 "이 계정은 사용할 수 없습니다" 안내를 표시한다.

**예약 화면 (세션 있음)**
1. **상단:** 로그인한 이메일, 로그아웃 버튼
2. **알림 등록 폼**
   * 메시지 입력 (여러 줄, 글자 수 표시)
   * 빠른 선택 버튼: `10분 후`, `30분 후`, `1시간 후`, `3시간 후`, `내일 오전 9시`
   * 직접 지정: 날짜·시간 입력 (`datetime-local`, 분 단위)
   * 빠른 선택 버튼을 누르면 직접 지정 칸이 해당 시각으로 채워져, 사용자는 항상 최종 예약 시각을 눈으로 확인하고 미세 조정할 수 있다.
   * 과거 시각이나 30일 초과는 등록 버튼을 비활성화하고 이유를 표시한다.
   * 등록 성공 시 폼을 비우고 목록을 갱신한다.
3. **예약 목록**
   * 예약 시각 오름차순. 각 항목에 메시지, 예약 시각(`10/12 (일) 14:30` 형식), 남은 시간(`2시간 15분 후`)을 표시한다.
   * 재시도 중인 항목은 시도 횟수와 함께 구분 표시한다.
   * 항목마다 `취소` 버튼 → 확인 후 삭제 → 목록 갱신.
   * 예약이 없으면 빈 상태 안내를 표시한다.
   * 페이지가 다시 보일 때(탭 전환 등)와 새로고침 버튼으로 목록을 갱신한다.

**공통**
* API가 `401`을 반환하면 로그인 화면으로 전환한다 (세션 만료 대응).
* 요청 중에는 버튼을 비활성화해 중복 등록을 막는다.

### Phase 4: 컨테이너 정의

**`Dockerfile`** — 베이스 `node:22-slim`, 멀티 스테이지

| 스테이지 | 용도 | 내용 |
|---|---|---|
| `deps` | 공통 의존성 | 의존성 설치 |
| `dev` | 로컬 개발 (compose) | `npm run dev`. 소스와 `public/`은 볼륨 마운트로 주입 |
| `build` | TS 컴파일 | 소스 복사 후 빌드 |
| `runtime` | Cloud Run 배포 (기본 타깃) | 운영 의존성만 설치, 빌드 결과와 `public/` 복사, `NODE_ENV=production`, 비root 사용자로 실행 |

**`.dockerignore`**: `node_modules`, `dist`, `terraform`, `.env*`, `.git`, `docs`

**`compose.yaml`**
* 서비스 하나(`api`), `dev` 스테이지로 빌드, 포트 8080 노출, `.env`에서 환경 변수 주입
* `src/`, `public/`을 마운트해 핫 리로드
* 호스트의 gcloud ADC 파일을 읽기 전용으로 마운트하고 `GOOGLE_APPLICATION_CREDENTIALS`로 지정해, 컨테이너 안에서 키 파일 없이 Cloud Tasks에 접근한다.
* `node_modules`는 이미지 안의 것을 사용한다.

### Phase 5: 로컬 개발 환경

**`.env.example`** (복사해서 `.env` 생성, `.env`는 gitignore 대상)

| 변수 | 로컬 값 |
|---|---|
| `PORT` | `8080` |
| `NODE_ENV` | `development` |
| `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME` | Cloud Run과 동일 |
| `SERVICE_URL` | Cloud Run URL (태스크의 호출 대상이므로 로컬 주소가 아님) |
| `TASKS_INVOKER_SA_EMAIL` | `reminder-tasks-invoker@woogie-sandbox-gcp.iam.gserviceaccount.com` |
| `TELEGRAM_BOT_TOKEN` | 자리표시자. 실제 값은 Secret Manager에서 조회해 채움 |
| `TELEGRAM_CHAT_ID` | `8509618162` |
| `GOOGLE_OAUTH_CLIENT_ID` | Phase 0에서 발급한 값 |
| `ALLOWED_EMAIL` | `woogiereal@gmail.com` |
| `SESSION_SECRET` | 로컬 전용 임의 문자열 (Cloud Run 값과 달라도 됨) |
| `SKIP_TRIGGER_AUTH` | `true` |

**로컬 동작 범위**
* `http://localhost:8080`에서 Google 로그인과 화면 전체를 확인할 수 있다 (OAuth 원본에 localhost 등록됨). 브라우저는 localhost를 보안 컨텍스트로 취급하므로 `Secure` 쿠키도 동작한다.
* 로컬에서 예약을 등록하면 실제 큐에 태스크가 생기고, 예약 시각에는 Cloud Run의 `/trigger`가 호출된다. 로컬 사용자(Owner)에게 invoker SA에 대한 actAs 권한이 필요하다.
* 텔레그램 발송만 빠르게 확인하려면 `SKIP_TRIGGER_AUTH=true` 상태에서 로컬 `/trigger`를 직접 호출한다.

### Phase 6: GitHub Actions 배포 파이프라인

**GitHub 저장소 설정** (`woogieReal/gcp-task-reminder`)
* Environment `Production` 생성, 배포 브랜치는 `main`만 허용
* Environment **Variables**(Secrets 아님):
  * `GCP_WIF_PROVIDER` = Terraform output `workload_identity_provider`
  * `GCP_DEPLOYER_SA` = Terraform output `deployer_sa_email`
* WIF를 쓰므로 GitHub에 저장할 비밀값이 없다.

**`.github/workflows/deploy.yml`**
* 트리거: `main` push(앱 관련 경로가 바뀐 경우만: `src/`, `public/`, `package*.json`, `tsconfig.json`, `Dockerfile`, `.dockerignore`, 워크플로 파일 자체), 수동 실행(`workflow_dispatch`)
* 동시 실행 방지: 배포는 한 번에 하나만, 진행 중인 배포는 취소하지 않음
* 권한: `contents: read`, `id-token: write`(WIF용 OIDC 토큰 발급)
* 단계: 체크아웃 → Node 22 설정·의존성 설치 → `typecheck`·`test` 실행(실패 시 배포 중단) → `google-github-actions/auth`(WIF) → `setup-gcloud` → Artifact Registry용 Docker 인증 → 이미지 빌드·푸시(태그 = 커밋 SHA) → `gcloud run deploy`로 이미지만 교체
* 공개 범위·환경 변수는 Terraform이 소유하므로 워크플로에서 지정하지 않는다.

**참고: `gcp-serverless-memobox`와의 차이**

| 항목 | memobox | 이 프로젝트 |
|---|---|---|
| GCP 인증 | SA JSON 키 → `GCP_SA_KEY` Secret | Workload Identity Federation (키 없음) |
| 배포 대상 | Cloud Functions (소스 배포) | Cloud Run (컨테이너 이미지) |
| 접근 제어 | 공개 + 앱 IP 화이트리스트 | 공개 + 앱의 Google 로그인 / OIDC 검증 |
| 환경 변수 | 워크플로에서 지정 | Terraform이 서비스에 정의 |

---

## 6. 테스트 전략

`/check-task`가 실행해 판정할 수 있는 자동 검증을 기본으로 하고, 자동화하기 어려운 외부 연동은 task별 수동 시나리오로 보완한다.

### 도구와 명령

| 구분 | 도구 | `package.json` script / 명령 |
|---|---|---|
| 타입 검사 | TypeScript | `typecheck` (`tsc --noEmit`) |
| 단위·HTTP 테스트 | vitest + supertest | `test` |
| Terraform | Terraform CLI | `terraform fmt -check`, `terraform validate`, `terraform plan` |

### 테스트 원칙
* 자동 테스트는 **실제 외부 API를 호출하지 않는다.** Cloud Tasks 클라이언트, 텔레그램 발송, Google 토큰 검증은 mock으로 대체한다. 실제 연동은 수동 시나리오에서 확인한다.
* 라우터는 Express 앱을 만드는 함수와 서버 기동(`listen`)을 분리해, supertest로 앱을 직접 호출할 수 있게 한다.
* 서비스(Cloud Tasks, 텔레그램, 토큰 검증)는 주입 가능한 형태로 만들어 테스트에서 교체할 수 있게 한다.
* 테스트 파일은 대상 옆에 `*.test.ts`로 둔다. 빌드(`tsconfig.build.json`)에서는 제외된다.

### task별 자동 테스트 범위

| Task | 테스트 대상 | 주요 케이스 |
|---|---|---|
| 2 `project-init` | `config.ts`, `/healthz` | 필수 환경 변수 누락 시 기동 실패, `/healthz` `200` |
| 3 `reminder-api` | 예약 생성·조회·취소, `/trigger` | `text` 공백·4000자 초과 → `400`, `scheduleAt` 과거·30일 초과·형식 오류 → `400`, 태스크 ID 형식 위반 → `400`, 없는 태스크 취소 → `404`, 생성 시 태스크 구성(대상 URL, 예약 시각, OIDC 설정) 확인, 텔레그램 성공 → `200`, 텔레그램 실패 → `500`, 본문 오류 → `200` |
| 4 `auth` | 로그인, 세션, OIDC, CSRF | 허용 이메일 → 세션 발급, 다른 이메일·`email_verified=false` → `403`, 세션 없음·위조·만료 → `401`, `Origin` 불일치 → `403`, OIDC 토큰 없음·audience 불일치·다른 SA → `401`, `SKIP_TRIGGER_AUTH`는 `NODE_ENV=production`에서 무시 |
| 5 `web-ui` | (자동 테스트 없음) | 수동 시나리오로 검증 |

### 수동 검증 시나리오
* **task 1:** apply 후 `gcloud`로 큐, Cloud Run, 시크릿, SA 존재 확인. `terraform output`으로 값 확인. `terraform plan` 실행에도 `TF_VAR_telegram_bot_token`이 필요하다.
* **task 3:** 로컬 compose에서 실제 큐에 예약 생성 → `gcloud tasks list`로 확인 → 삭제. `SKIP_TRIGGER_AUTH=true`로 로컬 `/trigger` 호출 → 텔레그램 수신.
* **task 4:** `http://localhost:8080`에서 허용 계정 로그인 성공, 로그아웃 후 `/api/me` `401`.
* **task 5:** PC와 스마트폰 폭에서 빠른 선택(각 버튼이 올바른 시각으로 채워지는지), 직접 지정, 과거·30일 초과 차단, 등록, 목록(남은 시간 표시), 취소, 세션 만료 시 로그인 화면 전환.
* **task 6·7:** 7장 시나리오.

---

## 7. 배포 및 검증 시나리오

**사전 조건:** gcloud 로그인 및 ADC 설정 완료, Terraform 1.11 이상, Docker 실행 중, GitHub 원격 저장소 연결. 실행 명령은 `README.md` 참고.

1. **수동 사전 작업** — Phase 0 (state 버킷, OAuth 동의 화면, OAuth Client). 발급된 Client ID를 `variables.tf` 기본값에 반영.
2. **인프라 배포** — 봇 토큰을 Secret Manager 또는 직접 입력으로 `TF_VAR_telegram_bot_token`에 넣고 `terraform init` → `plan` → `apply`. 이 시점의 Cloud Run은 placeholder 이미지로 동작한다.
3. **GitHub 설정** ⚠️ apply 후 반드시 수행 — apply 출력의 `github_setup_reminder` 값을 `Production` Environment Variables에 등록. 하지 않으면 첫 배포가 인증 단계에서 실패한다.
4. **앱 배포** — `main`에 push → GitHub Actions 성공 확인.
5. **보호 확인**
   * 세션 없이 `/api/reminders` 호출 → `401`
   * 토큰 없이 `/trigger` 호출 → `401`
   * 허용되지 않은 Google 계정으로 로그인 → Google 단계(테스트 사용자 아님)에서 차단되거나 앱에서 `403`
6. **기능 확인** (스마트폰 브라우저 권장)
   * 허용 계정으로 로그인 → 예약 화면 표시
   * `10분 후` 대신 테스트용으로 직접 지정에 1~2분 뒤 시각을 넣어 등록 → 목록에 표시
   * 예약 시각에 텔레그램 `[리마인더] ...` 수신 → 목록에서 사라짐
   * 하나 더 등록 후 `취소` → 목록에서 사라지고, 예약 시각이 지나도 알림이 오지 않음
7. **로그·큐 확인** — `gcloud run services logs read`, `gcloud tasks list`로 서버 로그와 큐 상태를 확인.

---

## 8. 운영 주의사항

* **중복 발송 가능성:** Cloud Tasks는 at-least-once 전달이므로 드물게 같은 알림이 두 번 올 수 있다. 학습 목적상 허용한다.
* **큐 이름 재사용 제한:** 큐를 삭제하면 같은 이름을 약 7일간 다시 만들 수 없다. `terraform destroy` 후 바로 재생성하지 않는다.
* **WIF 풀 삭제 주의:** Workload Identity Pool/Provider는 삭제 후 30일간 같은 ID로 재생성할 수 없다 (복구는 가능).
* **봇 토큰 교체:** BotFather에서 재발급 → `TF_VAR_telegram_bot_token` 갱신 + `telegram_bot_token_version` +1 → apply → 새 리비전 생성(Actions 수동 실행 등)으로 반영.
* **세션 키 교체:** `session_secret_version` +1 → apply → 새 리비전 생성. 기존 세션은 모두 무효화된다.
* **OAuth Testing 상태:** 테스트 사용자만 로그인할 수 있다. 의도한 잠금이므로 프로덕션으로 게시하지 않는다.
* **다른 컴퓨터에서 작업:** `README.md`의 "다른 컴퓨터에서 이어서 작업하기"를 따른다.
* **비상 수동 배포:** GitHub Actions를 쓸 수 없을 때는 로컬에서 `linux/amd64`로 이미지를 빌드해 Artifact Registry에 push한 뒤 `gcloud run deploy`로 이미지만 교체한다.
* **비용:** Cloud Run(요청 기반, 최소 인스턴스 0), Cloud Tasks(월 100만 작업 무료), Artifact Registry(0.5GB 무료) 범위에서 사실상 무료다. 오래된 이미지는 주기적으로 정리한다.
