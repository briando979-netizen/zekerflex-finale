# Non-sensitive production inputs (safe to commit). Secrets come from CI as
# TF_VAR_* environment variables (e.g. TF_VAR_cloudflare_tunnel_token).

aws_region  = "eu-central-1"
environment = "production"

domain_name        = "zekerflex.com"
app_subdomain      = "app"
manage_dns         = true
create_hosted_zone = false

instance_type  = "t3.large"
root_volume_gb = 120

expose_http     = false
admin_ssh_cidrs = []

app_image = "ghcr.io/zekerflex/zekerflex-app:latest"

mail_relayhost = ""
dmarc_rua      = "mailto:info@zekerflex.com"
