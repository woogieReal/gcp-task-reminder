# gcp-task-reminder
GCP Cloud Tasks 기반으로 지정된 시간에 텔레그램 알림을 예약 전송하는 서버리스 리마인더

전체 설계와 구현 명세는 [docs/blueprint.md](docs/blueprint.md)를 참고한다.

---

## 다른 컴퓨터에서 이어서 작업하기

이 프로젝트는 작업에 필요한 상태와 비밀값을 특정 컴퓨터에 두지 않는다. 새 컴퓨터에서는 도구 설치와 로그인만 하면 바로 이어서 작업할 수 있다.

| 항목 | 저장 위치 | 새 컴퓨터에서 할 일 |
|---|---|---|
| 소스 코드 | GitHub `woogieReal/gcp-task-reminder` | `git clone` |
| Terraform state | GCS `gs://woogie-sandbox-gcp-tfstate/gcp-task-reminder` | `terraform init` 시 자동 연결 |
| 텔레그램 봇 토큰 | Secret Manager `telegram-bot-token` | 필요할 때 `gcloud`로 조회 |
| 배포 인증 | 없음 (GitHub Actions ↔ GCP Workload Identity Federation) | 없음 |
| GCP 인증 | 각 컴퓨터의 gcloud 로그인 | `gcloud auth login` |

### 1. 필수 도구 설치

| 도구 | 버전 | 용도 |
|---|---|---|
| git | - | 소스 관리 |
| Google Cloud CLI (`gcloud`) | 최신 | GCP 인증, 시크릿 조회, 로그 확인 |
| Terraform | 1.11 이상 | 인프라 변경 (인프라를 건드릴 때만 필요) |
| Docker (Compose v2 포함) | 최신 | 로컬 개발 환경 |

WSL2(Ubuntu) 예시:
```bash
sudo snap install google-cloud-cli --classic
sudo snap install terraform --classic
# Docker는 Windows에 Docker Desktop 설치 후 WSL Integration 활성화
```

macOS 예시 ([Homebrew](https://brew.sh) 필요):
```bash
brew install --cask gcloud-cli
brew install hashicorp/tap/terraform   # homebrew-core의 terraform은 1.5.7에서 멈춰 있으므로 HashiCorp tap 사용
brew install --cask docker             # Docker Desktop 설치 후 앱을 한 번 실행해 데몬 시작
```

> Apple Silicon(M1 이상)에서 만든 이미지는 기본이 `arm64`다. 평소 배포는 GitHub Actions(amd64)가 빌드하므로 상관없지만, 로컬에서 비상 수동 배포할 때는 반드시 `docker build --platform linux/amd64`를 사용한다.

### 2. 저장소 클론

```bash
git clone git@github.com:woogieReal/gcp-task-reminder.git
cd gcp-task-reminder
```

### 3. GCP 인증

브라우저가 없는 환경(WSL 등)에서는 `--no-launch-browser`를 붙인다.

```bash
gcloud auth login
gcloud config set project woogie-sandbox-gcp

# 로컬 앱(Docker 컨테이너)과 Terraform이 사용하는 ADC
gcloud auth application-default login
gcloud auth application-default set-quota-project woogie-sandbox-gcp
```

> `~/.config/gcloud/application_default_credentials.json`에는 refresh token이 들어 있다. 내용을 출력하거나 다른 곳에 복사하지 않는다.

### 4. 로컬 개발 환경 실행

봇 토큰은 Secret Manager에서 받아 `.env`에 채우고, 세션 키는 로컬 전용 값을 새로 만든다 (`.env`는 gitignore 대상).

```bash
cp .env.example .env
sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$(gcloud secrets versions access latest --secret=telegram-bot-token)|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" .env

docker compose up --build
```

브라우저에서 `http://localhost:8080` 접속 → 허용된 Google 계정으로 로그인.

> macOS의 기본 `sed`는 `-i` 뒤에 빈 인자가 필요하다: `sed -i '' "s|...|...|" .env`

### 5. 인프라 변경 (Terraform)

state는 GCS에 있으므로 다른 컴퓨터에서 작업한 결과가 그대로 이어진다. 봇 토큰 변수는 Secret Manager 값으로 채운다.

```bash
export TF_VAR_telegram_bot_token="$(gcloud secrets versions access latest --secret=telegram-bot-token)"

cd terraform
terraform init
terraform plan
terraform apply
```

* 같은 시점에 두 컴퓨터에서 `apply`하지 않는다. GCS backend가 state를 잠그므로 동시에 실행하면 한쪽은 lock 오류로 중단된다. 비정상 종료로 lock이 남으면 `terraform force-unlock <LOCK_ID>`로 해제한다.
* provider 버전은 커밋된 `terraform/.terraform.lock.hcl`로 고정되어 컴퓨터마다 같은 버전이 설치된다.

### 6. 배포

`main` 브랜치에 push하면 GitHub Actions가 이미지를 빌드해 Cloud Run에 배포한다. 어느 컴퓨터에서 push해도 동일하며, 로컬에 배포용 키나 별도 설정이 필요 없다.

```bash
git push origin main
```

배포 결과는 GitHub 저장소의 Actions 탭에서 확인한다.
