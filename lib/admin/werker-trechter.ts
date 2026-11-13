import { prisma } from "@/lib/prisma";
import { kvGetMany } from "@/lib/storage/kv";
import { isTestAccount } from "@/lib/admin/onboarding-model";
import { isEigenTestAccount } from "@/lib/admin/eigen-test-kern";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { idSoortSleutel, type IdSoortTelling } from "@/lib/kyc/id-soort-meting";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { isQaPad, MEETCODE_VOORVOEGSELS, type CodeRij, type WerkerFeiten } from "@/lib/admin/werker-trechter-kern";

// ---------------------------------------------------------------------------
// De feiten achter Admin → Sales & groei → Werkerstrechter (13 nov 2026). Alleen ophalen; de telling staat in
// lib/admin/werker-trechter-kern.ts. Geen namen, e-mailadressen of id's naar buiten: alleen ja/nee per stap.
// Echte werker: een FREELANCER die geen testaccount is (isTestAccount: testadressen, eigen domein, beheer en sales,
// uitgeschakeld) en geen tijdelijk usr_zf_-account. De poortfeiten komen uit werkerPoortStand, dezelfde functie als de app.
// ---------------------------------------------------------------------------

const DAG = 86_400_000;
/** hooguit zoveel nieuwe werkers per keer (werkerPoortStand doet per werker een handvol query's) */
export const WERKER_LIMIET = 400;
const TEGELIJK = 5;
const CODE_LIMIET = 50_000;

export interface WerkerTrechterData {
  werkers: WerkerFeiten[];
  /** er waren meer nieuwe werkers dan WERKER_LIMIET: alleen de nieuwste geteld */
  afgekapt: boolean;
  codes: CodeRij[];
  /** de maandteller van de ID-soorten (lib/kyc/id-soort-meting.ts): deze en vorige maand */
  idSoort: { maand: string; telling: IdSoortTelling | null }[];
}

const CACHE_MS = 10 * 60_000;
const geheugen = globalThis as unknown as { __zfWerkerTrechter?: { at: number; data: WerkerTrechterData } };

/**
 * Met een cache van 10 minuten in het geheugen (globalThis: Next bundelt routes apart). werkerPoortStand doet per werker een
 * handvol query's; zo kost een keer heen en weer klikken niets. `vernieuw` haalt meteen opnieuw op.
 */
export async function werkerTrechterGecached(nu: Date = new Date(), vernieuw = false): Promise<WerkerTrechterData & { bijgewerkt: Date }> {
  const c = geheugen.__zfWerkerTrechter;
  if (!vernieuw && c && nu.getTime() - c.at >= 0 && nu.getTime() - c.at < CACHE_MS) return { ...c.data, bijgewerkt: new Date(c.at) };
  const data = await werkerTrechterData(nu);
  geheugen.__zfWerkerTrechter = { at: nu.getTime(), data };
  return { ...data, bijgewerkt: nu };
}

