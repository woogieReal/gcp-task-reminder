resource "google_cloud_run_v2_service" "api" {
  name                = local.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.placeholder_image

      # PORT는 Cloud Run이 자동 주입한다.
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "GCP_QUEUE_NAME"
        value = google_cloud_tasks_queue.reminder.name
      }
      env {
        name  = "SERVICE_URL"
        value = local.service_url
      }
      env {
        name  = "TASKS_INVOKER_SA_EMAIL"
        value = google_service_account.tasks_invoker.email
      }
      env {
        name  = "TELEGRAM_CHAT_ID"
        value = var.telegram_chat_id
      }
      env {
        name  = "GOOGLE_OAUTH_CLIENT_ID"
        value = var.google_oauth_client_id
      }
      env {
        name  = "ALLOWED_EMAIL"
        value = var.allowed_email
      }
      env {
        name = "TELEGRAM_BOT_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.telegram_bot_token.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_secret.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    # 이미지는 GitHub Actions(gcloud run deploy)가 관리한다.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]

    # 계산한 SERVICE_URL이 틀리면 OIDC audience와 OAuth 원본이 어긋나므로 apply를 실패시킨다.
    postcondition {
      condition     = contains(self.urls, local.service_url)
      error_message = "계산한 SERVICE_URL(${local.service_url})이 Cloud Run 서비스 URL 목록에 없습니다."
    }
  }

  # 리비전 기동 시 시크릿을 읽을 수 있어야 한다.
  depends_on = [
    google_project_service.this["run.googleapis.com"],
    google_secret_manager_secret_version.telegram_bot_token,
    google_secret_manager_secret_version.session_secret,
    google_secret_manager_secret_iam_member.api,
  ]
}

# 브라우저 접근을 위해 공개한다. 인증은 앱(Google 로그인, OIDC 검증)이 담당한다.
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
