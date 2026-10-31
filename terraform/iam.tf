# Cloud Run 런타임 신원
resource "google_service_account" "api" {
  account_id   = "reminder-api"
  display_name = "Reminder API (Cloud Run runtime)"

  depends_on = [google_project_service.this["iam.googleapis.com"]]
}

# Cloud Tasks가 /trigger를 호출할 때 OIDC 토큰을 발급하는 신원
resource "google_service_account" "tasks_invoker" {
  account_id   = "reminder-tasks-invoker"
  display_name = "Reminder Cloud Tasks invoker"

  depends_on = [google_project_service.this["iam.googleapis.com"]]
}

# 예약 생성·조회·취소
resource "google_cloud_tasks_queue_iam_member" "api" {
  for_each = toset([
    "roles/cloudtasks.enqueuer",
    "roles/cloudtasks.viewer",
    "roles/cloudtasks.taskDeleter",
  ])

  location = google_cloud_tasks_queue.reminder.location
  name     = google_cloud_tasks_queue.reminder.name
  role     = each.value
  member   = google_service_account.api.member
}

# 태스크에 invoker SA의 OIDC 토큰을 붙이기 위한 actAs
resource "google_service_account_iam_member" "api_act_as_tasks_invoker" {
  service_account_id = google_service_account.tasks_invoker.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each = {
    telegram_bot_token = google_secret_manager_secret.telegram_bot_token.id
    session_secret     = google_secret_manager_secret.session_secret.id
  }

  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api.member
}
