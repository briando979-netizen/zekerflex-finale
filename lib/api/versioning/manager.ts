interface ApiVersion {
  version: string;
  releaseDate: Date;
  deprecated?: boolean;
  sunsetDate?: Date;
  changes: Change[];
  backwardCompatible: boolean;
}

interface Change {
  type: "added" | "modified" | "removed" | "deprecated";
  endpoint?: string;
  field?: string;
  description: string;
  migration?: string;
}

interface VersionNegotiation {
  acceptVersion: string;
  preferredVersion: string;
  deprecated: boolean;
}

class ApiVersionManager {
  private versions: Map<string, ApiVersion> = new Map();
  private defaultVersion = "1.0.0";

  registerVersion(version: ApiVersion): void {
    this.versions.set(version.version, version);
  }

  getVersion(versionString: string): ApiVersion | undefined {
    return this.versions.get(versionString);
  }

  negotiateVersion(acceptHeader: string | null): VersionNegotiation {
    if (!acceptHeader) {
      return { acceptVersion: this.defaultVersion, preferredVersion: this.defaultVersion, deprecated: false };
    }

    const versions = acceptHeader.split(",").map((v) => v.trim());
    for (const versionSpec of versions) {
      const version = this.versions.get(versionSpec);
      if (version) {
        return {
          acceptVersion: versionSpec,
          preferredVersion: versionSpec,
          deprecated: version.deprecated || false,
        };
      }
    }

    return { acceptVersion: this.defaultVersion, preferredVersion: this.defaultVersion, deprecated: false };
  }

  getVersionChangelog(version: string): string {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) return "Version not found";

    let changelog = `# API Version ${version}\n\n`;
    changelog += `Released: ${apiVersion.releaseDate.toISOString()}\n`;
    if (apiVersion.deprecated) {
      changelog += `**DEPRECATED** - Sunset date: ${apiVersion.sunsetDate?.toISOString()}\n`;
    }
    changelog += "\n## Changes\n\n";

    for (const change of apiVersion.changes) {
      changelog += `- **${change.type.toUpperCase()}**: ${change.description}\n`;
      if (change.endpoint) changelog += `  Endpoint: ${change.endpoint}\n`;
      if (change.migration) changelog += `  Migration: ${change.migration}\n`;
    }

    return changelog;
  }

  getMigrationPath(fromVersion: string, toVersion: string): Change[] {
    const fromApiVersion = this.versions.get(fromVersion);
    const toApiVersion = this.versions.get(toVersion);

    if (!fromApiVersion || !toApiVersion) return [];

    const migrations: Change[] = [];
    for (const change of toApiVersion.changes) {
      if (change.type === "removed" || change.type === "modified") {
        migrations.push(change);
      }
    }

    return migrations;
  }

  listVersions(): ApiVersion[] {
    return Array.from(this.versions.values()).sort((a, b) => {
      return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
    });
  }

  getActiveVersions(): ApiVersion[] {
    return this.listVersions().filter((v) => !v.deprecated);
  }

  checkSunsetDates(): { version: string; sunsetDate: Date }[] {
    const sunsets: { version: string; sunsetDate: Date }[] = [];
    for (const version of this.versions.values()) {
      if (version.deprecated && version.sunsetDate && new Date() > version.sunsetDate) {
        sunsets.push({ version: version.version, sunsetDate: version.sunsetDate });
      }
    }
    return sunsets;
  }
}

export { ApiVersionManager, type ApiVersion, type Change, type VersionNegotiation };
