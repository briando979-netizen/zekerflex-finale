variable "aws_region" {
  description = "AWS region for all regional resources."
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Deployment environment name (staging | production)."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "domain_name" {
  description = "Apex domain served by ZekerFlex (e.g. zekerflex.com)."
  type        = string
  default     = "zekerflex.com"
}

variable "app_subdomain" {
  description = "Subdomain the app is reachable on. Empty string = apex."
  type        = string
  default     = "app"
}

variable "manage_dns" {
  description = "Whether Terraform manages the Route53 hosted zone + records."
  type        = bool
  default     = true
}

variable "create_hosted_zone" {
  description = "Create the hosted zone (true) or look one up that already exists (false)."
  type        = bool
  default     = false
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_count" {
  description = "Number of public subnets (one per AZ)."
  type        = number
  default     = 2
}

variable "instance_type" {
  description = "EC2 instance type for the Sovereign Box."
  type        = string
  default     = "t3.large"
}

variable "root_volume_gb" {
  description = "Root EBS volume size in GiB (Ollama models + Docker images are large)."
  type        = number
  default     = 120
}

variable "ssh_key_name" {
  description = "Name of an existing EC2 key pair for break-glass SSH. Empty = SSM only."
  type        = string
  default     = ""
}

variable "admin_ssh_cidrs" {
  description = "CIDRs allowed to reach port 22. Empty list = no inbound SSH (SSM only)."
  type        = list(string)
  default     = []
}

variable "expose_http" {
  description = <<-EOT
    Open 80/443 to the internet. Leave false when using Cloudflare Tunnel
    (cloudflared dials out, nothing inbound). Set true only for a direct ALB.
  EOT
  type        = bool
  default     = false
}

variable "cloudflare_tunnel_token" {
  description = "Cloudflare Tunnel token, injected into the instance for cloudflared. Sensitive."
  type        = string
  default     = ""
  sensitive   = true
}

variable "app_image" {
  description = "Container image the box should run (from GHCR)."
  type        = string
  default     = "ghcr.io/zekerflex/zekerflex-app:latest"
}

variable "mail_relayhost" {
  description = "Optional SMTP smarthost for the bundled Postfix relay (host:port)."
  type        = string
  default     = ""
}

variable "spf_extra_ip4" {
  description = "Extra IPv4 addresses allowed to send mail for the domain (SPF)."
  type        = list(string)
  default     = []
}

variable "dkim_txt_value" {
  description = "DKIM public key TXT value (from Postfix/OpenDKIM). Empty = no DKIM record."
  type        = string
  default     = ""
}

variable "dmarc_rua" {
  description = "Address for DMARC aggregate reports."
  type        = string
  default     = "mailto:info@zekerflex.com"
}
