export interface BuildArtifact {
  id: string;
  name: string;
  version: string;
  deploymentId: string;
  branch: string;
  commit: string;
  size: number;
  format: string;
  checksum: string;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface ArtifactVersion {
  version: string;
  versionNumber: number;
  releaseDate: Date;
  artifacts: BuildArtifact[];
  stable: boolean;
}

const artifacts: Map<string, BuildArtifact> = new Map();
const versions: Map<string, ArtifactVersion> = new Map();
let artifactIdCounter = 1;

export function registerArtifact(
  name: string,
  version: string,
  deploymentId: string,
  branch: string,
  commit: string,
  size: number,
  format: string = "application/zip",
  metadata?: Record<string, any>
): BuildArtifact {
  const checksum = generateChecksum(name, version, commit);
  const id = `artifact-${artifactIdCounter++}`;

  const artifact: BuildArtifact = {
    id,
    name,
    version,
    deploymentId,
    branch,
    commit,
    size,
    format,
    checksum,
    createdAt: new Date(),
    metadata,
  };

  artifacts.set(id, artifact);
  updateVersionInfo(version, artifact);

  return artifact;
}

export function getArtifact(id: string): BuildArtifact | null {
  return artifacts.get(id) || null;
}

export function getArtifactsByDeployment(deploymentId: string): BuildArtifact[] {
  return Array.from(artifacts.values()).filter(a => a.deploymentId === deploymentId);
}

export function getArtifactsByVersion(version: string): BuildArtifact[] {
  return Array.from(artifacts.values()).filter(a => a.version === version);
}

export function listVersions(): ArtifactVersion[] {
  return Array.from(versions.values()).sort((a, b) => b.versionNumber - a.versionNumber);
}

export function getVersion(version: string): ArtifactVersion | null {
  return versions.get(version) || null;
}

export function markVersionAsStable(version: string): ArtifactVersion | null {
  const v = versions.get(version);
  if (!v) return null;

  v.stable = true;
  return v;
}

export function deleteArtifact(id: string): boolean {
  const artifact = artifacts.get(id);
  if (!artifact) return false;

  artifacts.delete(id);
  return true;
}

export function cleanupOldArtifacts(olderThan: Date): number {
  let deleted = 0;
  const toDelete: string[] = [];

  for (const [id, artifact] of artifacts) {
    if (artifact.createdAt < olderThan && artifact.expiresAt && artifact.expiresAt < new Date()) {
      toDelete.push(id);
    }
  }

  for (const id of toDelete) {
    artifacts.delete(id);
    deleted++;
  }

  return deleted;
}

export function generateChecksum(name: string, version: string, commit: string): string {
  const data = `${name}:${version}:${commit}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha-${Math.abs(hash).toString(16)}`;
}

export function verifyArtifactIntegrity(artifact: BuildArtifact): boolean {
  const expectedChecksum = generateChecksum(artifact.name, artifact.version, artifact.commit);
  return artifact.checksum === expectedChecksum;
}

function updateVersionInfo(version: string, artifact: BuildArtifact): void {
  let v = versions.get(version);

  if (!v) {
    const parts = version.split(".");
    const versionNumber = parseInt(parts[0] || "0") * 10000 + parseInt(parts[1] || "0") * 100 + parseInt(parts[2] || "0");

    v = {
      version,
      versionNumber,
      releaseDate: new Date(),
      artifacts: [],
      stable: false,
    };
    versions.set(version, v);
  }

  if (!v.artifacts.find(a => a.id === artifact.id)) {
    v.artifacts.push(artifact);
  }
}

export function getTotalArtifactSize(): number {
  return Array.from(artifacts.values()).reduce((sum, a) => sum + a.size, 0);
}

export function getArtifactStats() {
  return {
    totalArtifacts: artifacts.size,
    totalVersions: versions.size,
    totalSize: getTotalArtifactSize(),
    oldestArtifact: Array.from(artifacts.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt,
    newestArtifact: Array.from(artifacts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt,
  };
}
