import { env } from "@/lib/env";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { journal } from "@/lib/ops/error-journal";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { beoordeel, type RondgangProbleem } from "@/lib/ops/rondgang-regels";
import { draaiWerkerRondgang, type WerkerRondgang } from "@/lib/ops/rondgang-werker";
import { draaiWerkgeverRondgang, type WerkgeverRondgang } from "@/lib/ops/rondgang-werkgever";
import { CITIES, REGIO_STEDEN } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

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
// Beheer (/admin, met de verkoopkaart) bewust niet: daarvoor zou de rondgang een
// PLATFORM_ADMIN-account nodig hebben, en zo'n vast beheeraccount met een wachtwoord
// in de omgeving is een groter risico dan wat de controle oplevert (14 nov).
// ---------------------------------------------------------------------------

export interface RondgangUitslag {
  at: string;
  totaal: number;
  ok: number;
  ms: number;
  problemen: RondgangProbleem[];
  /** het werkerdeel (lib/ops/rondgang-werker.ts); de problemen daarvan staan ook in `problemen` (route /dashboard/…) */
  werker?: { ingelogd: boolean; paginas: number; overgeslagen?: string };
  /** het werkgeversdeel (lib/ops/rondgang-werkgever.ts); de problemen daarvan staan ook in `problemen` (route /werkgever/…) */
  werkgever?: { ingelogd: boolean; paginas: number; overgeslagen?: string };
}

export const KV_RONDGANG = "rondgang:laatste";

/** Vaste routes die zonder login bereikbaar horen te zijn. */
const PRIVE = ["/admin", "/dashboard", "/werkgever", "/studio", "/sales", "/scherm", "/start", "/berichten", "/kyc", "/verifieer-email", "/terminal", "/i/"];
/** Uitgezonderd: pagina's die bewust een lege, kleine of bijzondere staat hebben (ook een inlogpoort met alleen een knop; /welkom is de welkomstcarrousel van de app, ±220 tekens). */
const OVERSLAAN = new Set(["/account-verwijderen/voltooid", "/kyc/callback", "/wachtwoord-herstellen", "/mail/voorkeuren", "/nieuwsbrief/bevestigen", "/nieuwsbrief/afmelden", "/kaart", "/voorstel/schwarzwald/beheer", "/id-scan", "/welkom"]);

// Stadspagina's (14 nov): die zijn dynamisch ([stad]) en vielen dus altijd buiten de ronde, ook de regio rond de eigen
// vestiging. Niet alle ±300: per soort twee per nacht, één uit alle steden en één regiostad, steeds een andere, zodat
// elke regiostad binnen 5 nachten en elke stad binnen ±4 weken langskomt. Plus vaste adressen met een querystring.
/** Regiosteden rond de eigen vestiging (Zuidbroek); de lijst zelf staat in lib/seo-cities.ts. */
export { REGIO_STEDEN };
/** Adressen die geen eigen pagina zijn maar wel een eigen weergave hebben. */
export const EXTRA_ADRESSEN = ["/register?type=bedrijf"] as const;

/** De soorten stadspagina: /personeel-inhuren/<stad>, /freelance-werk/<stad> en per sector de werkgevers- en de werkerkant. */
export function stadSoorten(): string[] {
  return ["personeel-inhuren", "freelance-werk", ...SECTORS.flatMap((s) => [s.slug, s.workerSlug])];
}

/** Het dagnummer van een Amsterdamse dag (een stad per nacht verder). */
export function dagNummer(nu: Date): number {
  const [y, m, d] = amsterdamDayKey(nu).split("-").map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** De steekproef van stadspagina's voor deze nacht: per soort hooguit twee, zonder dubbele. */
export function stadSteekproef(dag: number, steden: readonly string[] = CITIES.map((c) => c.slug), regio: readonly string[] = REGIO_STEDEN, soorten: readonly string[] = stadSoorten()): string[] {
  const regioHier = regio.filter((r) => steden.includes(r));
  const uit: string[] = [];
  soorten.forEach((soort, i) => {
    const keuzes = [steden[(dag + i) % steden.length], regioHier.length ? regioHier[(dag + i) % regioHier.length] : undefined];
    for (const stad of keuzes) {
      const route = stad ? `/${soort}/${stad}` : null;
      if (route && !uit.includes(route)) uit.push(route);
    }
  });
  return uit;
}

export function openbareRoutes(paginas: readonly { route: string; dynamic: boolean }[] = APP_PAGES): string[] {
  return paginas
    .filter((p) => !p.dynamic)
    .map((p) => p.route)
    .filter((r) => !PRIVE.some((p) => r === p || r.startsWith(p.endsWith("/") ? p : `${p}/`)))
    .filter((r) => !OVERSLAAN.has(r))
    .sort();
}

/** Alle openbare adressen van deze nacht: de vaste pagina's, de vaste extra adressen en de steekproef van stadspagina's. */
export function rondgangRoutes(nu: Date = new Date()): string[] {
  return [...openbareRoutes(), ...EXTRA_ADRESSEN, ...stadSteekproef(dagNummer(nu))];
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
  const routes = rondgangRoutes();
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
  // en de werkgeverspagina's als een vaste .test-werkgever (zelfde aanpak; een storing laat de rest staan)
  const wg: WerkgeverRondgang = await draaiWerkgeverRondgang(gelijktijdig).catch(() => ({ ingelogd: false, paginas: 0, overgeslagen: "werkgeversdeel mislukt", problemen: [] }));
  for (const p of wg.problemen) journal("error", "werkgeverpagina kapot", { route: p.route, status: p.status, reason: p.reden });
  const alle = [...problemen, ...w.problemen, ...wg.problemen];
  const totaal = routes.length + w.paginas + wg.paginas;
  const uitslag: RondgangUitslag = {
    at: new Date().toISOString(),
    totaal,
    ok: totaal - alle.length,
    ms: Date.now() - t0,
    problemen: alle,
    werker: { ingelogd: w.ingelogd, paginas: w.paginas, ...(w.overgeslagen ? { overgeslagen: w.overgeslagen } : {}) },
    werkgever: { ingelogd: wg.ingelogd, paginas: wg.paginas, ...(wg.overgeslagen ? { overgeslagen: wg.overgeslagen } : {}) },
  };
  await kvSet(KV_RONDGANG, uitslag).catch(() => undefined);
  logger.info("rondgang klaar", { totaal: uitslag.totaal, problemen: problemen.length, ms: uitslag.ms });
  return uitslag;
}

export async function laatsteRondgang(): Promise<RondgangUitslag | null> {
  return kvGet<RondgangUitslag>(KV_RONDGANG);
}
