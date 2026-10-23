import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { createReplacementRequest, getOpenRequestForShift } from "@/lib/replacements/store";
import { sendUserPush } from "@/lib/notifications/push";
import { alertOwnerLater } from "@/lib/ops/alert";
import { getFiscal } from "@/lib/fiscal/store";

// ---------------------------------------------------------------------------
// Ziekmelding voor de uitzendtak.
//
// Een uitzendkracht meldt zich ziek → we leggen de ziekmelding vast, zoeken
// automatisch vervanging voor zijn geplande diensten in de ziekteperiode
// (hergebruik van de bestaande vervangingsflow), waarschuwen de betrokken
// opdrachtgevers, en zetten een melding klaar voor de ziektewet-/UWV-/SFBO-
// administratie. De daadwerkelijke UWV/SFBO-levering is pluggable (ZW_REPORT_
// ENDPOINT), net als de StiPP-aangifte — zonder kanaal blijft de melding als
// taak klaarstaan voor de eigenaar. Zzp'ers/flexwerkers melden niet ziek via
// deze flow (geen loondoorbetaling); zij zoeken gewoon vervanging.
// ---------------------------------------------------------------------------

export interface ZiekmeldingShift {
  shiftId: string;
  title: string;
  startsAt: string;
  replacementId: string | null;
}

export interface Ziekmelding {
  id: string;
  userId: string;
  naam: string;
  from: string; // YYYY-MM-DD
  to: string | null;
  note: string;
  at: string;
  betterAt: string | null;
  shifts: ZiekmeldingShift[];
  uwvReported: boolean;
  uwvDetail: string | null;
}

const key = (id: string) => `ziekmelding:${id}`;
const INDEX = "ziekmelding:index";
const DAY = 86_400_000;

async function index(): Promise<string[]> {
  return (await kvGet<string[]>(INDEX).catch(() => null)) ?? [];
}

