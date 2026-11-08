/**
 * SSO & OAuth Integration
 *
 * Handles OAuth2, SAML, and OpenID Connect integrations for single sign-on.
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assignRole } from "./rbac";

export type SSOProvider = "google" | "microsoft" | "okta" | "keycloak" | "custom";

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface OAuthUserInfo {
  sub: string; // Subject (unique ID)
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  groups?: string[];
}

/**
 * Create SSO configuration for a tenant
 */
export async function createSSOConfig(
  tenantId: string,
  provider: SSOProvider,
  config: {
    clientId: string;
    encryptedClientSecret: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userInfoUrl?: string;
    discoveryUrl?: string;
    samlMetadataUrl?: string;
    autoProvisionUsers?: boolean;
    mapGroupsToRoles?: boolean;
  }
) {
  const existing = await prisma.ssoConfig.findUnique({
    where: { tenantId }
  });

  if (existing) {
    throw new AppError("SSOAlreadyConfigured", "SSO already configured for this tenant", 409);
  }

  return prisma.ssoConfig.create({
    data: {
      tenantId,
      provider,
      clientId: config.clientId,
      encryptedClientSecret: config.encryptedClientSecret,
      authorizationUrl: config.authorizationUrl,
      tokenUrl: config.tokenUrl,
      userInfoUrl: config.userInfoUrl,
      discoveryUrl: config.discoveryUrl,
      samlMetadataUrl: config.samlMetadataUrl,
      autoProvisionUsers: config.autoProvisionUsers ?? true,
      mapGroupsToRoles: config.mapGroupsToRoles ?? false,
      isEnabled: true
    }
  });
}

/**
 * Get SSO configuration for a tenant
 */
export async function getSSOConfig(tenantId: string) {
  return prisma.ssoConfig.findUnique({
    where: { tenantId }
  });
}

/**
 * Update SSO configuration
 */
export async function updateSSOConfig(
  tenantId: string,
  updates: {
    isEnabled?: boolean;
    autoProvisionUsers?: boolean;
    mapGroupsToRoles?: boolean;
  }
) {
  return prisma.ssoConfig.update({
    where: { tenantId },
    data: updates
  });
}

/**
 * Handle OAuth callback and create/update user
 */
export async function handleOAuthCallback(
  tenantId: string,
  userInfo: OAuthUserInfo,
  token: OAuthToken
): Promise<{
  userId: string;
  isNewUser: boolean;
  tenant: any;
}> {
  const ssoConfig = await getSSOConfig(tenantId);

  if (!ssoConfig || !ssoConfig.isEnabled) {
    throw new AppError("SSODisabled", "SSO is not enabled for this tenant", 403);
  }

  // Try to find existing user by email
  let user = await prisma.user.findUnique({
    where: { email: userInfo.email }
  });

  const isNewUser = !user;

  if (!user) {
    // Auto-provision user if enabled
    if (!ssoConfig.autoProvisionUsers) {
      throw new AppError("UserNotFound", "User does not exist and auto-provisioning is disabled", 403);
    }

    user = await prisma.user.create({
      data: {
        email: userInfo.email,
        fullName: userInfo.name || userInfo.email,
        emailVerifiedAt: userInfo.email_verified ? new Date() : null,
        memberships: {
          create: {
            tenantId,
            role: "FREELANCER"
          }
        }
      }
    });
  }

  // Map groups to roles if enabled
  if (ssoConfig.mapGroupsToRoles && userInfo.groups) {
    for (const groupName of userInfo.groups) {
      // Find role by name
      const role = await prisma.role.findFirst({
        where: {
          tenantId,
          name: groupName
        }
      });

      if (role) {
        try {
          await assignRole(user.id, role.id, {
            reason: `Auto-assigned from SSO group: ${groupName}`
          });
        } catch (error) {
          // Ignore if role already assigned
          if ((error as any)?.code !== "RoleAlreadyAssigned") {
            throw error;
          }
        }
      }
    }
  }

  return {
    userId: user.id,
    isNewUser,
    tenant: await prisma.tenant.findUnique({ where: { id: tenantId } })
  };
}

/**
 * Generate OAuth authorization URL
 */
export function getOAuthAuthorizationUrl(
  config: any,
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = ["openid", "email", "profile"]
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange OAuth code for token
 */
export async function exchangeOAuthCode(
  config: any,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<OAuthToken> {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    }).toString()
  });

  if (!response.ok) {
    throw new AppError("OAuthError", "Failed to exchange code for token", 500);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type || "Bearer"
  };
}

/**
 * Get user info from OAuth provider
 */
export async function getOAuthUserInfo(
  config: any,
  token: OAuthToken
): Promise<OAuthUserInfo> {
  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `${token.tokenType} ${token.accessToken}`
    }
  });

  if (!response.ok) {
    throw new AppError("OAuthError", "Failed to get user info", 500);
  }

  return response.json();
}

/**
 * Validate SAML response (stub - actual implementation depends on SAML library)
 */
export async function validateSAMLResponse(
  config: any,
  samlResponse: string
): Promise<OAuthUserInfo> {
  // This would use a library like passport-saml or similar
  // For now, just return a placeholder
  throw new AppError("NotImplemented", "SAML validation not yet implemented", 501);
}

/**
 * Disable SSO for a tenant
 */
export async function disableSSO(tenantId: string) {
  return prisma.ssoConfig.update({
    where: { tenantId },
    data: { isEnabled: false }
  });
}

/**
 * Remove SSO configuration entirely
 */
export async function removeSSOConfig(tenantId: string) {
  return prisma.ssoConfig.delete({
    where: { tenantId }
  });
}

/**
 * Get provider configuration template
 */
export function getProviderTemplate(provider: SSOProvider) {
  const templates: Record<SSOProvider, any> = {
    google: {
      discoveryUrl: "https://accounts.google.com/.well-known/openid-configuration",
      scopes: ["openid", "email", "profile"]
    },
    microsoft: {
      discoveryUrl: "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
      scopes: ["openid", "email", "profile"]
    },
    okta: {
      // Requires tenant-specific domain
      scopes: ["openid", "email", "profile"]
    },
    keycloak: {
      // Requires keycloak instance URL
      scopes: ["openid", "email", "profile"]
    },
    custom: {
      scopes: ["openid", "email", "profile"]
    }
  };

  return templates[provider];
}
