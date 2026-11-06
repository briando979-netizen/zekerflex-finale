// Invoice management and retrieval

export interface Invoice {
  id: string;
  customerId: string;
  orderId?: string;
  subscriptionId?: string;
  number: string;
  date: Date;
  dueDate: Date;
  paidDate?: Date;
  items: InvoiceItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  currency: string;
  pdfUrl?: string;
  stripeInvoiceId?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export async function createInvoice(data: Partial<Invoice>): Promise<Invoice> {
  // TODO: Store in database
  const now = new Date();
  return {
    id: `inv_${Date.now()}`,
    customerId: data.customerId || "",
    number: data.number || `INV-${Date.now()}`,
    date: data.date || now,
    dueDate: data.dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    items: data.items || [],
    subtotalCents: data.subtotalCents || 0,
    taxCents: data.taxCents || 0,
    totalCents: data.totalCents || 0,
    status: "draft",
    currency: "EUR",
    ...data,
  };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  // TODO: Fetch from database
  return null;
}

export async function getCustomerInvoices(customerId: string): Promise<Invoice[]> {
  // TODO: Fetch from database
  return [];
}

export async function markInvoicePaid(id: string, paidDate: Date = new Date()): Promise<Invoice> {
  // TODO: Update database
  return { id, customerId: "", number: "", date: new Date(), dueDate: new Date(), items: [], subtotalCents: 0, taxCents: 0, totalCents: 0, status: "paid", currency: "EUR" };
}

export async function generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
  // TODO: Use pdf-lib or similar to generate PDF
  return Buffer.from("PDF content");
}

export function formatInvoiceNumber(invoice: Invoice): string {
  return `${invoice.number} (${invoice.date.toLocaleDateString("nl-NL")})`;
}

export function getInvoiceStatus(invoice: Invoice): string {
  const statusMap: Record<string, string> = {
    draft: "Concept",
    sent: "Verstuurd",
    paid: "Betaald",
    overdue: "Vervallen",
    cancelled: "Geannuleerd",
  };
  return statusMap[invoice.status] || invoice.status;
}
