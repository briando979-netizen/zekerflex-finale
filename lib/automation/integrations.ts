import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// ============================================================================
// 3. INTEGRATION HUB - Pre-built connectors & custom webhooks
// ============================================================================

export type SupportedConnector =
  | "SALESFORCE"
  | "HUBSPOT"
  | "SLACK"
  | "TEAMS"
  | "GOOGLE"
  | "STRIPE"
  | "WEBHOOK"
  | "CUSTOM";

export interface ConnectorConfig {
  type: SupportedConnector;
  credentials: Record<string, unknown>;
  baseUrl?: string;
  authType: "OAUTH2" | "API_KEY" | "BASIC" | "CUSTOM";
  requestsPerSecond?: number;
}

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Create or update automation connector
 */
export async function setupConnector(
  tenantId: string,
  name: string,
  config: ConnectorConfig
) {
  // Validate connector config
  validateConnectorConfig(config);

  const existing = await prisma.automationConnector.findFirst({
    where: {
      tenantId,
      name,
    },
  });

  if (existing) {
    return await prisma.automationConnector.update({
      where: { id: existing.id },
      data: {
        type: config.type as any,
        config: config as unknown,
        authType: config.authType,
        baseUrl: config.baseUrl,
      },
    });
  }

  return await prisma.automationConnector.create({
    data: {
      tenantId,
      name,
      type: config.type as any,
      config: config as unknown,
      authType: config.authType,
      baseUrl: config.baseUrl,
      capabilities: getConnectorCapabilities(config.type),
    },
  });
}

/**
 * Get connector by ID
 */
export async function getConnector(tenantId: string, connectorId: string) {
  const connector = await prisma.automationConnector.findUnique({
    where: { id: connectorId },
  });

  if (!connector || connector.tenantId !== tenantId) {
    throw new AppError.notFound("Connector niet gevonden");
  }

  return connector;
}

/**
 * List connectors for tenant
 */
export async function listConnectors(
  tenantId: string,
  options?: { type?: SupportedConnector; active?: boolean }
) {
  return await prisma.automationConnector.findMany({
    where: {
      tenantId,
      ...(options?.type && { type: options.type as any }),
      ...(options?.active !== undefined && { isActive: options.active }),
    },
  });
}

/**
 * Test connector connectivity
 */
export async function testConnector(tenantId: string, connectorId: string) {
  const connector = await getConnector(tenantId, connectorId);
  const config = connector.config as ConnectorConfig;

  try {
    let isHealthy = false;
    let message = "";

    switch (connector.type) {
      case "SALESFORCE":
        ({ isHealthy, message } = await testSalesforceConnection(config));
        break;
      case "HUBSPOT":
        ({ isHealthy, message } = await testHubSpotConnection(config));
        break;
      case "SLACK":
        ({ isHealthy, message } = await testSlackConnection(config));
        break;
      case "TEAMS":
        ({ isHealthy, message } = await testTeamsConnection(config));
        break;
      case "GOOGLE":
        ({ isHealthy, message } = await testGoogleConnection(config));
        break;
      case "STRIPE":
        ({ isHealthy, message } = await testStripeConnection(config));
        break;
      case "WEBHOOK":
        ({ isHealthy, message } = await testWebhookConnection(config));
        break;
      default:
        isHealthy = true;
        message = "Custom connector";
    }

    await prisma.automationConnector.update({
      where: { id: connectorId },
      data: {
        isHealthy,
        lastHealthCheck: new Date(),
      },
    });

    return { isHealthy, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";

    await prisma.automationConnector.update({
      where: { id: connectorId },
      data: {
        isHealthy: false,
        lastHealthCheck: new Date(),
      },
    });

    throw new AppError.validation(`Connector test failed: ${message}`);
  }
}

/**
 * Connector-specific test methods
 */
async function testSalesforceConnection(config: ConnectorConfig) {
  const instanceUrl = config.credentials.instanceUrl as string;
  const accessToken = config.credentials.accessToken as string;

  const response = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    isHealthy: response.ok,
    message: response.ok ? "Salesforce connected" : "Salesforce connection failed",
  };
}

async function testHubSpotConnection(config: ConnectorConfig) {
  const apiKey = config.credentials.apiKey as string;

  const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return {
    isHealthy: response.ok,
    message: response.ok ? "HubSpot connected" : "HubSpot connection failed",
  };
}

async function testSlackConnection(config: ConnectorConfig) {
  const botToken = config.credentials.botToken as string;

  const response = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
    },
  });

  const data = (await response.json()) as Record<string, unknown>;
  return {
    isHealthy: data.ok === true,
    message: data.ok ? "Slack connected" : "Slack connection failed",
  };
}

async function testTeamsConnection(config: ConnectorConfig) {
  const webhook = config.credentials.webhookUrl as string;

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Test connection from ZekerFlex Automation",
    }),
  });

  return {
    isHealthy: response.ok,
    message: response.ok ? "Teams connected" : "Teams connection failed",
  };
}

async function testGoogleConnection(config: ConnectorConfig) {
  // Validate JWT/OAuth token
  const accessToken = config.credentials.accessToken as string;

  const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    isHealthy: response.ok,
    message: response.ok ? "Google connected" : "Google connection failed",
  };
}

async function testStripeConnection(config: ConnectorConfig) {
  const apiKey = config.credentials.apiKey as string;

  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return {
    isHealthy: response.ok,
    message: response.ok ? "Stripe connected" : "Stripe connection failed",
  };
}

