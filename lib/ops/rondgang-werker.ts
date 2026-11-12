import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { setFiscal } from "@/lib/fiscal/store";
import { beoordeel, type RondgangProbleem } from "@/lib/ops/rondgang-regels";

// ---------------------------------------------------------------------------
// Het werkerdeel van de nachtelijke rondgang (12 nov 2026, ontwerp met 86): de belangrijkste /dashboard-pagina's,
// opgehaald als een vaste .test-werker. Zo zien we een 500 op een werkerpagina voordat een werker klaagt.
//   - Geen achterdeur: de gewone NextAuth-aanmelding (csrf → callback/credentials) met een eigen wachtwoord uit
//     .env.production (RONDGANG_WERKER_PASS, gemaakt door deploy/scripts/env-aanvullen.sh, nooit afgedrukt).
//   - Intern via de app zelf (http://localhost:<poort> in de app-container, met X-Forwarded-Host/-Proto zoals Caddy):
//     CrowdSec en de toegangslogs zien er niets van.
//   - Alleen GET. De sessiecookie leeft alleen in het geheugen van deze ene run: nooit in KV, een log of de uitslag.
//   - Het account is een .test-adres: buiten de onboardingregel, zonder mail, buiten de statistieken; zonder
//     FreelancerProfile en zonder ID-controle telt het niet mee in matching of Beheer → Te keuren.
//   - Alleen pagina's die bij het laden geen betaalde of externe dienst aanroepen (dus niet uitbetalingen of bank,
//     inchecken, de assistent en de modules).
// ---------------------------------------------------------------------------

export const RONDGANG_WERKER_STANDAARD = "rondgang@zekerflex.test";

/** De werkerpagina's van de rondgang (alle vast, geen [id]); tests/rondgang-werker.test.ts eist dat ze bestaan. */
export const WERKER_PAGINAS = [
  "/dashboard/klussen",
  "/dashboard/diensten",
  "/dashboard/uren",
  "/dashboard/berichten",
  "/dashboard/account",
  "/dashboard/profiel",
  "/dashboard/verificatie",
  "/dashboard/fiscaal",
  "/dashboard/administratie",
  "/dashboard/beschikbaarheid",
  "/dashboard/certificaten",
  "/dashboard/favorieten",
  "/dashboard/eerste-indruk",
  "/dashboard/vooruitblik",
  "/dashboard/verzekering",
  "/dashboard/paspoort",
] as const;

export interface WerkerRondgang {
  ingelogd: boolean;
  paginas: number;
  /** waarom het werkerdeel niet draaide (geen wachtwoord, geen .test-adres, inloggen mislukt, 403) */
  overgeslagen?: string;
  problemen: RondgangProbleem[];
}

/**
 * Zorgt dat precies dit ene .test-account bestaat, als werker, met het wachtwoord uit de omgeving. Raakt nooit een
 * ander account: alles gaat via het exacte e-mailadres, en een adres dat niet op een testdomein eindigt, weigert hij.
 */
export async function zorgVoorRondgangWerker(email: string, wachtwoord: string): Promise<{ id: string } | null> {
  const adres = email.trim().toLowerCase();
  if (!isReservedTestAddress(adres) || wachtwoord.length < 16) return null;
  const bestaand = await prisma.user.findUnique({ where: { email: adres }, select: { id: true, passwordHash: true } });
  if (!bestaand) {
    const nieuw = await prisma.user.create({
      data: { email: adres, fullName: "Rondgang (controle)", passwordHash: await bcrypt.hash(wachtwoord, 10), emailVerifiedAt: new Date() },
      select: { id: true },
    });
    await prisma.membership.create({ data: { userId: nieuw.id, tenantId: "org_platform", role: "FREELANCER" } });
    // een soort, zodat de werkerpagina's hun gewone inhoud tonen
    await setFiscal(nieuw.id, { workerKind: "uitzendkracht" });
    return nieuw;
  }
  if (!bestaand.passwordHash || !(await bcrypt.compare(wachtwoord, bestaand.passwordHash))) {
    await prisma.user.update({ where: { email: adres }, data: { passwordHash: await bcrypt.hash(wachtwoord, 10) } });
  }
  return { id: bestaand.id };
}

type Jar = Map<string, string>;

function neemCookies(res: Response, jar: Jar): void {
  const lijst = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of lijst) {
    const nv = c.split(";")[0] ?? "";
    const i = nv.indexOf("=");
    if (i > 0) jar.set(nv.slice(0, i).trim(), nv.slice(i + 1));
  }
}

const cookieKop = (jar: Jar): string => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

function kop(): Record<string, string> {
  const host = new URL(env.APP_BASE_URL).host;
  return { "x-forwarded-host": host, "x-forwarded-proto": "https", "user-agent": "ZekerFlex-rondgang/1.0 (eigen controle, werker)" };
}

