import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamClock, amsterdamDayKey, amsterdamParts, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import { liveVersie, type Versie } from "@/lib/bouwer/versie";
import { commitsTussen } from "@/lib/bouwer/live";

// ---------------------------------------------------------------------------
// Wat er live ging, voor de eigenaar die geen GitHub leest. Elke 30 minuten
// (cron → /api/internal/bouwer/auto) legt de app vast welke versie live staat
// (lib/bouwer/VERSIE.txt), wie er ook uitrolde. Eén keer per dag, na 18:00
// Nederlandse tijd, gaat er een mail met wat er die dag live ging, in gewone
// taal ("Nieuw: …", "Opgelost: …"). Geen wijzigingen = geen mail.
// ---------------------------------------------------------------------------

const K_GESCHIEDENIS = "bouwer:live:geschiedenis";
const K_DAG = "bouwer:dagoverzicht:laatst";
const MAX_GESCHIEDENIS = 60;
const UUR_DAGOVERZICHT = 18;
const MAX_PER_KOPJE = 25;

export interface LiveMoment extends Versie {
  /** wanneer de app deze versie voor het eerst live zag */
  gezienOp: string;
}

export async function liveGeschiedenis(): Promise<LiveMoment[]> {
  return (await kvGet<LiveMoment[]>(K_GESCHIEDENIS)) ?? [];
}

/** Leg de huidige live versie vast als die nieuw is. */
export async function registreerLiveVersie(now = Date.now()): Promise<LiveMoment[]> {
  const lijst = await liveGeschiedenis();
  const v = liveVersie();
  if (!v || lijst[0]?.sha === v.sha) return lijst;
  const nieuw = [{ ...v, gezienOp: new Date(now).toISOString() }, ...lijst].slice(0, MAX_GESCHIEDENIS);
  await kvSet(K_GESCHIEDENIS, nieuw);
  return nieuw;
}

export type Soort = "nieuw" | "opgelost" | "sneller" | "achter";

/** Een conventionele commitregel in gewone taal; "achter" = achter de schermen (geen eigen regel in de mail). */
export function leesbaar(onderwerp: string): { soort: Soort; tekst: string } {
  const m = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/.exec(onderwerp.trim());
  if (!m) return { soort: "nieuw", tekst: onderwerp.trim() };
  const type = (m[1] ?? "").toLowerCase();
  const tekst = (m[3] ?? "").trim();
  const zin = tekst.charAt(0).toUpperCase() + tekst.slice(1);
  if (type === "feat") return { soort: "nieuw", tekst: zin };
  if (type === "fix") return { soort: "opgelost", tekst: zin };
  if (type === "perf") return { soort: "sneller", tekst: zin };
  return { soort: "achter", tekst: zin };
}

export function dagoverzichtTekst(onderwerpen: string[], live: Versie | null, basisUrl: string): { onderwerp: string; tekst: string } | null {
  const regels = onderwerpen.map(leesbaar);
  const kopje: Record<Exclude<Soort, "achter">, string> = { nieuw: "Nieuw", opgelost: "Opgelost", sneller: "Sneller" };
  const blokken = (Object.keys(kopje) as (keyof typeof kopje)[])
    .map((s) => ({ s, items: regels.filter((r) => r.soort === s) }))
    .filter((b) => b.items.length > 0)
    // op een drukke dag blijft de mail leesbaar: hooguit 25 per kopje
    .map((b) => {
      const meer = b.items.length - MAX_PER_KOPJE;
      const lijst = b.items.slice(0, MAX_PER_KOPJE).map((r) => `• ${r.tekst}`);
      return `${kopje[b.s]}\n${lijst.join("\n")}${meer > 0 ? `\n… en nog ${meer} meer (zie Live zetten)` : ""}`;
    });
  const achter = regels.filter((r) => r.soort === "achter").length;
  if (!blokken.length && !achter) return null;
  const tekst = [
    "Vandaag ging dit live op ZekerFlex:",
    "",
    ...blokken.flatMap((b) => [b, ""]),
    ...(achter ? [`En ${achter} kleinere wijziging${achter === 1 ? "" : "en"} achter de schermen.`, ""] : []),
    ...(live ? [`Live staat nu: ${leesbaar(live.onderwerp).tekst} (${live.sha.slice(0, 7)}).`] : []),
    `Alles bekijken: ${basisUrl}/admin/zekerflex-ai (tabblad Live zetten).`,
  ].join("\n");
  return { onderwerp: `ZekerFlex: vandaag live gezet (${regels.length} wijziging${regels.length === 1 ? "" : "en"})`, tekst };
}

export type DagUitkomst = "te-vroeg" | "al-gedaan" | "niets" | "verstuurd" | "fout";

/** Na 18:00 (NL) één keer per dag: wat er vandaag live ging, als mail aan de eigenaar. */
export async function dagoverzicht(now = Date.now()): Promise<DagUitkomst> {
  const nu = new Date(now);
  if (amsterdamParts(nu).hour < UUR_DAGOVERZICHT) return "te-vroeg";
  const dag = amsterdamDayKey(nu);
  if ((await kvGet<string>(K_DAG)) === dag) return "al-gedaan";

  const lijst = await registreerLiveVersie(now);
  const begin = amsterdamStartOfDay(nu).getTime();
  const vandaag = lijst.filter((m) => Date.parse(m.gezienOp) >= begin);
  const basis = lijst.find((m) => Date.parse(m.gezienOp) < begin);
  const nieuwste = vandaag[0];
  if (!nieuwste) {
    await kvSet(K_DAG, dag);
    return "niets";
  }
  // met een bekende versie van vanochtend: precies de commits ertussen; anders de vastgelegde versies
  const onderwerpen = basis
    ? (await commitsTussen(basis.sha, nieuwste.sha).catch(() => null))?.map((c) => c.onderwerp) ?? vandaag.map((m) => m.onderwerp)
    : vandaag.map((m) => m.onderwerp);
  const mail = dagoverzichtTekst(onderwerpen, nieuwste, env.APP_BASE_URL.replace(/\/+$/, ""));
  if (!mail) {
    await kvSet(K_DAG, dag);
    return "niets";
  }
  const { sendMail } = await import("@/lib/mail");
  await sendMail({ to: env.MAIL_ADMIN, subject: mail.onderwerp, text: `${mail.tekst}\n\n(Verstuurd om ${amsterdamClock(nu)}.)`, kind: "ops-dagoverzicht" });
  await kvSet(K_DAG, dag);
  return "verstuurd";
}
