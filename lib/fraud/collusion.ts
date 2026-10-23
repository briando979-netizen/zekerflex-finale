import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Collusie-/witwasdetectie.
//
// Zoekt opdrachtgever↔werknemer-paren die samen geld kunnen rondpompen via de
// reverse-billing + snelle uitbetaling (nepdiensten aanmaken, direct
// goedkeuren, laten uitbetalen). Puur op bestaande, goedgekeurde uren — geen
// nieuwe datacollectie. Scoort per paar op signalen die elk op zich onschuldig
// zijn (een vast team is normaal), maar samen verdacht worden:
//   - concentratie: (bijna) al het werk van de werknemer komt van deze klant
//     EN (bijna) al het werk van de klant gaat naar deze werknemer;
//   - nieuwe accounts die meteen hoog-volume draaien;
//   - uren zonder GPS-check-in;
//   - vrijwel direct goedgekeurd (minder dan 5 min na indienen);
//   - bovengemiddeld uurtarief.
// Hoog scorende paren worden gemeld (autopilot-actie) en staan in Admin → Fraude.
// Het is een signaal voor een mens, geen automatisch oordeel.
// ---------------------------------------------------------------------------

export interface CollusionSignal {
  code: string;
  label: string;
  weight: number;
}

export interface CollusionPair {
  tenantId: string;
  bedrijf: string;
  freelancerId: string;
  werknemer: string;
  shifts: number;
  totaalCents: number;
  werknemerConcentratie: number; // 0..1 — aandeel van het inkomen van de werknemer bij deze klant
  klantConcentratie: number; // 0..1 — aandeel van het werk van de klant naar deze werknemer
  zonderCheckin: number;
  instantGoedgekeurd: number;
  nieuwePartij: boolean;
  score: number;
  signalen: CollusionSignal[];
}

interface Agg {
  tenantId: string;
  bedrijf: string;
  freelancerId: string;
  werknemer: string;
  shifts: number;
  gross: number;
  noCheckin: number;
  instant: number;
  tenantCreated: number;
  workerCreated: number;
}

const DAY = 86_400_000;
const INSTANT_MS = 5 * 60_000;

export interface CollusionOptions {
  sinceDays?: number;
  minScore?: number;
  limit?: number;
}

export async function analyseCollusion(opts: CollusionOptions = {}): Promise<CollusionPair[]> {
  const sinceDays = opts.sinceDays ?? 90;
  const minScore = opts.minScore ?? 50;
  const since = new Date(Date.now() - sinceDays * DAY);

  const rows = await prisma.timesheet.findMany({
    where: { status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: since } },
    select: {
      billableMinutes: true,
      submittedAt: true,
      approvedAt: true,
      scheduledStart: true,
      freelancerId: true,
      freelancer: { select: { user: { select: { fullName: true, createdAt: true } } } },
      assignment: { select: { shift: { select: { hourlyRateCents: true } } } },
      branch: { select: { tenantId: true, tenant: { select: { name: true, createdAt: true } } } },
      gpsEvents: { select: { type: true } },
    },
    take: 20_000,
  });

  const pairs = new Map<string, Agg>();
  const workerTotal = new Map<string, number>(); // freelancerId -> total gross
  const tenantTotal = new Map<string, number>(); // tenantId -> total gross

  for (const t of rows) {
    const rate = t.assignment?.shift?.hourlyRateCents ?? 0;
    const gross = Math.round((t.billableMinutes / 60) * rate);
    const tenantId = t.branch.tenantId;
    const key = `${tenantId}|${t.freelancerId}`;
    workerTotal.set(t.freelancerId, (workerTotal.get(t.freelancerId) ?? 0) + gross);
    tenantTotal.set(tenantId, (tenantTotal.get(tenantId) ?? 0) + gross);
    let a = pairs.get(key);
    if (!a) {
      a = {
        tenantId,
        bedrijf: t.branch.tenant.name,
        freelancerId: t.freelancerId,
        werknemer: t.freelancer.user.fullName,
        shifts: 0,
        gross: 0,
        noCheckin: 0,
        instant: 0,
        tenantCreated: new Date(t.branch.tenant.createdAt).getTime(),
        workerCreated: new Date(t.freelancer.user.createdAt).getTime(),
      };
      pairs.set(key, a);
    }
    a.shifts += 1;
    a.gross += gross;
    if (!t.gpsEvents.some((e) => e.type === "CHECK_IN")) a.noCheckin += 1;
    if (t.submittedAt && t.approvedAt && t.approvedAt.getTime() - t.submittedAt.getTime() < INSTANT_MS) a.instant += 1;
  }

  const now = Date.now();
  const out: CollusionPair[] = [];
  for (const a of pairs.values()) {
    if (a.shifts < 3 || a.gross < 50_000) continue; // need some volume to bother
    const wConc = a.gross / (workerTotal.get(a.freelancerId) || a.gross);
    const tConc = a.gross / (tenantTotal.get(a.tenantId) || a.gross);
    const nieuwePartij = now - a.tenantCreated < 30 * DAY && now - a.workerCreated < 30 * DAY;

    const signalen: CollusionSignal[] = [];
    if (wConc >= 0.9 && tConc >= 0.9) signalen.push({ code: "wederzijdse-exclusiviteit", label: "Klant en werknemer werken vrijwel uitsluitend met elkaar", weight: 35 });
    else if (wConc >= 0.9) signalen.push({ code: "werknemer-exclusief", label: "Werknemer haalt bijna al zijn inkomen bij deze klant", weight: 15 });
    else if (tConc >= 0.9) signalen.push({ code: "klant-exclusief", label: "Klant zet bijna al het werk bij deze werknemer uit", weight: 15 });
    if (nieuwePartij) signalen.push({ code: "nieuwe-partijen", label: "Beide accounts zijn nieuw (< 30 dagen) en draaien meteen volume", weight: 20 });
    const noCheckinShare = a.noCheckin / a.shifts;
    if (noCheckinShare >= 0.8) signalen.push({ code: "geen-checkin", label: `${a.noCheckin}/${a.shifts} uren zonder GPS-check-in`, weight: 20 });
    const instantShare = a.instant / a.shifts;
    if (instantShare >= 0.8) signalen.push({ code: "direct-goedgekeurd", label: `${a.instant}/${a.shifts} uren binnen 5 min goedgekeurd`, weight: 15 });
    if (a.gross >= 500_000) signalen.push({ code: "hoog-bedrag", label: `Hoog totaalbedrag (€${(a.gross / 100).toFixed(0)})`, weight: 10 });

    const score = Math.min(100, signalen.reduce((s, x) => s + x.weight, 0));
    if (score < minScore || signalen.length < 2) continue;
    out.push({
      tenantId: a.tenantId,
      bedrijf: a.bedrijf,
      freelancerId: a.freelancerId,
      werknemer: a.werknemer,
      shifts: a.shifts,
      totaalCents: a.gross,
      werknemerConcentratie: Math.round(wConc * 100) / 100,
      klantConcentratie: Math.round(tConc * 100) / 100,
      zonderCheckin: a.noCheckin,
      instantGoedgekeurd: a.instant,
      nieuwePartij,
      score,
      signalen,
    });
  }

  return out.sort((x, y) => y.score - x.score).slice(0, opts.limit ?? 50);
}