export async function werkerTrechterData(nu: Date = new Date()): Promise<WerkerTrechterData> {
  const sinds = new Date(nu.getTime() - 30 * DAG);
  const gebruikers = await prisma.user.findMany({
    where: { createdAt: { gte: sinds, lte: nu }, memberships: { some: { role: "FREELANCER" } } },
    orderBy: { createdAt: "desc" },
    take: WERKER_LIMIET + 1,
    select: { id: true, email: true, createdAt: true, disabledAt: true, memberships: { select: { role: true, tenantId: true } } },
  });
  // in het beheer gemarkeerd als eigen test (zelf of via een bedrijf): telt niet mee
  const eigenTest = await leesEigenTest();
  const eigen = (u: { id: string; memberships: { tenantId: string }[] }) => isEigenTestAccount(eigenTest, { userId: u.id, tenantIds: u.memberships.map((m) => m.tenantId) });
  const afgekapt = gebruikers.length > WERKER_LIMIET;
  const echt = gebruikers
    .slice(0, WERKER_LIMIET)
    .filter((u) => !u.id.startsWith("usr_zf_") && !isTestAccount({ email: u.email, rollen: u.memberships.map((m) => m.role), disabledAt: u.disabledAt, tenantNamen: [], eigenTest: eigen(u) }));
  const ids = echt.map((u) => u.id);

  // QA- en beheersessies (ook die van een inspectiesessie op een werkeraccount) tellen nergens mee
  const [qa, verificatie, codeRijen] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: sinds }, OR: [{ path: { startsWith: "/admin" } }, { path: { startsWith: "/studio" } }, { path: { startsWith: "/toegankelijkheid" } }] },
      distinct: ["sessionId"],
      select: { sessionId: true, path: true },
    }),
    prisma.analyticsEvent.findMany({
      where: { userId: { in: ids }, type: "PAGEVIEW", path: { startsWith: "/dashboard/verificatie" } },
      select: { userId: true, sessionId: true },
    }),
    prisma.analyticsEvent.findMany({
      where: {
        createdAt: { gte: sinds, lte: nu },
        type: { in: ["CLICK", "INTERACTION"] },
        OR: MEETCODE_VOORVOEGSELS.map((v) => ({ label: { startsWith: v } })),
      },
      select: { label: true, sessionId: true, userId: true, createdAt: true },
      take: CODE_LIMIET,
    }),
  ]);
  const qaSessies = new Set(qa.filter((r) => isQaPad(r.path)).map((r) => r.sessionId));
  const zagVerificatie = new Set(verificatie.filter((r) => !qaSessies.has(r.sessionId)).map((r) => r.userId));

  // een meetcode van een ingelogde gebruiker telt alleen als dat geen testaccount is (ook oudere accounts, niet alleen het cohort)
  const codeGebruikers = [...new Set(codeRijen.flatMap((r) => (r.userId && !ids.includes(r.userId) ? [r.userId] : [])))];
  const anderen = codeGebruikers.length
    ? await prisma.user.findMany({
        where: { id: { in: codeGebruikers } },
        select: { id: true, email: true, disabledAt: true, memberships: { select: { role: true, tenantId: true } } },
      })
    : [];
  const echteIds = new Set([
    ...ids,
    ...anderen
      .filter((u) => !u.id.startsWith("usr_zf_") && !isTestAccount({ email: u.email, rollen: u.memberships.map((m) => m.role), disabledAt: u.disabledAt, tenantNamen: [], eigenTest: eigen(u) }))
      .map((u) => u.id),
  ]);
  const codes: CodeRij[] = codeRijen
    .filter((r) => !qaSessies.has(r.sessionId) && (r.userId === null || echteIds.has(r.userId)))
    .map((r) => ({ label: r.label, sessionId: r.sessionId, at: r.createdAt }));

  // de poortfeiten, met dezelfde functie als de app; een storing bij één werker telt als "onbekend"
  const poorten = new Map<string, WerkerFeiten["poort"]>();
  for (let i = 0; i < ids.length; i += TEGELIJK) {
    const deel = ids.slice(i, i + TEGELIJK);
    const standen = await Promise.all(deel.map((id) => werkerPoortStand(id).catch(() => null)));
    deel.forEach((id, j) => poorten.set(id, standen[j] ?? null));
  }

  // de vorige kalendermaand (Amsterdam): de 15e van die maand, dus nooit een maand overgeslagen
  const [jaar, maand] = amsterdamDayKey(nu).split("-").map(Number);
  const vorigeMaand = new Date(Date.UTC(jaar ?? 1970, (maand ?? 1) - 2, 15, 12));
  const maanden = [...new Set([idSoortSleutel(nu), idSoortSleutel(vorigeMaand)])];
  const tellingen = await kvGetMany<IdSoortTelling>(maanden).catch(() => new Map<string, IdSoortTelling>());

  return {
    werkers: echt.map((u) => ({ aangemeld: u.createdAt, poort: poorten.get(u.id) ?? null, zagVerificatie: zagVerificatie.has(u.id) })),
    afgekapt,
    codes,
    idSoort: maanden.map((k) => ({ maand: k.slice("meting:id-soort:".length), telling: tellingen.get(k) ?? null })),
  };
}
