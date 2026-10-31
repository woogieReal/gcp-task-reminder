resource "google_artifact_registry_repository" "reminder" {
  repository_id = "reminder"
  location      = var.region
  format        = "DOCKER"
  description   = "reminder-api 컨테이너 이미지"

  depends_on = [google_project_service.this["artifactregistry.googleapis.com"]]
}
