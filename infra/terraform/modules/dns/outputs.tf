output "zone_id" {
  value = local.zone_id
}

output "name_servers" {
  value = local.name_servers
}

output "managed_records" {
  value = compact([
    aws_route53_record.app.fqdn,
    try(aws_route53_record.apex_alias[0].fqdn, ""),
    aws_route53_record.mail_a.fqdn,
    "${aws_route53_record.mx.name} MX",
    "${aws_route53_record.spf.name} TXT(SPF)",
    try("${aws_route53_record.dkim[0].name} TXT(DKIM)", ""),
    "${aws_route53_record.dmarc.name} TXT(DMARC)",
    "${aws_route53_record.caa.name} CAA",
  ])
}
