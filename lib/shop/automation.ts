// Order and workflow automation

export interface AutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  createdAt: Date;
}

export interface AutomationTrigger {
  type: "order_placed" | "payment_received" | "shipment_ready" | "review_received" | "abandoned_cart" | "customer_inactive";
  conditions?: Record<string, any>;
}

export interface AutomationAction {
  type: "send_email" | "create_task" | "update_status" | "trigger_webhook" | "apply_discount" | "notify_admin";
  config: Record<string, any>;
}

export const AUTOMATION_TEMPLATES = [
  {
    id: "order_confirmation",
    name: "Order Confirmation Email",
    trigger: { type: "order_placed" as const },
    actions: [{ type: "send_email" as const, config: { template: "order_confirmation" } }],
  },
  {
    id: "payment_reminder",
    name: "Payment Reminder (24h)",
    trigger: { type: "abandoned_cart" as const, conditions: { minutesSinceAdd: 1440 } },
    actions: [{ type: "send_email" as const, config: { template: "abandoned_cart_reminder" } }],
  },
  {
    id: "review_request",
    name: "Request Review (7d after delivery)",
    trigger: { type: "shipment_ready" as const, conditions: { daysAfter: 7 } },
    actions: [{ type: "send_email" as const, config: { template: "review_request" } }],
  },
  {
    id: "reactivation",
    name: "Win-back Campaign (90d inactive)",
    trigger: { type: "customer_inactive" as const, conditions: { daysSinceOrder: 90 } },
    actions: [{ type: "send_email" as const, config: { template: "winback_20off" } }],
  },
];

export async function createAutomationRule(data: Partial<AutomationRule>): Promise<AutomationRule> {
  return {
    id: `auto_${Date.now()}`,
    name: data.name || "",
    trigger: data.trigger || { type: "order_placed" },
    actions: data.actions || [],
    enabled: true,
    createdAt: new Date(),
    ...data,
  };
}

export async function executeAutomation(rule: AutomationRule, context: Record<string, any>): Promise<void> {
  for (const action of rule.actions) {
    switch (action.type) {
      case "send_email":
        // TODO: Send email
        break;
      case "create_task":
        // TODO: Create admin task
        break;
      case "update_status":
        // TODO: Update order/customer status
        break;
      case "trigger_webhook":
        // TODO: Call webhook
        break;
      case "notify_admin":
        // TODO: Send admin notification
        break;
    }
  }
}
