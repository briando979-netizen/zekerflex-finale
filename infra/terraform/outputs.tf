output "instance_id" {
  description = "EC2 instance id of the Sovereign Box."
  value       = module.compute.instance_id
}

output "public_ip" {
  description = "Elastic IP attached to the box."
  value       = module.compute.public_ip
}

output "app_url" {
  description = "Public URL once DNS + tunnel are live."
  value       = "https://${local.fqdn}"
}

output "ssm_session_command" {
  description = "Open a keyless shell on the box."
  value       = "aws ssm start-session --target ${module.compute.instance_id} --region ${var.aws_region}"
}

output "nameservers" {
  description = "Set these at your registrar when Terraform manages the hosted zone."
  value       = var.manage_dns ? module.dns[0].name_servers : []
}

output "dns_records" {
  description = "Records Terraform manages for the domain."
  value       = var.manage_dns ? module.dns[0].managed_records : []
}
