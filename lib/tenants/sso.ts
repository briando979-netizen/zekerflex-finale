import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

/**
 * SSO / SAML / OIDC configuration and authentication.
 */

export const ssoConfigSchema = z.object({
  provider: z.enum(["SAML", "OIDC", "OAUTH2"]),
  enabled: z.boolean().default(true),

  // OIDC / OAuth2
  clientId: z.string(),
  clientSecret: z.string(),
  discoveryUrl: z.string().url().optional(),

  // SAML
  entityId: z.string().optional(),
  acsUrl: z.string().url().optional(),
  ssoUrl: z.string().url().optional(),
  sloUrl: z.string().url().optional(),
  idpCertificate: z.string().optional(),
  spPrivateKey: z.string().optional(),
  spCertificate: z.string().optional(),

  // Common
  scopes: z.array(z.string()).optional(),
  userIdAttribute: z.string().default("sub"),
  emailAttribute: z.string().default("email"),
  nameAttribute: z.string().default("name"),

  autoProvisionUsers: z.boolean().default(false),
  autoAssignRole: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"]).default("MEMBER"),
});

/**
 * Configure SSO for a tenant.
 */
export async function configureSso(
  tenantId: string,
  config: z.infer<typeof ssoConfigSchema>
) {
  const validated = ssoConfigSchema.parse(config);

  // Check if SSO already exists for this tenant & provider
  const existing = await prisma.ssoProvider_rel.findFirst({
    where: {
      tenantId,
      provider: validated.provider,
    },
  });

  if (existing) {
    // Update existing
    return await prisma.ssoProvider_rel.update({
      where: { id: existing.id },
      data: {
        ...validated,
        clientSecret: encryptSecret(validated.clientSecret),
        spPrivateKey: validated.spPrivateKey
          ? encryptSecret(validated.spPrivateKey)
          : undefined,
      },
    });
  }

  // Create new
  return await prisma.ssoProvider_rel.create({
    data: {
      tenantId,
      ...validated,
      clientSecret: encryptSecret(validated.clientSecret),
      spPrivateKey: validated.spPrivateKey
        ? encryptSecret(validated.spPrivateKey)
        : undefined,
    },
  });
}

/**
 * Get SSO configuration for a tenant.
 */
export async function getSsoConfig(
  tenantId: string,
  provider?: string
) {
  const where: any = { tenantId, enabled: true };
  if (provider) {
    where.provider = provider;
  }

  return await prisma.ssoProvider_rel.findMany({
    where,
  });
}

/**
 * Disable SSO for a tenant.
 */
export async function disableSso(
  tenantId: string,
  provider: string
) {
  return await prisma.ssoProvider_rel.updateMany({
    where: { tenantId, provider },
    data: { enabled: false },
  });
}

/**
 * Exchange OIDC authorization code for tokens.
 * (This would integrate with actual OIDC library in production)
 */
export async function exchangeOidcCode(
  tenantId: string,
  code: string,
  redirectUri: string
): Promise<any> {
  const ssoConfig = await prisma.ssoProvider_rel.findFirst({
    where: {
      tenantId,
      provider: "OIDC",
      enabled: true,
    },
  });

  if (!ssoConfig) {
    throw AppError.notFound("OIDC not configured for tenant");
  }

  // In production: use an OIDC library to:
  // 1. Call token endpoint with code, clientId, clientSecret
  // 2. Validate ID token signature
  // 3. Extract user claims
  const mockIdToken = {
    sub: "user-oidc-id",
    email: "user@example.com",
    name: "User Name",
  };

  return mockIdToken;
}

/**
 * Verify SAML assertion and extract user info.
 * (This would integrate with actual SAML library in production)
 */
export async function verifySamlAssertion(
  tenantId: string,
  samlAssertion: string
): Promise<any> {
  const ssoConfig = await prisma.ssoProvider_rel.findFirst({
    where: {
      tenantId,
      provider: "SAML",
      enabled: true,
    },
  });

  if (!ssoConfig) {
    throw AppError.notFound("SAML not configured for tenant");
  }

  // In production: use a SAML library to:
  // 1. Parse and validate SAML assertion
  // 2. Verify signature using IdP certificate
  // 3. Check NotBefore/NotOnOrAfter
  // 4. Extract user attributes
  const mockAssertion = {
    uid: "user-saml-id",
    email: "user@example.com",
    displayName: "User Name",
  };

  return mockAssertion;
}

/**
 * Auto-provision or link user from SSO claim.
 */
export async function provisionSsoUser(
  tenantId: string,
  userClaims: {
    userId: string;
    email: string;
    name: string;
  },
  ssoConfig: any
) {
  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: userClaims.email },
  });

  // Create user if auto-provisioning enabled
  if (!user && ssoConfig.autoProvisionUsers) {
    user = await prisma.user.create({
      data: {
        email: userClaims.email,
        fullName: userClaims.name,
        emailVerifiedAt: new Date(), // SSO users are pre-verified
      },
    });
  }

  if (!user) {
    throw AppError.notFound("User not found and auto-provisioning disabled");
  }

  // Ensure user is member of tenant
  let membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      tenantId,
    },
  });

  if (!membership) {
    // Add user to tenant with auto-assigned role
    membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        role: ssoConfig.autoAssignRole as any,
      },
    });
  }

  // Link SSO external ID (would need a separate SsoUserLink table in production)
  // For now, store as audit trail
  await prisma.tenantAuditTrail.create({
    data: {
      tenantId,
      action: "SSO_CONFIGURED",
      actorId: user.id,
      targetType: "User",
      targetId: user.id,
      changes: {
        provider: ssoConfig.provider,
        externalId: userClaims.userId,
      },
    },
  });

  return { user, membership };
}

/**
 * Generate SAML metadata XML for the service provider.
 */
export function generateSamlMetadata(
  tenantId: string,
  config: any
): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                 entityID="${config.entityId}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${config.spCertificate}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                        Location="${config.sloUrl}"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                             Location="${config.acsUrl}"
                             index="1"
                             isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  return xml;
}

/**
 * Encrypt secret using platform master key (mock).
 */
function encryptSecret(secret: string): string {
  // In production: encrypt with platform master key
  return Buffer.from(secret).toString("base64");
}

/**
 * Decrypt secret using platform master key (mock).
 */
export function decryptSecret(encrypted: string): string {
  // In production: decrypt with platform master key
  return Buffer.from(encrypted, "base64").toString("utf-8");
}
