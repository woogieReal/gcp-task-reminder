variable "project_id" {
  description = "GCP 프로젝트 ID"
  type        = string
  default     = "woogie-sandbox-gcp"
}

variable "region" {
  description = "GCP 리전"
  type        = string
  default     = "asia-northeast3"
}

variable "telegram_chat_id" {
  description = "알림을 받을 텔레그램 Chat ID"
  type        = string
  default     = "8509618162"
}

variable "telegram_bot_token" {
  description = "텔레그램 봇 토큰. TF_VAR_telegram_bot_token 환경 변수로만 주입한다."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "telegram_bot_token_version" {
  description = "봇 토큰 교체 시 1씩 올린다. 값이 바뀔 때만 시크릿 버전이 새로 기록된다."
  type        = string
  default     = "1"
}

variable "session_secret_version" {
  description = "세션 서명 키 교체 시 1씩 올린다. 기존 세션은 모두 무효화된다."
  type        = string
  default     = "1"
}

variable "google_oauth_client_id" {
  description = "Google 로그인용 OAuth Client ID (브라우저에 노출되는 공개 값)"
  type        = string
  default     = "371125433847-4kg70jj2tbj5p640mpn0qfee884c0mbm.apps.googleusercontent.com"
}

variable "allowed_email" {
  description = "웹 페이지 로그인을 허용할 유일한 Google 계정"
  type        = string
  default     = "woogiereal@gmail.com"
}

variable "placeholder_image" {
  description = "Cloud Run 최초 생성용 이미지. 이후 이미지는 GitHub Actions가 배포한다."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "github_repository" {
  description = "Workload Identity Federation으로 배포를 허용할 GitHub 저장소 (owner/repo)"
  type        = string
  default     = "woogieReal/gcp-task-reminder"
}