async function testWebhookConnection(config: ConnectorConfig) {
  // Webhooks are validated by receiving a test payload
  return {
    isHealthy: !!config.credentials.webhookUrl,
    message: "Webhook endpoint ready",
  };
}

/**
 * Send data to connector
 */
export async function sendToConnector(
  tenantId: string,
  connectorId: string,
  action: string,
  data: Record<string, unknown>
) {
  const connector = await getConnector(tenantId, connectorId);
  const config = connector.config as ConnectorConfig;

  switch (connector.type) {
    case "SLACK":
      return await sendToSlack(config, action, data);
    case "TEAMS":
      return await sendToTeams(config, action, data);
    case "WEBHOOK":
      return await sendToWebhook(config, action, data);
    default:
      throw new AppError.validation(`Send not supported for ${connector.type}`);
  }
}

async function sendToSlack(
  config: ConnectorConfig,
  action: string,
  data: Record<string, unknown>
) {
  const botToken = config.credentials.botToken as string;
  const channelId = data.channel_id as string;
  const message = data.message as string;

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: message,
    }),
  });

  return await response.json();
}

async function sendToTeams(
  config: ConnectorConfig,
  action: string,
  data: Record<string, unknown>
) {
  const webhookUrl = config.credentials.webhookUrl as string;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: data.message || "Message from ZekerFlex Automation",
      summary: data.summary,
    }),
  });

  return { ok: response.ok, status: response.status };
}

async function sendToWebhook(
  config: ConnectorConfig,
  action: string,
  data: Record<string, unknown>
) {
  const webhookUrl = config.credentials.webhookUrl as string;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      data,
      timestamp: new Date().toISOString(),
    }),
  });

  return await response.json();
}

/**
 * Register webhook endpoint for receiving events
 */
export async function registerWebhook(
  tenantId: string,
  name: string,
  url: string,
  secret: string
) {
  return await setupConnector(tenantId, name, {
    type: "WEBHOOK",
    authType: "CUSTOM",
    credentials: {
      webhookUrl: url,
      secret: secret, // Should be encrypted in production
    },
  });
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require("crypto");
  const hash = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return hash === signature;
}

/**
 * Process incoming webhook
 */
export async function processWebhook(
  tenantId: string,
  connectorId: string,
  payload: WebhookPayload
) {
  const connector = await getConnector(tenantId, connectorId);

  // Log webhook received
  await prisma.workflowExecutionLog.create({
    data: {
      runId: "webhook-" + connectorId,
      level: "INFO",
      message: `Webhook received: ${payload.event}`,
      metadata: payload as unknown,
    },
  });

  // Find workflows triggered by this webhook
  const workflows = await prisma.workflow.findMany({
    where: {
      tenantId,
      triggerType: "WEBHOOK",
      enabled: true,
    },
  });

  const results = [];
  for (const workflow of workflows) {
    const definition = workflow.definition as Record<string, unknown>;
    const triggerConfig = (definition.nodes as Array<Record<string, unknown>> || []).find(
      (n) => n.type === "trigger"
    )?.config as Record<string, unknown> | undefined;

    if (triggerConfig?.webhookConnectorId === connectorId) {
      // Trigger this workflow
      const orchestration = await import("./orchestration");
      const result = await orchestration.orchestrateWorkflow(
        tenantId,
        workflow.id,
        payload.data,
        "WEBHOOK"
      );
      results.push(result);
    }
  }

  return results;
}

/**
 * Get capabilities for each connector type
 */
function getConnectorCapabilities(type: SupportedConnector): string[] {
  const capabilities: Record<SupportedConnector, string[]> = {
    SALESFORCE: ["CREATE_RECORD", "UPDATE_RECORD", "DELETE_RECORD", "QUERY_RECORDS"],
    HUBSPOT: ["CREATE_CONTACT", "UPDATE_CONTACT", "CREATE_DEAL", "CREATE_TASK"],
    SLACK: ["SEND_MESSAGE", "CREATE_CHANNEL", "INVITE_USER"],
    TEAMS: ["SEND_MESSAGE", "CREATE_CHANNEL"],
    GOOGLE: ["SEND_EMAIL", "CREATE_EVENT", "CREATE_SPREADSHEET_ROW"],
    STRIPE: ["CREATE_CHARGE", "CREATE_CUSTOMER", "CREATE_INVOICE"],
    WEBHOOK: ["SEND_PAYLOAD", "RECEIVE_PAYLOAD"],
    CUSTOM: [],
  };

  return capabilities[type] || [];
}

/**
 * Validate connector configuration
 */
function validateConnectorConfig(config: ConnectorConfig) {
  if (!config.type || !config.authType) {
    throw new AppError.validation("Connector type en auth-type zijn verplicht");
  }

  if (!config.credentials || Object.keys(config.credentials).length === 0) {
    throw new AppError.validation("Connector credentials zijn verplicht");
  }

  switch (config.type) {
    case "SALESFORCE":
      if (!config.credentials.instanceUrl || !config.credentials.accessToken) {
        throw new AppError.validation("Salesforce: instanceUrl en accessToken vereist");
      }
      break;
    case "HUBSPOT":
      if (!config.credentials.apiKey) {
        throw new AppError.validation("HubSpot: apiKey vereist");
      }
      break;
    case "SLACK":
      if (!config.credentials.botToken) {
        throw new AppError.validation("Slack: botToken vereist");
      }
      break;
    case "WEBHOOK":
      if (!config.credentials.webhookUrl) {
        throw new AppError.validation("Webhook: webhookUrl vereist");
      }
      break;
  }
}
