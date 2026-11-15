import { prisma } from "@/lib/prisma";
import { kvGet } from "@/lib/storage/kv";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { listConversations, type WebchatConversation } from "@/lib/chat/webchat";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import type { Proposal } from "@/lib/ai-teams";
import type { TeamTools } from "@/lib/ai-teams/extra-teams";

// ---------------------------------------------------------------------------
// Twee AI-medewerkers die een gat vullen (15 nov 2026, eigenaar: "maak agenten aan voor ZekerFlex"). Ze bouwen op de
// AI-teams (lib/ai-teams): ze werken van echte gegevens en zetten alles wat naar buiten gaat klaar als voorstel; er gaat
// pas iets uit als een mens in Admin → AI-teams op Uitvoeren klikt (lib/ai-teams/execute.ts).
//  - Welkomstcoach (team Onboarding): een bedrijf meldde zich 2 tot 30 dagen geleden aan en plaatste nog geen enkele klus.
//    Voorstel: een persoonlijke mail met hulp bij de eerste klus. Per bedrijf één keer (ook na afwijzen niet opnieuw).
//  - Servicedesk (team Klantenservice): een vraag in de websitechat wacht langer dan 4 uur. Voorstel: een conceptantwoord
//    van het taalmodel, dat pas na goedkeuring in de chat komt. Hooguit MAX_CONCEPTEN per ronde.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const WELKOM_NA_DAGEN = 2;
export const WELKOM_TOT_DAGEN = 30;
export const WACHT_UREN = 4;
export const MAX_CONCEPTEN = 5;

async function alleVoorstellen(): Promise<Proposal[]> {
  return (await kvGet<Proposal[]>("ai-teams-proposals").catch(() => null)) ?? [];
}

/** Komt een bedrijf in aanmerking voor de welkomstmail? Puur, voor de test. */
export function welkomKandidaat(
  t: { createdAt: Date; klussen: number; beheerders: string[] },
  nu: Date,
): boolean {
  const leeftijd = nu.getTime() - t.createdAt.getTime();
  return (
    leeftijd >= WELKOM_NA_DAGEN * DAY &&
    leeftijd <= WELKOM_TOT_DAGEN * DAY &&
    t.klussen === 0 &&
    t.beheerders.some((e) => !isReservedTestAddress(e))
  );
}

export async function welkomstcoach(now: Date, t: TeamTools): Promise<number> {
  const tenants = await prisma.tenant.findMany({
    where: {
      type: { not: "PLATFORM" },
      createdAt: { gte: new Date(now.getTime() - WELKOM_TOT_DAGEN * DAY), lte: new Date(now.getTime() - WELKOM_NA_DAGEN * DAY) },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      branches: { select: { _count: { select: { shifts: true } } } },
      memberships: { where: { role: "HQ_ADMIN", user: { disabledAt: null, emailVerifiedAt: { not: null } } }, select: { user: { select: { email: true } } } },
    },
    take: 300,
  });
  // per bedrijf één keer: ook een afgewezen of uitgevoerd voorstel telt
  const gehad = new Set(
    (await alleVoorstellen())
      .map((p) => (p.action?.type === "welkom-opvolging" ? p.action.tenantId : null))
      .filter((x): x is string => Boolean(x)),
  );
  let n = 0;
  for (const tn of tenants) {
    if (gehad.has(tn.id)) continue;
    const klussen = tn.branches.reduce((s, b) => s + b._count.shifts, 0);
    if (!welkomKandidaat({ createdAt: tn.createdAt, klussen, beheerders: tn.memberships.map((m) => m.user.email) }, now)) continue;
    const dagen = Math.floor((now.getTime() - tn.createdAt.getTime()) / DAY);
    await t.propose({
      team: "onboarding",
      title: `${tn.name}: ${dagen} dagen aangemeld, nog geen klus`,
      detail:
        "De Welkomstcoach stelt een korte, persoonlijke mail voor aan de beheerder(s): hulp bij de eerste klus, met de link om er een te plaatsen, en de vraag om te antwoorden als ze liever even bellen. " +
        "Er gaat pas iets uit als je op Uitvoeren klikt; heeft het bedrijf intussen een klus, dan wordt er niets verstuurd.",
      action: { type: "welkom-opvolging", tenantId: tn.id },
    });
    n += 1;
    if (n >= 10) break;
  }
  await t.log("onboarding", `Welkomstcoach: ${n} nieuw(e) bedrijf/bedrijven zonder eerste klus klaargezet voor een persoonlijke mail.`);
  return n;
}

