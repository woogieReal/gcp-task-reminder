output "service_url" {
  value = local.service_url
}

output "image_repository" {
  value = "${google_artifact_registry_repository.reminder.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.reminder.repository_id}/${local.service_name}"
}

output "queue_id" {
  value = google_cloud_tasks_queue.reminder.id
}

output "api_sa_email" {
  value = google_service_account.api.email
}

output "tasks_invoker_sa_email" {
  value = google_service_account.tasks_invoker.email
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github_actions.name
}

output "deployer_sa_email" {
  value = google_service_account.deployer.email
}

output "github_setup_reminder" {
  value = <<-EOT
    [TODO] GitHub → ${var.github_repository} → Settings → Environments → Production → Variables
      GCP_WIF_PROVIDER = ${google_iam_workload_identity_pool_provider.github_actions.name}
      GCP_DEPLOYER_SA  = ${google_service_account.deployer.email}
    (이미 등록했다면 값이 같은지만 확인)
  EOT
}
