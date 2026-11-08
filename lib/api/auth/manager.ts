import crypto from "crypto";

interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: Date;
  expiresAt?: Date;
  rateLimit?: number;
  allowedEndpoints?: string[];
  rotatedAt?: Date;
  lastUsed?: Date;
  active: boolean;
}

interface JwtConfig {
  algorithm: "HS256" | "RS256";
  expiresIn: string;
  issuer: string;
  audience: string;
}

interface AuthCredentials {
  type: "api-key" | "oauth2" | "jwt" | "mtls";
  value: string;
  metadata?: Record<string, unknown>;
}

class ApiAuthManager {
  private keys: Map<string, ApiKey> = new Map();
  private jwtConfig: JwtConfig;
  private rotationInterval = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor(jwtConfig: JwtConfig) {
    this.jwtConfig = jwtConfig;
  }

  // API Key management
  generateApiKey(name: string, expiresAt?: Date, rateLimit?: number): ApiKey {
    const id = crypto.randomUUID();
    const key = crypto.randomBytes(32).toString("hex");

    const apiKey: ApiKey = {
      id,
      key,
      name,
      createdAt: new Date(),
      expiresAt,
      rateLimit,
      active: true,
    };

    this.keys.set(id, apiKey);
    return apiKey;
  }

  validateApiKey(key: string): ApiKey | null {
    for (const apiKey of this.keys.values()) {
      if (apiKey.key === key && apiKey.active && (!apiKey.expiresAt || apiKey.expiresAt > new Date())) {
        apiKey.lastUsed = new Date();
        return apiKey;
      }
    }
    return null;
  }

  rotateApiKey(keyId: string): ApiKey | null {
    const oldKey = this.keys.get(keyId);
    if (!oldKey) return null;

    const newKey = this.generateApiKey(oldKey.name, oldKey.expiresAt, oldKey.rateLimit);
    newKey.rotatedAt = new Date();

    // Deactivate old key after grace period (7 days)
    setTimeout(() => {
      oldKey.active = false;
    }, 7 * 24 * 60 * 60 * 1000);

    return newKey;
  }

  revokeApiKey(keyId: string): boolean {
    const apiKey = this.keys.get(keyId);
    if (apiKey) {
      apiKey.active = false;
      return true;
    }
    return false;
  }

  // JWT token generation (basic implementation)
  generateJwtToken(userId: string, scope?: string[]): string {
    const payload = {
      sub: userId,
      iss: this.jwtConfig.issuer,
      aud: this.jwtConfig.audience,
      scope: scope || [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    // In production, use a proper JWT library
    const header = Buffer.from(JSON.stringify({ alg: this.jwtConfig.algorithm, typ: "JWT" })).toString("base64");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = crypto.createHmac("sha256", "secret").update(`${header}.${body}`).digest("base64");

    return `${header}.${body}.${signature}`;
  }

  validateJwtToken(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      const body = Buffer.from(parts[1], "base64").toString();
      const payload = JSON.parse(body);

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Token expired
      }

      return payload;
    } catch {
      return null;
    }
  }

  // OAuth2 placeholder
  validateOAuth2Token(token: string): boolean {
    // In production, validate against OAuth2 provider
    return token.length > 0;
  }

  // mTLS certificate validation placeholder
  validateMTlsCertificate(cert: string): boolean {
    // In production, validate certificate chain
    return cert.length > 0;
  }

  // Check key rotation needed
  checkRotationNeeded(): string[] {
    const keysNeedingRotation: string[] = [];
    const now = Date.now();

    for (const [id, key] of this.keys) {
      if (key.rotatedAt && now - key.rotatedAt.getTime() > this.rotationInterval) {
        keysNeedingRotation.push(id);
      } else if (!key.rotatedAt && now - key.createdAt.getTime() > this.rotationInterval) {
        keysNeedingRotation.push(id);
      }
    }

    return keysNeedingRotation;
  }

  listApiKeys(activeOnly = true): ApiKey[] {
    return Array.from(this.keys.values()).filter((k) => !activeOnly || k.active);
  }
}

export { ApiAuthManager, type ApiKey, type JwtConfig, type AuthCredentials };
