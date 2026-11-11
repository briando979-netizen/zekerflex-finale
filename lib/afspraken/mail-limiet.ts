import { createHmac } from "node:crypto";
import { kvDeleteStale, kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Rem op misbruik van de mail aan klanten (lib/afspraken/mail.ts). Iedereen kan een boekpagina openzetten met een eigen
// bedrijfsnaam en dienst en boeken op het adres van een ander: ZekerFlex zou dan een spam- of phishingrelais zijn en de
// bezorging van alle ZekerFlex-mail kosten. Twee plafonds, per Nederlandse kalenderdag:
//   - per organisatie: hooguit 200 mails per dag, samen voor bevestiging, herinnering en annulering;
//   - per ontvanger, over alle organisaties heen: hooguit 5 mails per dag.
// FAIL-CLOSED (anders dan het login-slot, dat fail-open is): kan een teller niet gelezen of geschreven worden, dan gaat er
// geen mail uit. Een mail die niet verstuurd mag worden, is hier nooit erg; een relais dat openstaat wel.
// Aanpak: eerst RESERVEREN (beide tellers één ophogen, vóór het versturen), en teruggeven als de mail mislukt. Zo telt
// een mail die hangt of faalt niet mee, en een gelijktijdige tweede niet ongezien erbij. De opslag heeft geen vergrendeling
// (lezen, ophogen, schrijven): bij echt gelijktijdige boekingen kan het plafond met een paar mails overschreden worden; een
// structureel gat is het niet, want elke mail verhoogt de teller.
// Het e-mailadres staat nooit in een sleutel: alleen een HMAC-hash (met het geheim van de server), met de dag erbij.
//   afspraken:mailorg:<organisatie>:<dag>   {n}
//   afspraken:mailadr:<dag>:<hash>          {n}
// Oude dagsleutels ruimt ruimMailTellersOp op (aangeroepen door de herinneringscron, elk uur).
// ---------------------------------------------------------------------------

export const MAX_MAILS_PER_ORGANISATIE_PER_DAG = 200;
export const MAX_MAILS_PER_ONTVANGER_PER_DAG = 5;

const VOORVOEGSEL_ORG = "afspraken:mailorg:";
const VOORVOEGSEL_ADR = "afspraken:mailadr:";

const geheim = (): string => process.env.AUTH_SECRET ?? "dev-secret";
/** Alleen deze hash gaat de opslag in, nooit het adres zelf. */
export const adresHash = (email: string): string => createHmac("sha256", geheim()).update(`afspraak-mailadres:${email.trim().toLowerCase()}`).digest("base64url");

const sleutelOrg = (tenantId: string, dag: string) => `${VOORVOEGSEL_ORG}${tenantId}:${dag}`;
const sleutelAdr = (dag: string, hash: string) => `${VOORVOEGSEL_ADR}${dag}:${hash}`;

export type Reservering = { ok: true; geef: () => Promise<void> } | { ok: false; reden: "organisatie-vol" | "ontvanger-vol" | "storing" };

/**
 * Reserveert één mail aan dit adres namens deze organisatie, of zegt waarom niet. `geef()` geeft de reservering terug
 * (als de mail toch niet verstuurd is); gooit nooit.
 */
export async function reserveerMail(tenantId: string, email: string, nu: Date): Promise<Reservering> {
  try {
    const dag = amsterdamDayKey(nu);
    const sOrg = sleutelOrg(tenantId, dag);
    const sAdr = sleutelAdr(dag, adresHash(email));
    const [org, adr] = await Promise.all([kvGet<{ n: number }>(sOrg), kvGet<{ n: number }>(sAdr)]);
    const nOrg = typeof org?.n === "number" ? org.n : 0;
    const nAdr = typeof adr?.n === "number" ? adr.n : 0;
    if (nOrg >= MAX_MAILS_PER_ORGANISATIE_PER_DAG) return { ok: false, reden: "organisatie-vol" };
    if (nAdr >= MAX_MAILS_PER_ONTVANGER_PER_DAG) return { ok: false, reden: "ontvanger-vol" };
    await kvSet(sOrg, { n: nOrg + 1 });
    try {
      await kvSet(sAdr, { n: nAdr + 1 });
    } catch (err) {
      await kvSet(sOrg, { n: nOrg }).catch(() => undefined);
      throw err;
    }
    return {
      ok: true,
      geef: async () => {
        try {
          const [o, a] = await Promise.all([kvGet<{ n: number }>(sOrg), kvGet<{ n: number }>(sAdr)]);
          if (o && o.n > 0) await kvSet(sOrg, { n: o.n - 1 });
          if (a && a.n > 0) await kvSet(sAdr, { n: a.n - 1 });
        } catch {
          // een teller die te hoog blijft is veilig: dan mailen we hooguit iets minder
        }
      },
    };
  } catch {
    return { ok: false, reden: "storing" };
  }
}

/**
 * Ruimt de tellers van eerdere dagen op: een teller die twee dagen niet is aangeraakt hoort bij een voorbije dag
 * (een dag is hooguit 25 uur lang). Geeft het aantal gewiste sleutels terug; gooit nooit.
 */
export async function ruimMailTellersOp(nu: Date): Promise<number> {
  try {
    const voor = new Date(nu.getTime() - 2 * 86_400_000);
    return (await kvDeleteStale(VOORVOEGSEL_ORG, voor)) + (await kvDeleteStale(VOORVOEGSEL_ADR, voor));
  } catch {
    return 0;
  }
}
