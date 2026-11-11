import { env } from "@/lib/env";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { journal } from "@/lib/ops/error-journal";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Nachtelijke rondgang (6 nov 2026): elke openbare, vaste pagina van de site
// wordt één keer opgehaald zoals een bezoeker dat doet. Een pagina die niet
// 200 geeft, bijna leeg is of de foutgrens toont, komt als "pagina kapot" in
// het foutenlogboek (Admin → Systeem → Foutmeldingen). De uitkomst staat in
// KV `rondgang:laatste`. Draait via de cron (deploy/cron/entrypoint.sh) op
// /api/internal/rondgang. De pagina's achter de login (dashboard, werkgever,
// beheer) vallen erbuiten: die vragen een sessie.
// ---------------------------------------------------------------------------

export interface RondgangProbleem {
  route: string;
  status: number | null;
  reden: string;
}

export interface RondgangUitslag {
  at: string;
  totaal: number;
  ok: number;
  ms: number;
  problemen: RondgangProbleem[];
}

export const KV_RONDGANG = "rondgang:laatste";

/** Vaste routes die zonder login bereikbaar horen te zijn. */
const PRIVE = ["/admin", "/dashboard", "/werkgever", "/studio", "/sales", "/scherm", "/start", "/berichten", "/kyc", "/verifieer-email", "/terminal", "/i/"];
/** Uitgezonderd: pagina's die bewust een lege, kleine of bijzondere staat hebben (ook een inlogpoort met alleen een knop; /welkom is de welkomstcarrousel van de app, ±220 tekens). */
const OVERSLAAN = new Set(["/account-verwijderen/voltooid", "/kyc/callback", "/wachtwoord-herstellen", "/mail/voorkeuren", "/nieuwsbrief/bevestigen", "/nieuwsbrief/afmelden", "/kaart", "/voorstel/schwarzwald/beheer", "/id-scan", "/welkom"]);

export function openbareRoutes(paginas: readonly { route: string; dynamic: boolean }[] = APP_PAGES): string[] {
  return paginas
    .filter((p) => !p.dynamic)
    .map((p) => p.route)
    .filter((r) => !PRIVE.some((p) => r === p || r.startsWith(p.endsWith("/") ? p : `${p}/`)))
    .filter((r) => !OVERSLAAN.has(r))
    .sort();
}

/** Beoordeelt één antwoord: null = in orde, anders de reden. */
export function beoordeel(status: number | null, body: string, contentType = "text/html"): string | null {
  if (status === null) return "geen antwoord";
  if (status >= 500) return `serverfout ${status}`;
  if (status === 404) return "pagina bestaat niet (404)";
  if (status >= 400) return `fout ${status}`;
  if (!/text\/html/i.test(contentType)) return null;
  // zonder scripts en stijl: wat overblijft moet een echte pagina zijn
  const tekst = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/Application error|Sorry, dit onderdeel haperde|De pagina kon niet worden geladen/i.test(tekst)) return "toont de foutgrens";
  if (tekst.length < 300) return `bijna lege pagina (${tekst.length} tekens)`;
  return null;
}

async function haal(url: string): Promise<{ status: number | null; body: string; contentType: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ZekerFlex-rondgang/1.0 (eigen controle)", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    return { status: res.status, body: await res.text().catch(() => ""), contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return { status: null, body: "", contentType: "" };
  }
}

/** Haalt elke openbare vaste pagina op (3 tegelijk) en meldt wat kapot is. */
export async function draaiRondgang(basis = env.APP_BASE_URL, gelijktijdig = 3): Promise<RondgangUitslag> {
  const t0 = Date.now();
  const routes = openbareRoutes();
  const base = basis.replace(/\/+$/, "");
  const problemen: RondgangProbleem[] = [];
  let i = 0;
  const werker = async () => {
    for (;;) {
      const route = routes[i++];
      if (!route) return;
      const r = await haal(`${base}${route}`);
      const reden = beoordeel(r.status, r.body, r.contentType);
      if (reden) problemen.push({ route, status: r.status, reden });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, gelijktijdig) }, werker));
  problemen.sort((a, b) => a.route.localeCompare(b.route));
  const uitslag: RondgangUitslag = { at: new Date().toISOString(), totaal: routes.length, ok: routes.length - problemen.length, ms: Date.now() - t0, problemen };
  for (const p of problemen) journal("error", "pagina kapot", { route: p.route, status: p.status, reason: p.reden });
  await kvSet(KV_RONDGANG, uitslag).catch(() => undefined);
  logger.info("rondgang klaar", { totaal: uitslag.totaal, problemen: problemen.length, ms: uitslag.ms });
  return uitslag;
}

export async function laatsteRondgang(): Promise<RondgangUitslag | null> {
  return kvGet<RondgangUitslag>(KV_RONDGANG);
}
