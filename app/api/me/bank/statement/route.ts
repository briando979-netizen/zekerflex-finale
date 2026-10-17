import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",");

// GET /api/me/bank/statement?month=2026-10 — the month's bookings as CSV (opens in Excel, NL format).
export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw AppError.validation("Kies een maand (JJJJ-MM)");
    const from = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    const to = new Date(Date.UTC(Number(m[1]), Number(m[2]), 1));
    const { account } = await accountForPrincipal(p);
    const entries = await prisma.bankEntry.findMany({
      where: { accountId: account.id, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
    });
    const lines = [
      "Datum;Omschrijving;Tegenpartij;Bedrag (EUR);Saldo na boeking (EUR);Soort;Kenmerk",
      ...entries.map((e) =>
        [
          e.createdAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" }),
          e.description,
          e.counterparty ?? "",
          euro(e.amountCents),
          euro(e.balanceAfterCents),
          e.kind,
          e.reference ?? "",
        ]
          .map(csvCell)
          .join(";"),
      ),
    ];
    return new Response(`﻿${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="zekerflex-bank-${account.number}-${month}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
