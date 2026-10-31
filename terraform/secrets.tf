# 시크릿 값은 write-only 속성(secret_data_wo)으로 넣어 plan/state에 남지 않게 한다.
# *_version 변수가 바뀔 때만 새 값이 기록된다.

resource "google_secret_manager_secret" "telegram_bot_token" {
  secret_id = "telegram-bot-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "telegram_bot_token" {
  secret                 = google_secret_manager_secret.telegram_bot_token.id
  secret_data_wo         = var.telegram_bot_token
  secret_data_wo_version = var.telegram_bot_token_version
}

ephemeral "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "google_secret_manager_secret" "session_secret" {
  secret_id = "session-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.this["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_version" "session_secret" {
  secret                 = google_secret_manager_secret.session_secret.id
  secret_data_wo         = ephemeral.random_password.session_secret.result
  secret_data_wo_version = var.session_secret_version
}
