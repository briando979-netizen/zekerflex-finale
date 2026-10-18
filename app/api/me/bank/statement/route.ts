import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { accountForPrincipal, formatAccountNumber } from "@/lib/bank/accounts";
import { SimplePdf } from "@/lib/pdf/simple";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",");

// GET /api/me/bank/statement?month=2026-10[&format=pdf] — the month's bookings as CSV (Excel, NL format) or a PDF afschrift.
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
    if (new URL(request.url).searchParams.get("format") === "pdf") {
      const opening = entries[0] ? entries[0].balanceAfterCents - entries[0].amountCents : (
        await prisma.bankEntry.findFirst({ where: { accountId: account.id, createdAt: { lt: from } }, orderBy: { createdAt: "desc" }, select: { balanceAfterCents: true } })
      )?.balanceAfterCents ?? 0;
      const closing = entries.at(-1)?.balanceAfterCents ?? opening;
      const money = (c: number) => `${c < 0 ? "-" : ""}€ ${euro(Math.abs(c))}`;
      const label = from.toLocaleDateString("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
      const pdf = new SimplePdf();
      pdf.heading("ZekerFlex Bank — afschrift", 18);
      pdf.line(label, 11, { color: [0.05, 0.36, 0.29] });
      pdf.gap(8);
      pdf.rule();
      pdf.row("Rekeninghouder", account.holderName, { bold: true });
      pdf.row("Rekeningnummer", formatAccountNumber(account.number));
      pdf.row("Beginsaldo", money(opening));
      pdf.row("Bijgeschreven", money(entries.filter((e) => e.amountCents > 0).reduce((s, e) => s + e.amountCents, 0)));
      pdf.row("Afgeschreven", money(entries.filter((e) => e.amountCents < 0).reduce((s, e) => s + e.amountCents, 0)));
      pdf.row("Eindsaldo", money(closing), { bold: true, size: 12 });
      pdf.gap(6);
      pdf.rule();
      if (entries.length === 0) pdf.line("Geen boekingen in deze maand.", 10);
      for (const e of entries) {
        const day = e.createdAt.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Amsterdam" });
        pdf.row(`${day}  ${e.description}`.slice(0, 70), `${e.amountCents > 0 ? "+" : ""}${money(e.amountCents)}`);
      }
      pdf.gap(14);
      pdf.line("Het tegoed op ZekerFlex Bank-rekeningen staat op de rekening van ZekerFlex B.V. bij Stripe Payments Europe.", 8.5, { color: [0.4, 0.45, 0.42] });
      return new Response(new Uint8Array(pdf.toBuffer()), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="zekerflex-bank-${account.number}-${month}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
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
