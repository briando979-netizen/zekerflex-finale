export interface Secret {
  key: string;
  value: string;
  environment: "development" | "staging" | "production";
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
}

export interface SecretAuditLog {
  id: string;
  action: "created" | "updated" | "deleted" | "accessed";
  key: string;
  environment: string;
  timestamp: Date;
  actor: string;
  ipAddress?: string;
}

const secrets: Map<string, Secret> = new Map();
const auditLogs: SecretAuditLog[] = [];

export function addSecret(
  key: string,
  value: string,
  environment: "development" | "staging" | "production"
): Secret {
  const secret: Secret = {
    key,
    value,
    environment,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  secrets.set(`${environment}:${key}`, secret);
  logAudit("created", key, environment, "system");

  return secret;
}

export function updateSecret(
  key: string,
  value: string,
  environment: string
): Secret | null {
  const secretKey = `${environment}:${key}`;
  const secret = secrets.get(secretKey);

  if (!secret) return null;

  secret.value = value;
  secret.updatedAt = new Date();
  logAudit("updated", key, environment, "system");

  return secret;
}

export function getSecret(
  key: string,
  environment: string
): Secret | null {
  const secretKey = `${environment}:${key}`;
  const secret = secrets.get(secretKey);

  if (secret) {
    secret.lastUsed = new Date();
    logAudit("accessed", key, environment, "system");
  }

  return secret || null;
}

export function deleteSecret(key: string, environment: string): boolean {
  const secretKey = `${environment}:${key}`;
  const deleted = secrets.delete(secretKey);

  if (deleted) {
    logAudit("deleted", key, environment, "system");
  }

  return deleted;
}

export function listSecrets(environment: string): Secret[] {
  return Array.from(secrets.values()).filter(s => s.environment === environment);
}

export function validateSecret(secret: Secret): string[] {
  const issues: string[] = [];

  if (secret.key.length < 3) {
    issues.push("Key must be at least 3 characters long");
  }

  if (secret.value.length < 1) {
    issues.push("Value cannot be empty");
  }

  if (!secret.key.match(/^[A-Z_][A-Z0-9_]*$/)) {
    issues.push("Key must be uppercase with underscores only");
  }

  return issues;
}

export function logAudit(
  action: SecretAuditLog["action"],
  key: string,
  environment: string,
  actor: string,
  ipAddress?: string
): void {
  auditLogs.push({
    id: `audit-${Date.now()}`,
    action,
    key,
    environment,
    timestamp: new Date(),
    actor,
    ipAddress,
  });

  if (auditLogs.length > 1000) {
    auditLogs.shift();
  }
}

export function getAuditLogs(
  environment?: string,
  limit: number = 50
): SecretAuditLog[] {
  let logs = [...auditLogs];

  if (environment) {
    logs = logs.filter(l => l.environment === environment);
  }

  return logs.slice(-limit);
}

export function maskSecretValue(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return value.substring(0, 2) + "*".repeat(value.length - 4) + value.substring(value.length - 2);
}
