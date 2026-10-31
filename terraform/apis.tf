locals {
  services = [
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com", # data.google_project 조회
    "cloudtasks.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com", # WIF
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com", # WIF
  ]
}

resource "google_project_service" "this" {
  for_each = toset(local.services)

  service            = each.value
  disable_on_destroy = false
}
