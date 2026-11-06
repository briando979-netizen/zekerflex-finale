// Invoice generation as PDF

import { PDFDocument, PDFPage } from "pdf-lib";

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  customerName: string;
  customerEmail: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRate: number;
  stripeInvoiceId?: string;
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Uint8Array> {
  const doc = PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  const fontSize = 12;
  const margin = 50;

  // Header
  page.drawText("FACTUUR", {
    x: margin,
    y: height - margin,
    size: 24,
    color: { r: 0, g: 0, b: 0 },
  });

  page.drawText(`Factuurnummer: ${data.invoiceNumber}`, {
    x: margin,
    y: height - margin - 40,
    size: fontSize,
  });

  page.drawText(`Datum: ${data.date.toLocaleDateString("nl-NL")}`, {
    x: margin,
    y: height - margin - 60,
    size: fontSize,
  });

  // Customer
  page.drawText("Facturering:", {
    x: margin,
    y: height - margin - 120,
    size: fontSize,
    color: { r: 0.3, g: 0.3, b: 0.3 },
  });

  page.drawText(data.customerName, {
    x: margin,
    y: height - margin - 140,
    size: fontSize,
  });

  page.drawText(data.customerEmail, {
    x: margin,
    y: height - margin - 160,
    size: fontSize,
  });

  // Items (simplified table)
  let yPos = height - margin - 240;
  page.drawText("Omschrijving | Aantal | Prijs | Totaal", {
    x: margin,
    y: yPos,
    size: fontSize - 2,
    color: { r: 0.5, g: 0.5, b: 0.5 },
  });

  yPos -= 20;
  for (const item of data.items) {
    page.drawText(
      `${item.description} | ${item.quantity} | €${(item.unitPrice / 100).toFixed(2)} | €${(item.total / 100).toFixed(2)}`,
      { x: margin, y: yPos, size: fontSize - 2 }
    );
    yPos -= 20;
  }

  // Totals
  yPos -= 20;
  page.drawText(`Subtotaal: €${(data.subtotalCents / 100).toFixed(2)}`, {
    x: margin,
    y: yPos,
    size: fontSize,
  });

  yPos -= 20;
  page.drawText(`Belasting (${Math.round(data.taxRate * 100)}%): €${(data.taxCents / 100).toFixed(2)}`, {
    x: margin,
    y: yPos,
    size: fontSize,
  });

  yPos -= 30;
  page.drawText(`TOTAAL: €${(data.totalCents / 100).toFixed(2)}`, {
    x: margin,
    y: yPos,
    size: 14,
    color: { r: 0, g: 0, b: 0 },
  });

  return doc.save();
}
