aws_region  = "eu-central-1"
environment = "staging"

domain_name        = "zekerflex.com"
app_subdomain      = "staging"
manage_dns         = true
create_hosted_zone = false

instance_type  = "t3.medium"
root_volume_gb = 80

expose_http     = false
admin_ssh_cidrs = []

app_image = "ghcr.io/zekerflex/zekerflex-app:main"

dmarc_rua = "mailto:info@zekerflex.com"
