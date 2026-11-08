import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getBalance, getPaymentHistory, getPaymentStats, getPendingTransactions } from "@/lib/realtime/payments";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const view = req.nextUrl.searchParams.get("view") || "balance";
    const currency = req.nextUrl.searchParams.get("currency") || "EUR";
    const days = Number(req.nextUrl.searchParams.get("days") || 30);

    let data;

    if (view === "balance") {
      data = getBalance(principal.userId, currency);
    } else if (view === "history") {
      data = getPaymentHistory(principal.userId, 50);
    } else if (view === "stats") {
      data = getPaymentStats(principal.userId, days);
    } else if (view === "pending") {
      data = getPendingTransactions(principal.userId);
    }

    return NextResponse.json({
      view,
      data,
    });
  } catch (err) {
    console.error("Payments fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch payment data" }, { status: 500 });
  }
}
