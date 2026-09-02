// Multi-arch build for the ZekerFlex app image.
//   docker buildx bake -f infra/docker/docker-bake.hcl
//   docker buildx bake -f infra/docker/docker-bake.hcl --push app
//
// TAGS / REGISTRY are overridable from CI:
//   TAGS="ghcr.io/zekerflex/zekerflex-app:sha-abc123" docker buildx bake ... --push

variable "REGISTRY" {
  default = "ghcr.io/zekerflex"
}

variable "TAGS" {
  default = "${REGISTRY}/zekerflex-app:dev"
}

variable "PLATFORMS" {
  default = "linux/amd64,linux/arm64"
}

group "default" {
  targets = ["app"]
}

target "app" {
  context    = "../.."
  dockerfile = "Dockerfile"
  tags       = split(",", TAGS)
  platforms  = split(",", PLATFORMS)
  args = {
    NEXT_TELEMETRY_DISABLED = "1"
  }
  cache-from = ["type=gha"]
  cache-to   = ["type=gha,mode=max"]
  provenance = true
  sbom       = true
}

// Fast local build: current arch only, load into the local daemon.
target "app-local" {
  inherits  = ["app"]
  platforms = ["linux/amd64"]
  tags      = ["zekerflex-app:local"]
  output    = ["type=docker"]
  cache-from = []
  cache-to   = []
  provenance = false
  sbom       = false
}