/** Meldt de werker aan via de gewone NextAuth-route; true = er is een sessiecookie. Logt en bewaart niets. */
async function meldAan(intern: string, email: string, wachtwoord: string, jar: Jar): Promise<boolean> {
  const csrf = await fetch(`${intern}/api/auth/csrf`, { headers: kop(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  neemCookies(csrf, jar);
  const csrfToken = ((await csrf.json().catch(() => ({}))) as { csrfToken?: unknown }).csrfToken;
  if (typeof csrfToken !== "string") return false;
  const res = await fetch(`${intern}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { ...kop(), "content-type": "application/x-www-form-urlencoded", cookie: cookieKop(jar) },
    body: new URLSearchParams({ csrfToken, email, password: wachtwoord, callbackUrl: `${env.APP_BASE_URL.replace(/\/+$/, "")}/dashboard/klussen` }),
    signal: AbortSignal.timeout(15_000),
  });
  neemCookies(res, jar);
  // NextAuth zet de sessie in authjs.session-token (in productie met __Secure-ervoor)
  return [...jar.keys()].some((k) => /authjs\.session-token$/.test(k));
}

/** Haalt één werkerpagina op (zonder redirects te volgen naar buiten). */
async function haalWerker(intern: string, route: string, jar: Jar): Promise<{ status: number | null; body: string; contentType: string; naar: string | null }> {
  try {
    const res = await fetch(`${intern}${route}`, {
      headers: { ...kop(), cookie: cookieKop(jar), accept: "text/html" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const naar = res.headers.get("location");
    return { status: res.status, body: naar ? "" : await res.text().catch(() => ""), contentType: res.headers.get("content-type") ?? "", naar };
  } catch {
    return { status: null, body: "", contentType: "", naar: null };
  }
}

/** Het pad van een redirect (absoluut of relatief), zonder query. */
export function redirectPad(naar: string): string {
  try {
    return new URL(naar, "http://x").pathname;
  } catch {
    return naar;
  }
}

/** Het werkerdeel: aanmelden en de pagina's beoordelen. Zonder wachtwoord of met een fout adres: overgeslagen. */
export async function draaiWerkerRondgang(gelijktijdig = 3, intern = `http://localhost:${process.env.PORT ?? "3000"}`): Promise<WerkerRondgang> {
  const email = (env.RONDGANG_WERKER_EMAIL ?? RONDGANG_WERKER_STANDAARD).trim().toLowerCase();
  const wachtwoord = env.RONDGANG_WERKER_PASS;
  const leeg = (overgeslagen: string): WerkerRondgang => ({ ingelogd: false, paginas: 0, overgeslagen, problemen: [] });
  if (!wachtwoord) return leeg("geen RONDGANG_WERKER_PASS");
  if (!isReservedTestAddress(email)) return leeg("het werkeradres eindigt niet op een testdomein");
  const account = await zorgVoorRondgangWerker(email, wachtwoord).catch(() => null);
  if (!account) return leeg("het rondgang-account kon niet worden klaargezet");

  const jar: Jar = new Map();
  const ingelogd = await meldAan(intern, email, wachtwoord, jar).catch(() => false);
  if (!ingelogd) {
    return { ingelogd: false, paginas: 0, overgeslagen: "inloggen mislukt", problemen: [{ route: "/login", status: null, reden: "de rondgang-werker kon niet inloggen" }] };
  }

  const problemen: RondgangProbleem[] = [];
  let i = 0;
  let gestopt = false;
  const loper = async () => {
    for (;;) {
      if (gestopt) return;
      const route = WERKER_PAGINAS[i++];
      if (!route) return;
      const r = await haalWerker(intern, route, jar);
      if (r.status === 403) {
        // nooit een reeks 403's (CrowdSec); voor dit account niet te verwachten, dus stoppen en melden
        gestopt = true;
        problemen.push({ route, status: 403, reden: "geweigerd (403): werkerdeel gestopt" });
        return;
      }
      if (r.naar) {
        const pad = redirectPad(r.naar);
        if (pad.startsWith("/login")) problemen.push({ route, status: r.status, reden: "stuurt de werker naar het inloggen (uitgelogd)" });
        continue; // een andere doorverwijzing binnen de app is geen fout
      }
      const reden = beoordeel(r.status, r.body, r.contentType);
      if (reden) problemen.push({ route, status: r.status, reden });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, gelijktijdig) }, loper));
  jar.clear();
  problemen.sort((a, b) => a.route.localeCompare(b.route));
  return { ingelogd: true, paginas: WERKER_PAGINAS.length, ...(gestopt ? { overgeslagen: "gestopt na een 403" } : {}), problemen };
}
