terraform {
  backend "s3" {
    key = "dev/terraform.tfstate"
    # The rest comes from bootstrap's `backend_config` output; pass it with
    #   terraform init -backend-config=backend.hcl
    # so the bucket name (which contains the account id) stays out of git.
  }
}
