import { InvoiceStatus, VatTreatment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { alertOwnerLater } from "@/lib/ops/alert";

// ---------------------------------------------------------------------------
// ICP-opgave (Intracommunautaire prestaties).
//
// De btw-verlegging zelf gebeurt al bij facturatie (lib/billing/self-billing.ts
// resolveVat → REVERSE_CHARGE voor grensoverschrijdende EU-B2B met geldig
// btw-id). Deze module maakt de periodieke ICP-opgave die de Belastingdienst
// daarvoor vraagt: per afnemer-btw-id het totaal aan verlegde prestaties in het
// tijdvak (meestal per kwartaal). Puur een aggregatie van bestaande facturen —
// geen nieuwe btw-berekening. Levering is pluggable (ICP_ENDPOINT, SBR/Digipoort);
// zonder kanaal blijft de opgave als CSV-export + taak voor de eigenaar.
// ---------------------------------------------------------------------------

export interface IcpLine {
  vatId: string | null;
  land: string;
  afnemer: string;
  nettoCents: number;
  facturen: number;
  compleet: boolean;
}

export interface IcpOpgave {
  period: string; // "2026-Q3"
  label: string;
  status: "concept" | "geleverd" | "mislukt";
  gegenereerdOp: string;
  geleverdOp: string | null;
  leveringDetail: string | null;
  lines: IcpLine[];
  totals: { afnemers: number; incompleet: number; nettoCents: number; facturen: number };
}

const key = (p: string) => `icp-opgave:${p}`;
const INDEX = "icp-opgave:index";

/** [start, end) UTC for a "YYYY-Qn" period. */
function quarterRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3;
  return { start: new Date(Date.UTC(year, startMonth, 1)), end: new Date(Date.UTC(year, startMonth + 3, 1)) };
}

export function quarterLabel(period: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  return m ? `Q${m[2]} ${m[1]}` : period;
}

export function previousQuarter(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3); // 0..3 of current quarter
  const prev = q === 0 ? { y: now.getUTCFullYear() - 1, q: 4 } : { y: now.getUTCFullYear(), q };
  return `${prev.y}-Q${prev.q}`;
}

export async function buildIcpOpgave(period: string): Promise<IcpOpgave> {
  const range = quarterRange(period);
  if (!range) throw new Error("Ongeldig tijdvak (verwacht YYYY-Qn)");

  const invoices = await prisma.invoice.findMany({
    where: {
      vatTreatment: VatTreatment.REVERSE_CHARGE,
      status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] },
      issuedAt: { gte: range.start, lt: range.end },
    },
    select: { subtotalCents: true, recipientTenant: { select: { name: true, country: true, vatNumber: true } } },
    take: 50_000,
  });

  const byVat = new Map<string, { vatId: string | null; land: string; afnemer: string; netto: number; facturen: number }>();
  for (const inv of invoices) {
    const t = inv.recipientTenant;
    const vatId = t?.vatNumber ?? null;
    const mapKey = vatId ?? `?${t?.name ?? "onbekend"}`;
    const cur = byVat.get(mapKey) ?? { vatId, land: t?.country ?? "??", afnemer: t?.name ?? "Onbekend", netto: 0, facturen: 0 };
    cur.netto += inv.subtotalCents;
    cur.facturen += 1;
    byVat.set(mapKey, cur);
  }

  const lines: IcpLine[] = [...byVat.values()]
    .map((v) => ({ vatId: v.vatId, land: v.land, afnemer: v.afnemer, nettoCents: v.netto, facturen: v.facturen, compleet: Boolean(v.vatId) }))
    .sort((a, b) => b.nettoCents - a.nettoCents);

  const totals = lines.reduce(
    (t, l) => ({ afnemers: t.afnemers + 1, incompleet: t.incompleet + (l.compleet ? 0 : 1), nettoCents: t.nettoCents + l.nettoCents, facturen: t.facturen + l.facturen }),
    { afnemers: 0, incompleet: 0, nettoCents: 0, facturen: 0 },
  );

  const prev = await getIcpOpgave(period);
  return {
    period,
    label: quarterLabel(period),
    status: prev?.status === "geleverd" ? "geleverd" : "concept",
    gegenereerdOp: new Date().toISOString(),
    geleverdOp: prev?.geleverdOp ?? null,
    leveringDetail: prev?.leveringDetail ?? null,
    lines,
    totals,
  };
}

export async function saveIcpOpgave(o: IcpOpgave): Promise<void> {
  await kvSet(key(o.period), o);
  const idx = new Set((await kvGet<string[]>(INDEX).catch(() => null)) ?? []);
  idx.add(o.period);
  await kvSet(INDEX, [...idx].sort().reverse());
}

export async function getIcpOpgave(period: string): Promise<IcpOpgave | null> {
  return kvGet<IcpOpgave>(key(period)).catch(() => null);
}

export async function listIcpPeriods(): Promise<string[]> {
  return (await kvGet<string[]>(INDEX).catch(() => null)) ?? [];
}

export function icpConfigured(): boolean {
  return Boolean(env.ICP_ENDPOINT && env.ICP_TOKEN);
}

export async function deliverIcpOpgave(period: string): Promise<{ ok: boolean; detail: string }> {
  const o = await buildIcpOpgave(period);
  if (o.lines.length === 0) {
    await saveIcpOpgave({ ...o, status: "concept", leveringDetail: "Geen intracommunautaire prestaties in dit tijdvak." });
    return { ok: false, detail: "Geen prestaties om te leveren." };
  }
  if (o.totals.incompleet > 0) {
    await saveIcpOpgave({ ...o, status: "mislukt", leveringDetail: `${o.totals.incompleet} afnemer(s) zonder btw-id — kan niet geleverd worden.` });
    return { ok: false, detail: `${o.totals.incompleet} afnemer(s) missen een btw-id.` };
  }
  if (!icpConfigured()) {
    await saveIcpOpgave({ ...o, status: "concept", leveringDetail: "Geen leverkanaal (ICP_ENDPOINT). Download de CSV en dien in via Mijn Belastingdienst Zakelijk." });
    return { ok: false, detail: "Geen leverkanaal; opgave staat klaar als export." };
  }
  try {
    const res = await fetch(env.ICP_ENDPOINT!, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.ICP_TOKEN}` },
      body: JSON.stringify({ tijdvak: o.period, regels: o.lines.map((l) => ({ btwId: l.vatId, land: l.land, bedragCents: l.nettoCents })) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await saveIcpOpgave({ ...o, status: "geleverd", geleverdOp: new Date().toISOString(), leveringDetail: `Geleverd aan ${new URL(env.ICP_ENDPOINT!).host}.` });
    return { ok: true, detail: "ICP-opgave geleverd." };
  } catch (err) {
    const detail = (err as Error).message;
    await saveIcpOpgave({ ...o, status: "mislukt", leveringDetail: `Levering mislukt: ${detail}` });
    alertOwnerLater({ key: `icp:${period}`, title: `ICP-opgave ${o.label} mislukt`, detail: `Levering mislukt: ${detail}.`, severity: "warning", url: "/admin/icp" });
    logger.error("icp delivery failed", { period, error: detail });
    return { ok: false, detail };
  }
}
