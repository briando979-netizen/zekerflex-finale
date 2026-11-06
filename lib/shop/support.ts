// Customer support and ticketing

export interface SupportTicket {
  id: string;
  customerId: string;
  orderId?: string;
  subject: string;
  category: "shipping" | "product" | "billing" | "account" | "other";
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
  messages: TicketMessage[];
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

export interface TicketMessage {
  id: string;
  author: "customer" | "support";
  content: string;
  attachments?: string[];
  createdAt: Date;
}

export async function createTicket(data: Partial<SupportTicket>): Promise<SupportTicket> {
  return {
    id: `ticket_${Date.now()}`,
    customerId: data.customerId || "",
    subject: data.subject || "",
    category: data.category || "other",
    priority: data.priority || "normal",
    status: "open",
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  };
}

export async function addMessageToTicket(ticketId: string, message: TicketMessage): Promise<SupportTicket> {
  // TODO: Update in database
  return { id: ticketId, customerId: "", subject: "", category: "other", priority: "normal", status: "open", messages: [message], createdAt: new Date(), updatedAt: new Date() };
}

export async function updateTicketStatus(
  ticketId: string,
  status: SupportTicket["status"]
): Promise<SupportTicket> {
  // TODO: Update in database
  return { id: ticketId, customerId: "", subject: "", category: "other", priority: "normal", status, messages: [], createdAt: new Date(), updatedAt: new Date() };
}

export async function getCustomerTickets(customerId: string): Promise<SupportTicket[]> {
  // TODO: Fetch from database
  return [];
}

export const SUPPORT_CATEGORIES = [
  { id: "shipping", label: "Verzending", emoji: "📦" },
  { id: "product", label: "Product", emoji: "🛍️" },
  { id: "billing", label: "Facturering", emoji: "💳" },
  { id: "account", label: "Account", emoji: "👤" },
  { id: "other", label: "Overig", emoji: "❓" },
];
