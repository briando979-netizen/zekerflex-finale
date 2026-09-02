variable "name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "root_volume_gb" { type = number }
variable "ssh_key_name" { type = string }
variable "admin_ssh_cidrs" { type = list(string) }
variable "expose_http" { type = bool }
variable "app_image" { type = string }

variable "cloudflare_tunnel_token" {
  type      = string
  sensitive = true
}

variable "domain_fqdn" { type = string }
variable "mail_fqdn" { type = string }
variable "mail_relayhost" { type = string }
