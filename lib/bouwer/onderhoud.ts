import { agentLeeft, isBezig, leesLive, plaatsVerzoek, type LiveStatus, type OnderhoudTaak } from "@/lib/bouwer/live";

// ---------------------------------------------------------------------------
// Serveronderhoud vanuit de chat (ZekerFlex AI): "serverstand" en "herstart de
// app". Zelfde vaste taken als de knoppen in Live zetten → Serveronderhoud; de
// live-zetter op de server voert ze uit (deploy/bouwer/zf-live.py, onderhoud()).
// ---------------------------------------------------------------------------

const DIENST: Record<string, Exclude<OnderhoudTaak, "status" | "opruimen">> = {
  app: "herstart-app",
  bouwer: "herstart-bouwer",
  webserver: "herstart-caddy",
  caddy: "herstart-caddy",
  planner: "herstart-cron",
  cron: "herstart-cron",
};

const NAAM: Record<OnderhoudTaak, string> = {
  status: "de serverstand",
  "herstart-app": "de app",
  "herstart-bouwer": "de Bouwer",
  "herstart-caddy": "de webserver",
  "herstart-cron": "de planner",
  opruimen: "het opruimen",
};

/** "herstart de app" → herstart-app; alleen als het bericht er zo mee begint. */
export function herstartTaak(tekst: string): OnderhoudTaak | null {
  const m = /^herstart\s+(de\s+)?(app|bouwer|webserver|caddy|planner|cron)\b/.exec(tekst.trim().toLowerCase());
  return m ? (DIENST[m[2] ?? ""] ?? null) : null;
}

/** De ruwe stand uit het log van de live-zetter in een paar gewone zinnen. */
export function samenvatServerstand(regels: string[]): string {
  const blok = (naam: string) => {
    const start = regels.indexOf(`--- ${naam}`);
    if (start < 0) return [];
    const rest = regels.slice(start + 1);
    const eind = rest.findIndex((r) => r.startsWith("--- "));
    return eind < 0 ? rest : rest.slice(0, eind);
  };
  const zinnen: string[] = [];

  const diensten = blok("diensten").filter((r) => r.includes(":"));
  if (diensten.length) {
    const mis = diensten.filter((r) => !/:\s*Up\b/.test(r) || /unhealthy/i.test(r)).map((r) => r.split(":")[0]?.trim());
    zinnen.push(mis.length ? `Niet alles draait goed: ${mis.join(", ")}.` : `Alle ${diensten.length} onderdelen draaien.`);
  }
  const schijf = blok("schijf").find((r) => r.startsWith("/"))?.split(/\s+/);
  if (schijf && schijf.length >= 5) zinnen.push(`Schijf: ${schijf[4]} gebruikt, nog ${schijf[3]} vrij.`);
  const mem = blok("geheugen").find((r) => r.startsWith("Mem:"))?.split(/\s+/);
  if (mem && mem.length >= 7) {
    const gb = (mb: string | undefined) => (Number(mb) / 1024).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
    zinnen.push(`Geheugen: ${gb(mem[6])} GB beschikbaar van ${gb(mem[1])} GB.`);
  }
  return zinnen.length ? zinnen.join(" ") : "De stand kwam niet goed door; kijk in Live zetten → Serveronderhoud.";
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Leg een onderhoudstaak neer voor de live-zetter. Bij "status" wacht hij op de
 * uitkomst (een paar seconden) en geeft hij de samenvatting; een herstart volg je in Live zetten.
 */
export async function onderhoudVanuitChat(taak: OnderhoudTaak, door: string): Promise<string> {
  const stand = await leesLive();
  if (stand.verzoek || isBezig(stand.status)) return "Er loopt al een uitrol of onderhoud op de server. Probeer het zo opnieuw, of kijk in Live zetten.";
  if (!agentLeeft(stand.hartslag)) return "De live-zetter op de server reageert niet, dus ik kan dit nu niet doen. Kijk in het tabblad Live zetten.";
  const verzoek = await plaatsVerzoek({ actie: "onderhoud", taak, migraties: [], destructiefAkkoord: false, forceer: false, door });
  if (taak !== "status") return `Ik herstart ${NAAM[taak]}. Volg het in Live zetten; ${taak === "herstart-app" ? "de site is ongeveer een minuut onbereikbaar." : "dat duurt meestal een paar seconden."}`;

  let status: LiveStatus | null = null;
  let log: string[] = [];
  for (let i = 0; i < 20; i++) {
    await wacht(2_000);
    const nu = await leesLive();
    if (nu.status?.id !== verzoek.id || nu.status.staat === "bezig") continue;
    status = nu.status;
    log = nu.log;
    // het log loopt tot 3 s achter op de status: wacht op het laatste blok
    if (status.staat !== "klaar" || log.includes("--- belasting")) break;
  }
  if (!status) return "De server is de stand nog aan het ophalen. Kijk zo in Live zetten → Serveronderhoud.";
  if (status.staat !== "klaar") return `Dat lukte niet: ${status.bericht}`;
  return samenvatServerstand(log);
}
