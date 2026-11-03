import { prisma } from "@/lib/prisma";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { getMileageLog } from "@/lib/worker/mileage";
import { SimplePdf } from "@/lib/pdf/simple";

// ---------------------------------------------------------------------------
// Jaaroverzicht voor de aangifte inkomstenbelasting (zzp/flexwerker): alles
// wat ZekerFlex van jouw jaar weet op één A4 voor jou of je boekhouder —
// omzet en btw per kwartaal (self-billing-facturen), gewerkte uren tegen het
// urencriterium, opdrachtgevers en je kilometers (lib/worker/mileage).
// Uitzendkrachten krijgen een jaaropgave via de loonadministratie, niet dit.
// Indicatief, geen belastingadvies.
// ---------------------------------------------------------------------------

export const URENCRITERIUM_HOURS = 1225;

export interface AnnualSummary {
  year: number;
  name: string;
  kvkNumber: string | null;
  vatNumber: string | null;
  quarters: { quarter: number; revenueCents: number; vatCents: number; invoices: number }[];
  revenueCents: number;
  vatCents: number;
  invoices: number;
  hours: number;
  shifts: number;
  clients: number;
  /** omzet excl. btw per opdrachtgever (uit de facturen), grootste eerst */
  byClient: { name: string; revenueCents: number; share: number }[];
  mileage: { trips: number; km: number; amountCents: number };
}

export type AnnualSummaryResult = { kind: "ok"; summary: AnnualSummary } | { kind: "payroll" } | { kind: "no-profile" };

export async function getAnnualSummary(userId: string, year: number): Promise<AnnualSummaryResult> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true, user: { select: { fullName: true } } },
  });
  if (!profile) return { kind: "no-profile" };
  const fiscal = await getFiscal(userId);
  if (invoiceModeFor(fiscal) === "payroll") return { kind: "payroll" };

  const from = amsterdamToUtc(year, 1, 1);
  const to = amsterdamToUtc(year + 1, 1, 1);
  const [invoices, timesheets, mileage] = await Promise.all([
    prisma.invoice.findMany({
      where: { issuerFreelancerId: profile.id, type: "SELF_BILL_FREELANCER", status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: from, lt: to } },
      select: { subtotalCents: true, vatCents: true, createdAt: true, recipientTenantId: true, recipientTenant: { select: { name: true } } },
    }),
    prisma.timesheet.findMany({
      where: { freelancerId: profile.id, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: from, lt: to } },
      select: { billableMinutes: true, branch: { select: { tenantId: true } } },
    }),
    getMileageLog(userId, year),
  ]);

  const quarters = [1, 2, 3, 4].map((quarter) => ({ quarter, revenueCents: 0, vatCents: 0, invoices: 0 }));
  for (const inv of invoices) {
    const q = quarters[Math.floor((amsterdamParts(inv.createdAt).month - 1) / 3)]!;
    q.revenueCents += inv.subtotalCents;
    q.vatCents += inv.vatCents;
    q.invoices++;
  }

  // Per opdrachtgever: handig voor de boekhouder en om bij de Wet DBA te laten zien dat je voor meerdere klanten werkt.
  const perClient = new Map<string, { name: string; revenueCents: number }>();
  for (const inv of invoices) {
    const id = inv.recipientTenantId ?? "onbekend";
    const c = perClient.get(id) ?? { name: inv.recipientTenant?.name ?? "Onbekende opdrachtgever", revenueCents: 0 };
    c.revenueCents += inv.subtotalCents;
    perClient.set(id, c);
  }
  const revenueCents = quarters.reduce((s, q) => s + q.revenueCents, 0);
  const byClient = [...perClient.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .map((c) => ({ ...c, share: revenueCents > 0 ? c.revenueCents / revenueCents : 0 }));

  return {
    kind: "ok",
    summary: {
      year,
      name: profile.user.fullName,
      kvkNumber: fiscal.kvkNumber ?? null,
      vatNumber: fiscal.vatNumber ?? null,
      quarters,
      revenueCents,
      vatCents: quarters.reduce((s, q) => s + q.vatCents, 0),
      invoices: invoices.length,
      hours: Math.round((timesheets.reduce((s, t) => s + t.billableMinutes, 0) / 60) * 10) / 10,
      shifts: timesheets.length,
      clients: new Set(timesheets.map((t) => t.branch.tenantId)).size,
      byClient,
      mileage: mileage?.totals ?? { trips: 0, km: 0, amountCents: 0 },
    },
  };
}

