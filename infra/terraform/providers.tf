provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "zekerflex"
      Environment = var.environment
      ManagedBy   = "terraform"
      Repo        = "zekerflex-platform"
    }
  }
}
