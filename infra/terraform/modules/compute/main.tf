# ---------------------------------------------------------------------------
# Security group. Default posture: NOTHING inbound (Cloudflare Tunnel dials out).
# SSH only from explicit admin CIDRs; 80/443 only when expose_http = true.
# ---------------------------------------------------------------------------
resource "aws_security_group" "box" {
  name        = "${var.name}-sg"
  description = "ZekerFlex Sovereign Box"
  vpc_id      = var.vpc_id

  egress {
    description = "all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-sg" }
}

resource "aws_security_group_rule" "ssh" {
  count             = length(var.admin_ssh_cidrs) > 0 ? 1 : 0
  type              = "ingress"
  security_group_id = aws_security_group.box.id
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = var.admin_ssh_cidrs
  description       = "break-glass SSH"
}

resource "aws_security_group_rule" "http" {
  count             = var.expose_http ? 1 : 0
  type              = "ingress"
  security_group_id = aws_security_group.box.id
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP (direct, no tunnel)"
}

resource "aws_security_group_rule" "https" {
  count             = var.expose_http ? 1 : 0
  type              = "ingress"
  security_group_id = aws_security_group.box.id
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS (direct, no tunnel)"
}

# ---------------------------------------------------------------------------
# IAM: SSM Session Manager (keyless shell), CloudWatch agent, read the backup
# bucket. No long-lived SSH keys required.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "box" {
  name               = "${var.name}-role"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.box.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cw" {
  role       = aws_iam_role.box.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_s3_bucket" "backup" {
  bucket        = "${var.name}-backup-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket                  = aws_s3_bucket.backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id
  rule {
    id     = "expire-old"
    status = "Enabled"
    filter {} # apply to all objects
    noncurrent_version_expiration { noncurrent_days = 30 }
    expiration { days = 90 }
  }
}

data "aws_iam_policy_document" "backup_rw" {
  statement {
    actions   = ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"]
    resources = [aws_s3_bucket.backup.arn, "${aws_s3_bucket.backup.arn}/*"]
  }
}

resource "aws_iam_role_policy" "backup_rw" {
  name   = "${var.name}-backup-rw"
  role   = aws_iam_role.box.id
  policy = data.aws_iam_policy_document.backup_rw.json
}

resource "aws_iam_instance_profile" "box" {
  name = "${var.name}-profile"
  role = aws_iam_role.box.name
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# The instance.
# ---------------------------------------------------------------------------
resource "aws_instance" "box" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.box.id]
  iam_instance_profile   = aws_iam_instance_profile.box.name
  key_name               = var.ssh_key_name != "" ? var.ssh_key_name : null

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size           = var.root_volume_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = false
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/../../user-data.sh.tftpl", {
    app_image               = var.app_image
    cloudflare_tunnel_token = var.cloudflare_tunnel_token
    domain_fqdn             = var.domain_fqdn
    mail_fqdn               = var.mail_fqdn
    mail_relayhost          = var.mail_relayhost
    environment             = var.environment
    backup_bucket           = aws_s3_bucket.backup.bucket
  })

  tags = { Name = "${var.name}-box" }

  lifecycle {
    ignore_changes = [ami] # don't replace the box just because a newer AMI shipped
  }
}

resource "aws_eip" "box" {
  domain   = "vpc"
  instance = aws_instance.box.id
  tags     = { Name = "${var.name}-eip" }
}
