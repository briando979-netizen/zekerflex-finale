import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getTriage } from "@/lib/admin/triage";
import { ownerTodos } from "@/lib/admin/owner-todos";
import { proposals } from "@/lib/ai-teams";
import { wachtendeVraag } from "@/lib/ai-teams/medewerkers";
import { listConversations } from "@/lib/chat/webchat";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { kvDelete, kvDeleteStale, kvSetIfAbsent } from "@/lib/storage/kv";
import { amsterdamDayKey, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import { binnenMeldtijd, type GebeurtenisSoort } from "@/lib/ops/gebeurtenis";
import { leesGebeurtenissen, leesInstelling, stuurNaarEigenaar } from "@/lib/ops/melder";
import { dagrapportTekst, groepeerWacht, wachtOpJouTekst, type WachtGroep } from "@/lib/ops/dagrapport-tekst";

// Het dagrapport (elke avond) en de "wacht op jou"-lijst (elke ochtend, alleen als er iets dringends of iets van meer dan 24 uur
// wacht) naar de telefoon van de eigenaar. Geen tweede to-do-systeem: de lijst wordt verzameld uit wat er al is (de triage in
// Beheer, de blokkerende taken bij Te doen, de AI-voorstellen en de websitevragen zonder antwoord). Alleen aantallen en soorten.

const RAPPORT_VOORVOEGSEL = "ops:melder:rapport:";

/** Alles wat op een mens wacht, per soort. Een bron die stuk is, telt gewoon niet mee. */
export async function verzamelWacht(nu: Date = new Date()): Promise<WachtGroep[]> {
  const [triage, voorstellen, todos, chats, idControles] = await Promise.all([
    getTriage().catch(() => []),
    proposals().catch(() => []),
    ownerTodos().catch(() => []),
    Promise.all([listConversations("open", 300), listConversations("human", 300)]).then((x) => x.flat()).catch(() => []),
    // ID-controles die op een mens wachten (decisionStatus in_review, lib/onboarding/verify.ts): een werker heeft "meestal binnen een
    // werkdag" beloofd gekregen. Testaccounts tellen niet mee.
    prisma.identityVerification
      .findMany({
        where: { decisionStatus: { in: ["in_review", "In Review"] }, status: "PENDING", user: { kycStatus: "PENDING" } },
        select: { userId: true, updatedAt: true, user: { select: { email: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
      .catch(() => []),
  ]);
  const vragen = chats.map((c) => wachtendeVraag(c, nu)).filter((v): v is NonNullable<typeof v> => v !== null);
  const wachtOpMens = new Map<string, Date>();
  for (const v of idControles) if (!isReservedTestAddress(v.user.email) && !wachtOpMens.has(v.userId)) wachtOpMens.set(v.userId, v.updatedAt);
  return groepeerWacht(
    [
      // de triage telt elke werker met kycStatus PENDING als "KYC" (ook wie nog midden in de aanmelding zit, ernst laag): wat echt op een
      // mens wacht komt hieronder als eigen groep, met een direct adres
      ...triage.filter((t) => t.kind !== "KYC").map((t) => ({ soort: t.kind, urgent: t.severity === "high", at: t.at })),
      ...[...wachtOpMens.values()].map((at) => ({ soort: "ID-controle in behandeling", urgent: false, at: at.toISOString(), altijd: true, link: "/admin/gebruikers" })),
      ...voorstellen.filter((p) => p.status === "open").map((p) => ({ soort: "AI-voorstellen", urgent: false, at: p.at })),
      ...vragen.map((v) => ({ soort: "Websitevragen zonder antwoord", urgent: false, at: v.at })),
      ...todos.filter((t) => !t.done && t.eerst).map(() => ({ soort: "Taken die blokkeren (Te doen)", urgent: false, at: "" })),
    ],
    nu,
  );
}

export interface RapportUitslag {
  gemeld: boolean;
  reden: string | null;
}

/** Eén bericht per soort per dag: wie als eerste de sleutel van vandaag pakt, verstuurt; lukt het niet, dan geven we de sleutel terug. */
async function eenKeerPerDag(soort: "dag" | "wacht", nu: Date, doe: () => Promise<boolean>): Promise<RapportUitslag> {
  const instelling = await leesInstelling();
  if (!instelling.aan) return { gemeld: false, reden: "meldingen staan uit" };
  if (!binnenMeldtijd(nu)) return { gemeld: false, reden: "buiten de meldtijd" };
  await kvDeleteStale(RAPPORT_VOORVOEGSEL, new Date(nu.getTime() - 10 * 86_400_000)).catch(() => 0);
  const sleutel = `${RAPPORT_VOORVOEGSEL}${soort}:${amsterdamDayKey(nu)}`;
  if (!(await kvSetIfAbsent(sleutel, { at: nu.toISOString() }))) return { gemeld: false, reden: "vandaag al verstuurd" };
  try {
    if (await doe()) return { gemeld: true, reden: null };
  } catch {
    /* hieronder: sleutel teruggeven */
  }
  await kvDelete(sleutel).catch(() => undefined);
  return { gemeld: false, reden: "niets verstuurd of geen kanaal bereikte de eigenaar" };
}

export async function stuurDagrapport(nu: Date = new Date()): Promise<RapportUitslag> {
  return eenKeerPerDag("dag", nu, async () => {
    const instelling = await leesInstelling();
    const start = amsterdamStartOfDay(nu).getTime();
    const telling: Partial<Record<GebeurtenisSoort, number>> = {};
    // tot 5000 rijen: op een drukke dag staan er honderden mails in het logboek
    for (const g of await leesGebeurtenissen(5000)) {
      if (Date.parse(g.at) >= start && g.soort !== "bestelling") telling[g.soort] = (telling[g.soort] ?? 0) + 1;
    }
    const orders = await prisma.shopOrder
      .aggregate({ where: { status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] }, createdAt: { gte: new Date(start) } }, _count: { _all: true }, _sum: { totalCents: true } })
      .catch(() => null);
    const tekst = dagrapportTekst({
      datum: nu.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }),
      telling,
      bestellingen: { aantal: orders?._count._all ?? 0, totaalCents: orders?._sum.totalCents ?? 0 },
      wacht: await verzamelWacht(nu),
      basisUrl: env.APP_BASE_URL,
    });
    return (await stuurNaarEigenaar(tekst, "/admin/automatisch", `dagrapport-${amsterdamDayKey(nu)}`, instelling)) !== null;
  });
}

export async function stuurWachtOpJou(nu: Date = new Date()): Promise<RapportUitslag> {
  return eenKeerPerDag("wacht", nu, async () => {
    const tekst = wachtOpJouTekst(await verzamelWacht(nu), env.APP_BASE_URL);
    if (!tekst) return false;
    return (await stuurNaarEigenaar(tekst, "/admin/te-doen", `wacht-${amsterdamDayKey(nu)}`, await leesInstelling())) !== null;
  });
}
