# GitHub Actions가 키 없이 GCP에 인증하기 위한 Workload Identity Federation

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [
    google_project_service.this["iam.googleapis.com"],
    google_project_service.this["sts.googleapis.com"],
  ]
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # 이 저장소의 main 브랜치에서 실행된 워크플로만 토큰 교환을 허용한다.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "reminder-deployer"
  display_name = "Reminder GitHub Actions deployer"

  depends_on = [google_project_service.this["iam.googleapis.com"]]
}

# GitHub 워크플로가 deployer SA로 위장
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# 이미지 push
resource "google_artifact_registry_repository_iam_member" "deployer" {
  location   = google_artifact_registry_repository.reminder.location
  repository = google_artifact_registry_repository.reminder.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

# 새 리비전 배포 (IAM 정책 변경 권한은 없음)
resource "google_cloud_run_v2_service_iam_member" "deployer" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.developer"
  member   = google_service_account.deployer.member
}

# reminder-api SA로 실행되는 리비전을 배포하기 위한 actAs
resource "google_service_account_iam_member" "deployer_act_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
