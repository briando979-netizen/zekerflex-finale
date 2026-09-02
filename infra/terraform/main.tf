locals {
  name      = "zekerflex-${var.environment}"
  fqdn      = var.app_subdomain == "" ? var.domain_name : "${var.app_subdomain}.${var.domain_name}"
  mail_fqdn = "mail.${var.domain_name}"
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Latest Ubuntu 22.04 LTS (amd64) — Canonical.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

module "network" {
  source = "./modules/network"

  name                = local.name
  vpc_cidr            = var.vpc_cidr
  azs                 = slice(data.aws_availability_zones.available.names, 0, var.public_subnet_count)
  public_subnet_count = var.public_subnet_count
}

module "compute" {
  source = "./modules/compute"

  name                    = local.name
  environment             = var.environment
  vpc_id                  = module.network.vpc_id
  subnet_id               = module.network.public_subnet_ids[0]
  ami_id                  = data.aws_ami.ubuntu.id
  instance_type           = var.instance_type
  root_volume_gb          = var.root_volume_gb
  ssh_key_name            = var.ssh_key_name
  admin_ssh_cidrs         = var.admin_ssh_cidrs
  expose_http             = var.expose_http
  app_image               = var.app_image
  cloudflare_tunnel_token = var.cloudflare_tunnel_token
  domain_fqdn             = local.fqdn
  mail_fqdn               = local.mail_fqdn
  mail_relayhost          = var.mail_relayhost
}

module "dns" {
  source = "./modules/dns"
  count  = var.manage_dns ? 1 : 0

  domain_name        = var.domain_name
  create_hosted_zone = var.create_hosted_zone
  app_fqdn           = local.fqdn
  mail_fqdn          = local.mail_fqdn
  instance_public_ip = module.compute.public_ip
  expose_http        = var.expose_http
  spf_extra_ip4      = var.spf_extra_ip4
  dkim_txt_value     = var.dkim_txt_value
  dmarc_rua          = var.dmarc_rua
}