export async function reportSick(input: { userId: string; from: string; to?: string | null | undefined; note?: string | undefined }): Promise<Ziekmelding> {
  const [user, fiscal] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { fullName: true, freelancerProfile: { select: { id: true } } } }),
    getFiscal(input.userId).catch(() => null),
  ]);
  const naam = user?.fullName ?? "Onbekend";
  const isUitzend = fiscal?.workerKind === "uitzendkracht";

  const fromDate = new Date(`${input.from}T00:00:00Z`);
  const toDate = input.to ? new Date(`${input.to}T23:59:59Z`) : new Date(fromDate.getTime() + 14 * DAY);
  const now = new Date();

  // the worker's upcoming assigned shifts that fall in the sickness window
  const freelancerId = user?.freelancerProfile?.id;
  const assignments = freelancerId
    ? await prisma.shiftAssignment.findMany({
        where: {
          freelancerId,
          cancelledAt: null,
          shift: { startsAt: { gte: new Date(Math.max(now.getTime(), fromDate.getTime())), lte: toDate } },
        },
        select: { id: true, shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true, tenantId: true } } } } },
        take: 50,
      })
    : [];

  const shifts: ZiekmeldingShift[] = [];
  const notifiedTenants = new Set<string>();
  for (const a of assignments) {
    // auto-trigger replacement (reuse the existing "zoek vervanging" flow), once per shift
    let replacementId: string | null = null;
    const open = await getOpenRequestForShift(a.shift.id).catch(() => null);
    if (open) replacementId = open.id;
    else {
      const req = await createReplacementRequest({
        userId: input.userId,
        freelancerName: naam,
        assignmentId: a.id,
        shiftId: a.shift.id,
        shiftTitle: a.shift.title,
        branch: a.shift.branch.name,
        startsAt: a.shift.startsAt.toISOString(),
        note: "Automatisch door ziekmelding — vervanging gezocht.",
      }).catch((err) => {
        logger.warn("ziekmelding: replacement create failed", { error: (err as Error).message });
        return null;
      });
      replacementId = req?.id ?? null;
    }
    shifts.push({ shiftId: a.shift.id, title: a.shift.title, startsAt: a.shift.startsAt.toISOString(), replacementId });
    notifiedTenants.add(a.shift.branch.tenantId);
  }

  // notify the affected employers (managers)
  for (const tenantId of notifiedTenants) {
    const managers = await prisma.membership
      .findMany({ where: { tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } }, select: { userId: true } })
      .catch(() => []);
    await sendUserPush([...new Set(managers.map((m) => m.userId))], {
      title: "⚕️ Ziekmelding — vervanging gezocht",
      body: `${naam} heeft zich ziek gemeld. Voor de betrokken dienst(en) zoekt ZekerFlex automatisch vervanging.`,
      data: { type: "SHIFT", url: "/werkgever/diensten", tag: `ziek-${input.userId}` },
      ttlSeconds: 2 * 86_400,
    }).catch(() => undefined);
  }

  const rec: Ziekmelding = {
    id: `${input.userId}-${Date.now().toString(36)}`,
    userId: input.userId,
    naam,
    from: input.from,
    to: input.to ?? null,
    note: (input.note ?? "").slice(0, 500),
    at: new Date().toISOString(),
    betterAt: null,
    shifts,
    uwvReported: false,
    uwvDetail: null,
  };

  // queue the ZW/UWV/SFBO report (only for uitzendkrachten — loondoorbetaling/ZW)
  if (isUitzend) {
    const delivered = await reportToUwv(rec).catch(() => ({ ok: false, detail: "levering mislukt" }));
    rec.uwvReported = delivered.ok;
    rec.uwvDetail = delivered.detail;
    if (!delivered.ok) {
      alertOwnerLater({
        key: `ziekmelding-uwv:${rec.id}`,
        title: `Ziekmelding ${naam} — ZW/UWV-melding klaar`,
        detail: `${naam} is ziek gemeld (${input.from}${input.to ? ` t/m ${input.to}` : ""}). ${delivered.detail}. Verwerk in de ziektewet-administratie.`,
        severity: "warning",
        url: "/admin/uitzendbureau",
      });
    }
  }

  await kvSet(key(rec.id), rec);
  await kvSet(INDEX, [rec.id, ...(await index())].slice(0, 2000));
  return rec;
}

/** Pluggable ZW/UWV/SFBO delivery — real channel via ZW_REPORT_ENDPOINT, else "klaar als taak". */
async function reportToUwv(rec: Ziekmelding): Promise<{ ok: boolean; detail: string }> {
  if (!env.ZW_REPORT_ENDPOINT || !env.ZW_REPORT_TOKEN) {
    return { ok: false, detail: "Geen UWV/SFBO-kanaal ingesteld — melding staat klaar als taak" };
  }
  try {
    const res = await fetch(env.ZW_REPORT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.ZW_REPORT_TOKEN}` },
      body: JSON.stringify({ type: "ziekmelding", werknemer: rec.naam, userId: rec.userId, van: rec.from, tot: rec.to }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, detail: `Gemeld aan ${new URL(env.ZW_REPORT_ENDPOINT).host}` };
  } catch (err) {
    return { ok: false, detail: `Levering mislukt: ${(err as Error).message}` };
  }
}

export async function reportBetter(id: string): Promise<Ziekmelding | null> {
  const rec = await kvGet<Ziekmelding>(key(id)).catch(() => null);
  if (!rec) return null;
  rec.betterAt = new Date().toISOString();
  await kvSet(key(id), rec);
  return rec;
}

export async function listZiekmeldingen(limit = 100): Promise<Ziekmelding[]> {
  const ids = (await index()).slice(0, limit);
  const out = await Promise.all(ids.map((id) => kvGet<Ziekmelding>(key(id)).catch(() => null)));
  return out.filter((z): z is Ziekmelding => Boolean(z));
}

export async function myZiekmeldingen(userId: string): Promise<Ziekmelding[]> {
  return (await listZiekmeldingen(500)).filter((z) => z.userId === userId);
}