const euro = (c: number) => `EUR ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number, digits = 0) => n.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const QUARTER_LABEL = ["jan t/m mrt", "apr t/m jun", "jul t/m sep", "okt t/m dec"];

export function annualSummaryPdf(s: AnnualSummary, generatedAt = new Date()): Buffer {
  const p = amsterdamParts(generatedAt);
  const pdf = new SimplePdf();
  pdf.heading(`Jaaroverzicht ${s.year}`, 20);
  pdf.line(`${s.name} · voor je aangifte inkomstenbelasting`, 11, { color: [0.05, 0.36, 0.29] });
  if (s.kvkNumber || s.vatNumber) {
    pdf.line([s.kvkNumber ? `KVK ${s.kvkNumber}` : "", s.vatNumber ? `btw-id ${s.vatNumber}` : ""].filter(Boolean).join(" · "), 9.5);
  }
  pdf.gap(8);
  pdf.rule();

  pdf.section("Omzet en btw (facturen via ZekerFlex)");
  for (const q of s.quarters) {
    pdf.row(`Kwartaal ${q.quarter} (${QUARTER_LABEL[q.quarter - 1]})`, `${euro(q.revenueCents)} omzet · ${euro(q.vatCents)} btw`);
  }
  pdf.gap(4);
  pdf.row("Omzet excl. btw", euro(s.revenueCents), { bold: true });
  pdf.row("Btw op je facturen", euro(s.vatCents));
  pdf.row("Aantal facturen", num(s.invoices));
  pdf.gap(6);
  pdf.rule();

  pdf.section("Uren en opdrachtgevers");
  pdf.row("Gewerkte uren (goedgekeurd)", `${num(s.hours, 1)} uur`);
  pdf.row("Urencriterium", s.hours >= URENCRITERIUM_HOURS ? `gehaald (${num(URENCRITERIUM_HOURS)} uur)` : `nog ${num(URENCRITERIUM_HOURS - s.hours, 1)} uur te gaan via ZekerFlex`);
  pdf.row("Diensten", num(s.shifts));
  pdf.row("Verschillende opdrachtgevers", num(s.clients));
  pdf.gap(6);
  pdf.rule();

  if (s.byClient.length) {
    pdf.section("Omzet per opdrachtgever");
    const shown = s.byClient.slice(0, 10);
    for (const c of shown) pdf.row(c.name, `${euro(c.revenueCents)} · ${num(Math.round(c.share * 100))}%`);
    const rest = s.byClient.slice(10);
    if (rest.length) {
      const restCents = rest.reduce((sum, c) => sum + c.revenueCents, 0);
      pdf.row(`Overige ${rest.length} opdrachtgevers`, euro(restCents));
    }
    pdf.gap(6);
    pdf.rule();
  }

  pdf.section("Zakelijke kilometers");
  pdf.row("Zakelijke ritten", num(s.mileage.trips));
  pdf.row("Kilometers heen en terug", `${num(s.mileage.km, 1)} km`);
  pdf.row("Aftrek met privéauto (EUR 0,23/km)", euro(s.mileage.amountCents), { bold: true });
  pdf.paragraph("Inclusief ritten die je zelf toevoegde. De ritten zelf staan in de app onder Kilometer-administratie, ook als download.", 9);

  pdf.gap(16);
  pdf.paragraph(
    `Opgesteld door ZekerFlex op ${p.day}-${p.month}-${p.year}. Alleen werk via ZekerFlex staat hierin. Indicatief, geen belastingadvies: controleer je aangifte met je boekhouder of de Belastingdienst.`,
    8.5,
    { color: [0.4, 0.45, 0.42] },
  );
  return pdf.toBuffer();
}
