resource "google_artifact_registry_repository" "reminder" {
  repository_id = "reminder"
  location      = var.region
  format        = "DOCKER"
  description   = "reminder-api 컨테이너 이미지"

  # 배포마다 커밋 SHA 태그 이미지가 쌓이므로 최근 5개만 남긴다 (무료 저장 한도 0.5GB 유지).
  # KEEP과 DELETE에 모두 해당하면 KEEP이 우선하며, 정책은 백그라운드에서 약 하루 안에 적용된다.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-others"
    action = "DELETE"
    condition {
      tag_state = "ANY"
    }
  }

  depends_on = [google_project_service.this["artifactregistry.googleapis.com"]]
}
