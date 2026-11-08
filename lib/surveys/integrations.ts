// Integration hooks for surveys and feedback

export async function sendToSlack(webhookUrl: string, message: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        timestamp: new Date().toISOString(),
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("Slack integration error:", error);
    return false;
  }
}

export async function sendEmailNotification(
  email: string,
  subject: string,
  body: string
) {
  // Email integration would use lib/email
  // For now, just log
  console.log(`Email to ${email}: ${subject}`);
  return true;
}

export async function sendCrmUpdate(
  crmType: string,
  contactId: string,
  data: Record<string, unknown>
) {
  // CRM integration (HubSpot, Salesforce, etc.)
  console.log(`CRM update (${crmType}):`, { contactId, data });
  return true;
}

export async function triggerWebhook(
  webhookUrl: string,
  event: string,
  payload: Record<string, unknown>
) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        payload,
        timestamp: new Date().toISOString(),
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("Webhook integration error:", error);
    return false;
  }
}

export async function notifyIntegrations(
  integrations: Array<{
    type: "slack" | "email" | "webhook" | "crm";
    config: Record<string, unknown>;
  }>,
  event: string,
  data: Record<string, unknown>
) {
  const results = await Promise.all(
    integrations.map(async (integration) => {
      switch (integration.type) {
        case "slack":
          return sendToSlack(
            integration.config.webhookUrl as string,
            `${event}: ${JSON.stringify(data)}`
          );
        case "email":
          return sendEmailNotification(
            integration.config.email as string,
            `Survey Event: ${event}`,
            JSON.stringify(data)
          );
        case "webhook":
          return triggerWebhook(
            integration.config.url as string,
            event,
            data
          );
        case "crm":
          return sendCrmUpdate(
            integration.config.type as string,
            integration.config.contactId as string,
            data
          );
        default:
          return false;
      }
    })
  );

  return results.every((r) => r);
}
