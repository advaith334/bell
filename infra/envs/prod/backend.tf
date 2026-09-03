terraform {
  backend "s3" {
    key = "prod/terraform.tfstate"
    # terraform init -backend-config=backend.hcl
  }
}
