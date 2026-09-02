output "instance_id" {
  value = aws_instance.box.id
}

output "public_ip" {
  value = aws_eip.box.public_ip
}

output "security_group_id" {
  value = aws_security_group.box.id
}

output "backup_bucket" {
  value = aws_s3_bucket.backup.bucket
}
