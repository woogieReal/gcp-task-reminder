terraform {
  required_version = ">= 1.11"

  required_providers {
    # 8.0.0부터 secret_data_wo_version이 문자열 타입
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
    # ephemeral random_password는 3.7.0부터 지원
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # 여러 컴퓨터에서 같은 state를 쓰기 위한 원격 backend (버킷은 Terraform 밖에서 수동 생성)
  backend "gcs" {
    bucket = "woogie-sandbox-gcp-tfstate"
    prefix = "gcp-task-reminder"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "this" {
  project_id = var.project_id
}

locals {
  service_name = "reminder-api"

  # Cloud Run 결정적 URL. 서비스 자기 참조 순환을 피하려고 프로젝트 번호로 계산한다.
  service_url = "https://${local.service_name}-${data.google_project.this.number}.${var.region}.run.app"
}
