// Third-party integrations

export type IntegrationProvider = "zapier" | "make" | "custom_webhook" | "erp" | "accounting" | "shipping" | "sms" | "crm";

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  status: "connected" | "disconnected" | "error";
  lastSync?: Date;
  config: Record<string, any>;
  enabledEvents: string[];
}

export const AVAILABLE_INTEGRATIONS: Array<{ provider: IntegrationProvider; name: string; description: string }> = [
  { provider: "zapier", name: "Zapier", description: "1000+ apps en automations" },
  { provider: "make", name: "Make.com", description: "Advanced workflow automation" },
  { provider: "erp", name: "ERP Integration", description: "Koppel je ERP-systeem" },
  { provider: "accounting", name: "Accounting Software", description: "Sync met boekhoudpakket" },
  { provider: "shipping", name: "Shipping APIs", description: "PostNL, DPD, TNT, UPS, FedEx" },
  { provider: "sms", name: "SMS Notifications", description: "Twilio, MessageBird" },
  { provider: "crm", name: "CRM Sync", description: "HubSpot, Salesforce, Pipedrive" },
];

export async function connectIntegration(
  provider: IntegrationProvider,
  credentials: Record<string, string>
): Promise<Integration> {
  return {
    id: `int_${Date.now()}`,
    provider,
    name: AVAILABLE_INTEGRATIONS.find((i) => i.provider === provider)?.name || provider,
    status: "connected",
    config: credentials,
    enabledEvents: [],
  };
}

export async function testIntegration(integration: Integration): Promise<boolean> {
  // TODO: Test the connection
  return true;
}

export async function syncIntegration(integration: Integration): Promise<void> {
  // TODO: Trigger a sync with the external system
}

export async function disconnectIntegration(id: string): Promise<void> {
  // TODO: Remove integration and clear config
}
