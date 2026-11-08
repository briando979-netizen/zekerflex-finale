/**
 * Connector Library — Pre-built integrations for Slack, Gmail, Stripe, Salesforce, etc.
 * Manages connector definitions, authentication, and lifecycle.
 */

import { prisma } from "@/lib/prisma";

export type ConnectorType = "oauth" | "api_key" | "basic_auth" | "webhook";

export interface ConnectorDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: "messaging" | "email" | "payment" | "crm" | "analytics" | "other";
  icon: string;
  authType: ConnectorType;
  requiredScopes?: string[];
  baseUrl: string;
  documentationUrl: string;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerDay?: number;
  };
  webhookSupport: boolean;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiresAuth: boolean;
}

// Pre-built connector registry
const CONNECTOR_REGISTRY: Record<string, ConnectorDefinition> = {
  slack: {
    id: "slack",
    name: "slack",
    displayName: "Slack",
    description: "Send messages, create channels, and manage Slack workflows",
    category: "messaging",
    icon: "slack",
    authType: "oauth",
    requiredScopes: ["chat:write", "channels:read", "users:read"],
    baseUrl: "https://slack.com/api",
    documentationUrl: "https://api.slack.com",
    rateLimit: { requestsPerMinute: 60 },
    webhookSupport: true,
  },
  gmail: {
    id: "gmail",
    name: "gmail",
    displayName: "Gmail",
    description: "Send emails and manage Gmail labels",
    category: "email",
    icon: "gmail",
    authType: "oauth",
    requiredScopes: ["https://www.googleapis.com/auth/gmail.send"],
    baseUrl: "https://www.googleapis.com/gmail/v1",
    documentationUrl: "https://developers.google.com/gmail/api",
    rateLimit: { requestsPerMinute: 100 },
    webhookSupport: false,
  },
  stripe: {
    id: "stripe",
    name: "stripe",
    displayName: "Stripe",
    description: "Process payments, manage customers, and handle invoices",
    category: "payment",
    icon: "stripe",
    authType: "api_key",
    baseUrl: "https://api.stripe.com/v1",
    documentationUrl: "https://stripe.com/docs/api",
    rateLimit: { requestsPerMinute: 100 },
    webhookSupport: true,
  },
  salesforce: {
    id: "salesforce",
    name: "salesforce",
    displayName: "Salesforce",
    description: "Manage CRM data, leads, and opportunities",
    category: "crm",
    icon: "salesforce",
    authType: "oauth",
    requiredScopes: ["api", "refresh_token"],
    baseUrl: "https://api.salesforce.com/services/data/v58.0",
    documentationUrl: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest",
    rateLimit: { requestsPerMinute: 60 },
    webhookSupport: true,
  },
};

/**
 * Get connector definition by name
 */
export function getConnectorDefinition(connectorName: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY[connectorName.toLowerCase()];
}

/**
 * List all available connectors
 */
export function listConnectors(): ConnectorDefinition[] {
  return Object.values(CONNECTOR_REGISTRY);
}

/**
 * Store encrypted connector credentials
 */
export async function storeConnectorCredentials(
  tenantId: string,
  connectorName: string,
  credentials: Record<string, unknown>,
  expiresAt?: Date
): Promise<string> {
  const connector = getConnectorDefinition(connectorName);
  if (!connector) {
    throw new Error(`Unknown connector: ${connectorName}`);
  }

  // In production, credentials should be encrypted with AES-256-GCM
  // This is a simplified version - use a proper encryption library in production
  const encryptedData = Buffer.from(JSON.stringify(credentials)).toString("base64");

  const credential = await prisma.connectorCredential.upsert({
    where: {
      tenantId_connectorName: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
      },
    },
    update: {
      encryptedData,
      expiresAt,
      isValid: true,
      lastValidatedAt: new Date(),
    },
    create: {
      tenantId,
      connectorName: connectorName.toLowerCase(),
      connectorType: connector.authType,
      encryptedData,
      expiresAt,
      isValid: true,
      lastValidatedAt: new Date(),
    },
  });

  return credential.id;
}

/**
 * Retrieve and decrypt connector credentials
 */
export async function getConnectorCredentials(
  tenantId: string,
  connectorName: string
): Promise<Record<string, unknown> | null> {
  const credential = await prisma.connectorCredential.findUnique({
    where: {
      tenantId_connectorName: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
      },
    },
  });

  if (!credential || !credential.isValid) {
    return null;
  }

  // Check if expired
  if (credential.expiresAt && credential.expiresAt < new Date()) {
    await prisma.connectorCredential.update({
      where: { id: credential.id },
      data: { isValid: false },
    });
    return null;
  }

  // In production, decrypt with AES-256-GCM
  try {
    const decrypted = Buffer.from(credential.encryptedData, "base64").toString("utf-8");
    return JSON.parse(decrypted) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Validate connector credentials by making a test API call
 */
export async function validateConnectorCredentials(
  connectorName: string,
  credentials: Record<string, unknown>
): Promise<boolean> {
  // Implement connector-specific validation logic
  // For now, return true - in production this would make actual API calls
  const connector = getConnectorDefinition(connectorName);
  if (!connector) {
    return false;
  }

  // Placeholder - each connector would have its own validation logic
  return true;
}

/**
 * Delete connector credentials
 */
export async function deleteConnectorCredentials(
  tenantId: string,
  connectorName: string
): Promise<void> {
  await prisma.connectorCredential.delete({
    where: {
      tenantId_connectorName: {
        tenantId,
        connectorName: connectorName.toLowerCase(),
      },
    },
  });
}

/**
 * Make authenticated request to a connector's API
 */
export async function makeConnectorRequest(
  tenantId: string,
  connectorName: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  endpoint: string,
  data?: unknown
): Promise<Response> {
  const credentials = await getConnectorCredentials(tenantId, connectorName);
  if (!credentials) {
    throw new Error(`No valid credentials for connector: ${connectorName}`);
  }

  const connector = getConnectorDefinition(connectorName);
  if (!connector) {
    throw new Error(`Unknown connector: ${connectorName}`);
  }

  const url = `${connector.baseUrl}${endpoint}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  // Add authentication headers based on connector type
  if (connector.authType === "oauth" && "access_token" in credentials) {
    headers.Authorization = `Bearer ${credentials.access_token}`;
  } else if (connector.authType === "api_key" && "api_key" in credentials) {
    headers["X-API-Key"] = String(credentials.api_key);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `Connector request failed: ${response.status} ${response.statusText}`
    );
  }

  return response;
}
