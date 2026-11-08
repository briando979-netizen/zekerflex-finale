/**
 * Payment & Billing Orchestration API
 * Unified endpoint for all 6 subsystems
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import * as invoices from "@/lib/billing/invoices";
import * as payments from "@/lib/billing/payment-processing";
import * as cycles from "@/lib/billing/billing-cycles";
import * as expenses from "@/lib/billing/expense-tracking";
import * as reporting from "@/lib/billing/financial-reporting";
import * as revenue from "@/lib/billing/revenue-recognition";

// Request schemas
const createInvoiceSchema = z.object({
  type: z.enum(["PLATFORM_FEE", "SELF_BILL_FREELANCER", "CANCELLATION_PENALTY"]),
  recipientTenantId: z.string().optional(),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPriceCents: z.number().nonnegative(),
    }),
  ),
  vatTreatment: z.enum(["STANDARD", "REVERSE_CHARGE", "EXEMPT"]),
  vatRate: z.number().min(0).max(1),
});

const processPaymentSchema = z.object({
  invoiceId: z.string(),
  method: z.enum(["SEPA_INSTANT", "SEPA_STANDARD"]),
  creditorIban: z.string(),
  debtorIban: z.string().optional(),
});

const recordExpenseSchema = z.object({
  category: z.enum([
    "STRIPE_FEES",
    "PAYOUT_FEES",
    "COMMISSION",
    "TRAVEL",
    "MEALS",
    "SUPPLIES",
    "EQUIPMENT",
    "UTILITIES",
    "OTHER",
  ]),
  amountCents: z.number().positive(),
  description: z.string(),
  taxCategory: z.string().optional(),
  mileage: z.number().optional(),
  receiptUrl: z.string().url().optional(),
});

const getProfitLossSchema = z.object({
  tenantId: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { action, data } = await req.json();

    // =======================
    // Invoice Management (1)
    // =======================
    if (action === "create_invoice") {
      const parsed = createInvoiceSchema.parse(data);

      const invoiceId = await invoices.createInvoice({
        type: parsed.type,
        recipientTenantId: parsed.recipientTenantId,
        vatTreatment: parsed.vatTreatment,
        vatRate: parsed.vatRate,
        lines: parsed.lines,
      });

      return NextResponse.json({ invoiceId });
    }

    if (action === "issue_invoice") {
      const { invoiceId } = z.object({ invoiceId: z.string() }).parse(data);
      await invoices.issueInvoice(invoiceId);
      return NextResponse.json({ success: true });
    }

    if (action === "get_invoice") {
      const { invoiceId } = z.object({ invoiceId: z.string() }).parse(data);
      const invoice = await invoices.getInvoiceDetails(invoiceId);
      return NextResponse.json(invoice);
    }

    if (action === "list_invoices") {
      const { tenantId } = z.object({ tenantId: z.string() }).parse(data);
      const list = await invoices.listInvoices({
        recipientTenantId: tenantId,
      });
      return NextResponse.json(list);
    }

    // =======================
    // Payment Processing (2)
    // =======================
    if (action === "process_payment") {
      const parsed = processPaymentSchema.parse(data);
      const paymentId = await payments.processPayment({
        invoiceId: parsed.invoiceId,
        amountCents: data.amountCents,
        currency: data.currency ?? "EUR",
        method: parsed.method,
        creditorIban: parsed.creditorIban,
        debtorIban: parsed.debtorIban,
        idempotencyKey: data.idempotencyKey ?? `payment-${Date.now()}`,
      });
      return NextResponse.json({ paymentId });
    }

    if (action === "settle_payment") {
      const { paymentId, providerReference } = z
        .object({ paymentId: z.string(), providerReference: z.string() })
        .parse(data);
      await payments.settlePayment(paymentId, providerReference);
      return NextResponse.json({ success: true });
    }

    if (action === "refund_payment") {
      const { paymentId, reason } = z
        .object({ paymentId: z.string(), reason: z.string() })
        .parse(data);
      const refundId = await payments.refundPayment(paymentId, reason);
      return NextResponse.json({ refundId });
    }

    // =======================
    // Billing Cycles (3)
    // =======================
    if (action === "get_due_billing_cycles") {
      const cycles_due = await cycles.getBillingCyclesDue(new Date());
      return NextResponse.json(cycles_due);
    }

    if (action === "generate_billing_invoice") {
      const { subscriptionId } = z
        .object({ subscriptionId: z.string() })
        .parse(data);
      const invoiceId = await cycles.generateBillingCycleInvoice(subscriptionId);
      return NextResponse.json({ invoiceId });
    }

    if (action === "cancel_subscription") {
      const { subscriptionId, reason } = z
        .object({ subscriptionId: z.string(), reason: z.string().optional() })
        .parse(data);
      await cycles.cancelSubscription(subscriptionId, reason);
      return NextResponse.json({ success: true });
    }

    // =======================
    // Expense Tracking (4)
    // =======================
    if (action === "record_expense") {
      const parsed = recordExpenseSchema.parse(data);
      const expenseId = await expenses.recordExpense({
        tenantId: data.tenantId,
        category: parsed.category,
        amountCents: parsed.amountCents,
        description: parsed.description,
        taxCategory: parsed.taxCategory,
        mileage: parsed.mileage,
        receiptUrl: parsed.receiptUrl,
      });
      return NextResponse.json({ expenseId });
    }

    if (action === "record_stripe_fee") {
      const { tenantId, invoiceId, feeCents, chargeId } = z
        .object({
          tenantId: z.string(),
          invoiceId: z.string(),
          feeCents: z.number().positive(),
          chargeId: z.string(),
        })
        .parse(data);
      const expenseId = await expenses.recordStripeFee(
        tenantId,
        invoiceId,
        feeCents,
        chargeId,
      );
      return NextResponse.json({ expenseId });
    }

    if (action === "approve_expense") {
      const { expenseId, approvedBy } = z
        .object({ expenseId: z.string(), approvedBy: z.string() })
        .parse(data);
      await expenses.approveExpense(expenseId, approvedBy);
      return NextResponse.json({ success: true });
    }

    // =======================
    // Financial Reporting (5)
    // =======================
    if (action === "generate_profit_loss") {
      const parsed = getProfitLossSchema.parse(data);
      const pnl = await reporting.generateProfitLossStatement(
        parsed.tenantId,
        new Date(parsed.startDate),
        new Date(parsed.endDate),
      );
      return NextResponse.json(pnl);
    }

    if (action === "analyze_cash_flow") {
      const parsed = getProfitLossSchema.parse(data);
      const cashFlow = await reporting.analyzeCashFlow(
        parsed.tenantId,
        new Date(parsed.startDate),
        new Date(parsed.endDate),
      );
      return NextResponse.json(cashFlow);
    }

    if (action === "generate_tax_summary") {
      const { tenantId, year } = z
        .object({ tenantId: z.string(), year: z.number() })
        .parse(data);
      const taxSummary = await reporting.generateTaxSummary(tenantId, year);
      return NextResponse.json(taxSummary);
    }

    if (action === "export_financial_data") {
      const { tenantId, year, format } = z
        .object({
          tenantId: z.string(),
          year: z.number(),
          format: z.enum(["JSON", "CSV"]),
        })
        .parse(data);
      const exported = await reporting.exportFinancialData(
        tenantId,
        year,
        format,
      );
      return NextResponse.json(exported);
    }

    // =======================
    // Revenue Recognition (6)
    // =======================
    if (action === "schedule_subscription_revenue") {
      const { invoiceId, totalCents, startDate, endDate } = z
        .object({
          invoiceId: z.string(),
          totalCents: z.number().positive(),
          startDate: z.string().datetime(),
          endDate: z.string().datetime(),
        })
        .parse(data);
      await revenue.scheduleSubscriptionRevenue(
        invoiceId,
        totalCents,
        new Date(startDate),
        new Date(endDate),
      );
      return NextResponse.json({ success: true });
    }

    if (action === "recognize_point_of_service") {
      const { invoiceId } = z.object({ invoiceId: z.string() }).parse(data);
      await revenue.recognizePointOfServiceRevenue(invoiceId);
      return NextResponse.json({ success: true });
    }

    if (action === "get_revenue_schedule") {
      const { invoiceId } = z.object({ invoiceId: z.string() }).parse(data);
      const schedule = await revenue.getRevenueSchedule(invoiceId);
      return NextResponse.json(schedule);
    }

    if (action === "generate_revenue_report") {
      const { tenantId, startDate, endDate } = z
        .object({
          tenantId: z.string(),
          startDate: z.string().datetime(),
          endDate: z.string().datetime(),
        })
        .parse(data);
      const report = await revenue.generateRevenueReport(
        tenantId,
        new Date(startDate),
        new Date(endDate),
      );
      return NextResponse.json(report);
    }

    return NextResponse.json(
      { error: "Actie niet herkend" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validatiefout", details: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("Billing orchestration error:", error);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (action === "health") {
      return NextResponse.json({
        status: "OK",
        subsystems: [
          "invoices",
          "payments",
          "cycles",
          "expenses",
          "reporting",
          "revenue",
        ],
      });
    }

    return NextResponse.json(
      { error: "Actie niet herkend" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Billing orchestration GET error:", error);
    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 },
    );
  }
}
