import { randomBytes } from "crypto";

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export class OAuthFlow {
  private config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  generateAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
    });
    return `${this.config.authorizationUrl}?${params}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthToken> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) throw new Error("Token exchange failed");
    return response.json();
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) throw new Error("Token refresh failed");
    return response.json();
  }

  generateState(): string {
    return randomBytes(32).toString("hex");
  }
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function validateToken(token: string, validationUrl: string): Promise<boolean> {
  try {
    const response = await fetch(validationUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
