# ZekerFlex — Infrastructure

Everything needed to run ZekerFlex in production, three ways:

| Path | When |
|---|---|
| **VPS + Cloudflare Tunnel** (`../deploy/`, `../docker-compose.prod.yml`) | One box, sovereign, no cloud lock-in. Default. |
| **Terraform → AWS EC2** (`terraform/`) | Same single-box design, but the box + DNS + backups are declarative. |
| **Kubernetes** (`helm/`, `k8s/`) | Horizontal scale, rolling deploys, managed Postgres/Redis. |

All three run the **same image**: `ghcr.io/<owner>/zekerflex-app`, built by `.github/workflows/docker-publish.yml` (multi-arch, SBOM, provenance, Trivy).

Nothing here migrates or seeds the database automatically — that stays an explicit
`npx prisma migrate deploy` step.

---

## 1 · Terraform (AWS)

```
terraform/
  bootstrap/        # one-off: S3 state bucket + DynamoDB lock table
  env/              # non-secret tfvars per environment
  modules/
    network/        # VPC, public subnets, IGW, routes, S3 gateway endpoint
    compute/        # EC2 + EIP + IMDSv2 + IAM (SSM, CloudWatch) + backup bucket + user-data
    dns/            # Route53 zone + A / MX / SPF / DKIM / DMARC / CAA
  user-data.sh.tftpl  # installs Docker, runs docker-compose.prod.yml as a systemd unit
```

### First run

```bash
cd infra/terraform/bootstrap
terraform init && terraform apply          # creates the state backend

cd ..
terraform init \
  -backend-config="bucket=$(terraform -chdir=bootstrap output -raw state_bucket)" \
  -backend-config="dynamodb_table=$(terraform -chdir=bootstrap output -raw lock_table)"

cp terraform.tfvars.example terraform.tfvars   # edit
export TF_VAR_cloudflare_tunnel_token='...'     # secret, not in tfvars

terraform plan  -var-file=env/production.tfvars   # ← diffs against remote state
terraform apply -var-file=env/production.tfvars
```

`terraform plan` **is** the "compare with current remote state" step: the S3
backend holds the authoritative state, DynamoDB locks it, and every plan shows
the drift between code and the live AWS account.

### After apply

```bash
terraform output nameservers      # set these at your registrar (or Cloudflare)
terraform output app_url
terraform output ssm_session_command   # keyless shell onto the box
```

The box boots, installs Docker, writes `/opt/zekerflex/.env.production`, pulls the
image and starts `zekerflex.service`. Fill the remaining secrets via SSM Parameter
Store under `/zekerflex/production/` (referenced in the user-data script), then
`systemctl restart zekerflex`.

### DNS records Terraform manages

| Record | Purpose |
|---|---|
| `app.zekerflex.com A` | the box's Elastic IP |
| `zekerflex.com A` | apex → same IP |
| `mail.zekerflex.com A` | Postfix relay host |
| `zekerflex.com MX` | `10 mail.zekerflex.com` |
| `zekerflex.com TXT` | SPF — `v=spf1 mx a ip4:<eip> ~all` (+ `spf_extra_ip4`) |
| `mail._domainkey TXT` | DKIM (paste the key from OpenDKIM, then re-apply) |
| `_dmarc TXT` | `p=quarantine`, strict alignment, reports to `dmarc_rua` |
| `zekerflex.com CAA` | only Let's Encrypt / Google may issue certs |

> Prefer Cloudflare-managed DNS? Set `manage_dns = false` and create the same
> records in the Cloudflare dashboard; keep the tunnel token in `TF_VAR_...`.

---

## 2 · Kubernetes

### Helm (recommended)

```bash
kubectl create namespace zekerflex
kubectl -n zekerflex create secret generic zekerflex-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=AUTH_SECRET="$(openssl rand -base64 48)" \
  --from-literal=INTERNAL_CRON_TOKEN="$(openssl rand -hex 32)" \
  --from-literal=WEBPUSH_VAPID_PUBLIC_KEY='...' \
  --from-literal=WEBPUSH_VAPID_PRIVATE_KEY='...'

helm upgrade --install zekerflex ./infra/helm/zekerflex \
  -n zekerflex \
  -f infra/helm/zekerflex/values-production.yaml \
  --set image.tag=sha-abc1234 \
  --set existingSecret=zekerflex-secrets \
  --wait --atomic
```

Needs in-cluster (or managed): PostgreSQL, Redis, and — for the assistant —
Ollama + Whisper. Point `config.DATABASE_URL` / `REDIS_URL` / `LLM_BASE_URL` at
them. `/api/ready` gates traffic on Postgres + Redis being reachable.

### Kustomize (no Helm)

```bash
kubectl apply -k infra/k8s/overlays/production
```

`base/` is a single-replica deployment on a `ReadWriteOnce` PVC (the filesystem
stores under `/app/storage`). The `production` overlay swaps in a
`ReadWriteMany` volume (`efs-sc`) and scales to 3–12 pods.

### Pod hardening (both paths)

- non-root (uid 1001), `readOnlyRootFilesystem`, all caps dropped, `RuntimeDefault` seccomp
- `automountServiceAccountToken: false`
- liveness `/api/health`, readiness `/api/ready`, startup probe for slow cold starts
- `NetworkPolicy`: default-deny ingress, only the ingress-nginx namespace may reach `:3000`
- HPA on CPU/memory, PDB `minAvailable`, anti-affinity across nodes

---

## 3 · Docker

- `../Dockerfile` — multi-stage, standalone, non-root, `HEALTHCHECK` on `/api/health`
- `docker/docker-bake.hcl` — multi-arch buildx bake with GHA cache, SBOM, provenance
- `docker/docker-compose.observability.yml` — optional Prometheus + Grafana + Loki + cAdvisor + node-exporter sidecars
- `../docker-compose.prod.yml` — the full VPS stack (`--profile mail` adds the Postfix relay)

---

## 4 · CI/CD (`.github/workflows/`)

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push | tsc · lint · vitest · `prisma migrate deploy` · `next build` · `helm lint`/`template` · `kubectl kustomize` |
| `docker-publish.yml` | push `main`, tags | buildx multi-arch → GHCR, SBOM + provenance attestation, Trivy → code scanning |
| `terraform.yml` | PR/push on `infra/terraform/**` | fmt · validate · tflint · checkov · **plan** (PR comment) · gated **apply** (production environment approval) |
| `deploy.yml` | after a successful image publish | `helm upgrade --install --atomic` to EKS, then `/api/ready` smoke test. `workflow_dispatch` can target the VPS via SSM instead. |
| `codeql.yml` | PR, push, weekly | CodeQL security-and-quality, `npm audit`, gitleaks |

### Required repo secrets

```
AWS_TERRAFORM_ROLE_ARN     # OIDC role for terraform plan/apply
AWS_DEPLOY_ROLE_ARN        # OIDC role for helm/SSM deploy
TF_STATE_BUCKET  TF_LOCK_TABLE
EKS_CLUSTER
CLOUDFLARE_TUNNEL_TOKEN
```

All AWS access is via GitHub OIDC — no static AWS keys in the repo.
