# Remote state so `terraform plan` always diffs against the real, shared state
# and concurrent applies are locked. Create the bucket + lock table ONCE with
# the one-off config in ./bootstrap, then `terraform init` here.
#
#   cd bootstrap && terraform init && terraform apply
#   cd ..        && terraform init \
#       -backend-config="bucket=zekerflex-tfstate-<accountid>" \
#       -backend-config="dynamodb_table=zekerflex-tflock"
#
# Values are intentionally left blank here and supplied via -backend-config or a
# backend.hcl file, so the same code works for staging and production.

terraform {
  backend "s3" {
    key     = "zekerflex/infra.tfstate"
    region  = "eu-central-1"
    encrypt = true
    # bucket         = "zekerflex-tfstate-<accountid>"   # -backend-config
    # dynamodb_table = "zekerflex-tflock"                # -backend-config
  }
}
