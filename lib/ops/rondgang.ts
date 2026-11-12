import { env } from "@/lib/env";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { journal } from "@/lib/ops/error-journal";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { beoordeel, type RondgangProbleem } from "@/lib/ops/rondgang-regels";
import { draaiWerkerRondgang, type WerkerRondgang } from "@/lib/ops/rondgang-werker";

export { beoordeel, type RondgangProbleem };

// ---------------------------------------------------------------------------
// Nachtelijke rondgang (6 nov 2026): elke openbare, vaste pagina van de site
// wordt één keer opgehaald zoals een bezoeker dat doet. Een pagina die niet
// 200 geeft, bijna leeg is of de foutgrens toont, komt als "pagina kapot" in
// het foutenlogboek (Admin → Systeem → Foutmeldingen). De uitkomst staat in
// KV `rondgang:laatste`. Draait via de cron (deploy/cron/entrypoint.sh) op
// /api/internal/rondgang. De pagina's achter de login (werkgever, beheer) vallen
// erbuiten; de belangrijkste werkerpagina's haalt sinds 12 nov een vaste .test-werker
// op (lib/ops/rondgang-werker.ts), met de gewone aanmelding en intern via de app.
// ---------------------------------------------------------------------------

export interface RondgangUitslag {
  at: string;
  totaal: number;
  ok: number;
  ms: number;
  problemen: RondgangProbleem[];
  /** het werkerdeel (lib/ops/rondgang-werker.ts); de problemen daarvan staan ook in `problemen` (route /dashboard/…) */
  werker?: { ingelogd: boolean; paginas: number; overgeslagen?: string };
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
  for (const p of problemen) journal("error", "pagina kapot", { route: p.route, status: p.status, reason: p.reden });

  // de werkerpagina's als een vaste .test-werker (een storing hier laat de rest van de rondgang staan)
  const w: WerkerRondgang = await draaiWerkerRondgang(gelijktijdig).catch(() => ({ ingelogd: false, paginas: 0, overgeslagen: "werkerdeel mislukt", problemen: [] }));
  for (const p of w.problemen) journal("error", "werkerpagina kapot", { route: p.route, status: p.status, reason: p.reden });
  const alle = [...problemen, ...w.problemen];
  const totaal = routes.length + w.paginas;
  const uitslag: RondgangUitslag = {
    at: new Date().toISOString(),
    totaal,
    ok: totaal - alle.length,
    ms: Date.now() - t0,
    problemen: alle,
    werker: { ingelogd: w.ingelogd, paginas: w.paginas, ...(w.overgeslagen ? { overgeslagen: w.overgeslagen } : {}) },
  };
  await kvSet(KV_RONDGANG, uitslag).catch(() => undefined);
  logger.info("rondgang klaar", { totaal: uitslag.totaal, problemen: problemen.length, ms: uitslag.ms });
  return uitslag;
}

export async function laatsteRondgang(): Promise<RondgangUitslag | null> {
  return kvGet<RondgangUitslag>(KV_RONDGANG);
}