/** De laatste vraag van de bezoeker en hoe lang die al wacht; null als er niets wacht. Puur, voor de test. */
export function wachtendeVraag(c: Pick<WebchatConversation, "messages" | "status">, nu: Date): { vraag: string; uren: number; at: string } | null {
  if (c.status === "closed") return null;
  const laatste = c.messages.at(-1);
  if (!laatste || laatste.role !== "user") return null;
  const uren = (nu.getTime() - new Date(laatste.at).getTime()) / HOUR;
  if (uren <= WACHT_UREN) return null;
  return { vraag: laatste.content, uren: Math.round(uren), at: laatste.at };
}

/** Het antwoord van het model netjes maken: geen aanhalingstekens of "Antwoord:" ervoor, niet te lang. Puur. */
export function schoonAntwoord(tekst: unknown): string {
  const t = typeof tekst === "string" ? tekst : "";
  return t
    .replace(/^\s*(concept(antwoord)?|antwoord)\s*:\s*/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim()
    .slice(0, 1200);
}

const SERVICEDESK =
  "Je bent de klantenservice van ZekerFlex, een Nederlands platform voor flexwerk, uitzendwerk en zzp. Schrijf een kort, vriendelijk antwoord " +
  "op de laatste vraag van de bezoeker, in de taal van de bezoeker. Excuseer je kort dat het antwoord even duurde. Beloof niets wat je niet zeker " +
  "weet en noem geen prijzen, termijnen of functies die niet in het gesprek staan; weet je het niet, zeg dan dat een collega het uitzoekt en " +
  "verwijs naar info@zekerflex.com. Hooguit 90 woorden, geen ondertekening met een naam.";

export async function servicedeskConcepten(now: Date, t: TeamTools): Promise<number> {
  if (llmConfigProblem()) return 0;
  const gesprekken = [...(await listConversations("open", 300)), ...(await listConversations("human", 300))];
  const voorstellen = await alleVoorstellen();
  let n = 0;
  for (const c of gesprekken) {
    if (n >= MAX_CONCEPTEN) break;
    const w = wachtendeVraag(c, now);
    if (!w) continue;
    // al een concept voor deze vraag (open, uitgevoerd of afgewezen): niet opnieuw
    const al = voorstellen.some((p) => p.action?.type === "webchat-antwoord" && p.action.conversationId === c.id && p.at >= w.at);
    if (al) continue;
    try {
      const res = await chat({
        purpose: "ai-team-klantenservice",
        temperature: 0.3,
        maxTokens: 300,
        retry: false,
        timeoutMs: 45_000,
        messages: [
          { role: "system", content: SERVICEDESK },
          ...c.messages.slice(-12).map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content.slice(0, 1500) })),
        ],
      });
      const tekst = schoonAntwoord(res.text);
      if (tekst.length < 10) continue;
      await t.propose({
        team: "klantenservice",
        title: `Websitechat wacht ${w.uren} uur: conceptantwoord klaar`,
        detail: `Vraag: "${w.vraag.slice(0, 220)}"\n\nConcept: ${tekst}\n\nPas na Uitvoeren komt dit antwoord in de chat (de bezoeker ziet het binnen een paar seconden).`,
        action: { type: "webchat-antwoord", conversationId: c.id, tekst },
      });
      n += 1;
    } catch {
      await t.log("klantenservice", "Servicedesk: een conceptantwoord lukte niet (het taalmodel antwoordde niet); de vraag staat nog in Admin → Webchat.", "error");
    }
  }
  if (n > 0) await t.log("klantenservice", `Servicedesk: ${n} conceptantwoord(en) klaargezet voor vragen die langer dan ${WACHT_UREN} uur wachten.`);
  return n;
}
