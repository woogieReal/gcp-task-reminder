resource "google_cloud_tasks_queue" "reminder" {
  name     = "reminder-queue"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 10
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts = 5
    min_backoff  = "10s"
    max_backoff  = "300s"
  }

  depends_on = [google_project_service.this["cloudtasks.googleapis.com"]]
}
