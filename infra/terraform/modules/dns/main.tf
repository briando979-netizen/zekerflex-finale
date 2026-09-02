# Route53 hosted zone (created or looked up) + a complete record set:
# app A record, MX + SPF + DKIM + DMARC for mail, and a CAA lock.

resource "aws_route53_zone" "this" {
  count = var.create_hosted_zone ? 1 : 0
  name  = var.domain_name
}

data "aws_route53_zone" "existing" {
  count        = var.create_hosted_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

locals {
  zone_id      = var.create_hosted_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.existing[0].zone_id
  name_servers = var.create_hosted_zone ? aws_route53_zone.this[0].name_servers : data.aws_route53_zone.existing[0].name_servers

  spf_value = join(" ", concat(
    ["v=spf1", "mx", "a", "ip4:${var.instance_public_ip}"],
    [for ip in var.spf_extra_ip4 : "ip4:${ip}"],
    ["~all"],
  ))
}

# --- app -----------------------------------------------------------------
resource "aws_route53_record" "app" {
  zone_id = local.zone_id
  name    = var.app_fqdn
  type    = "A"
  ttl     = 300
  records = [var.instance_public_ip]
}

# When served directly (no Cloudflare proxy) also publish AAAA=none / keep simple.
resource "aws_route53_record" "apex_alias" {
  count   = var.app_fqdn != var.domain_name ? 1 : 0
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [var.instance_public_ip]
}

# --- mail --------------------------------------------------------------
resource "aws_route53_record" "mail_a" {
  zone_id = local.zone_id
  name    = var.mail_fqdn
  type    = "A"
  ttl     = 300
  records = [var.instance_public_ip]
}

resource "aws_route53_record" "mx" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = ["10 ${var.mail_fqdn}"]
}

resource "aws_route53_record" "spf" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 3600
  records = [local.spf_value]
}

resource "aws_route53_record" "dkim" {
  count   = var.dkim_txt_value != "" ? 1 : 0
  zone_id = local.zone_id
  name    = "mail._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = [var.dkim_txt_value]
}

resource "aws_route53_record" "dmarc" {
  zone_id = local.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=quarantine; rua=${var.dmarc_rua}; ruf=${var.dmarc_rua}; fo=1; adkim=s; aspf=s"]
}

# --- CAA: only Let's Encrypt (and Cloudflare, harmless) may issue -------
resource "aws_route53_record" "caa" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "CAA"
  ttl     = 3600
  records = [
    "0 issue \"letsencrypt.org\"",
    "0 issue \"pki.goog\"",
    "0 issuewild \";\"",
    "0 iodef \"${var.dmarc_rua}\"",
  ]
}
