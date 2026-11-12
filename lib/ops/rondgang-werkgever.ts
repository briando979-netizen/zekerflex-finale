import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { beoordeel, type RondgangProbleem } from "@/lib/ops/rondgang-regels";
import { haalWerker, meldAan, redirectPad, type Jar } from "@/lib/ops/rondgang-werker";

// ---------------------------------------------------------------------------
// Het werkgeversdeel van de nachtelijke rondgang (12 nov 2026, naar het werkerdeel van ae): de pagina's uit het
// werkgeversmenu (werkruimte "personeel"), opgehaald als een vaste .test-werkgever met een eigen bedrijf
// ("Rondgang Testbedrijf", zonder klussen, mail of Stripe). Zelfde aanpak als lib/ops/rondgang-werker.ts: de gewone
// aanmelding, intern via de app, alleen GET, de sessiecookie alleen in het geheugen van deze run.
// Anders dan bij de werker maakt deze code het account NIET zelf aan: een mens zet het klaar (SQL, na een droge
// proef). De code zet alleen het wachtwoord uit RONDGANG_WERKGEVER_PASS, en weigert elk account dat niet precies
// zo is: een .test-adres, alleen beheerder van dat ene testbedrijf, geen platform- of verkooprol.
// ---------------------------------------------------------------------------

export const RONDGANG_WERKGEVER_STANDAARD = "rondgang-werkgever@zekerflex.test";
export const RONDGANG_TESTBEDRIJF = "Rondgang Testbedrijf";

/** De werkgeverspagina's van de rondgang (alle vast, geen [id]); tests/rondgang-werkgever.test.ts eist dat ze bestaan. */
export const WERKGEVER_PAGINAS = [
  "/werkgever",
  "/werkgever/diensten",
  "/werkgever/diensten/nieuw",
  "/werkgever/kalender",
  "/werkgever/facturen",
  "/werkgever/team",
  "/werkgever/instellingen",
] as const;

export interface WerkgeverRondgang {
  ingelogd: boolean;
  paginas: number;
  /** waarom het werkgeversdeel niet draaide (geen wachtwoord, geen account, verkeerd account, inloggen mislukt, 403) */
  overgeslagen?: string;
  problemen: RondgangProbleem[];
}

/**
 * Mag dit account de rondgang doen? null = ja, anders de reden. Puur: alleen een .test-adres, en alleen
 * beheerder (HQ_ADMIN of LOCAL_MANAGER) van het testbedrijf; elke andere rol of een ander bedrijf: nee.
 */
export function waaromNietGeschikt(a: { email: string; rollen: { role: string; bedrijf: string | null }[] }): string | null {
  if (!isReservedTestAddress(a.email)) return "het werkgeversadres eindigt niet op een testdomein";
  if (a.rollen.length === 0) return "het account hoort bij geen bedrijf";
  for (const r of a.rollen) {
    if (r.role !== "HQ_ADMIN" && r.role !== "LOCAL_MANAGER") return `het account heeft de rol ${r.role}`;
    if (r.bedrijf !== RONDGANG_TESTBEDRIJF) return "het account hoort (ook) bij een ander bedrijf dan het testbedrijf";
  }
  return null;
}

/** Zoekt het klaargezette account en zet zijn wachtwoord gelijk aan de omgeving. Maakt nooit iets aan. */
export async function rondgangWerkgever(email: string, wachtwoord: string): Promise<{ id: string } | { reden: string }> {
  const adres = email.trim().toLowerCase();
  if (wachtwoord.length < 16) return { reden: "RONDGANG_WERKGEVER_PASS is te kort" };
  const u = await prisma.user.findUnique({
    where: { email: adres },
    select: { id: true, passwordHash: true, disabledAt: true, emailVerifiedAt: true, memberships: { select: { role: true, tenant: { select: { name: true } } } } },
  });
  if (!u) return { reden: "het rondgang-werkgeversaccount bestaat nog niet (een mens zet het klaar)" };
  if (u.disabledAt) return { reden: "het rondgang-werkgeversaccount is uitgeschakeld" };
  if (!u.emailVerifiedAt) return { reden: "het e-mailadres van het rondgang-werkgeversaccount is niet bevestigd" };
  const reden = waaromNietGeschikt({ email: adres, rollen: u.memberships.map((m) => ({ role: m.role, bedrijf: m.tenant?.name ?? null })) });
  if (reden) return { reden };
  if (!u.passwordHash || !(await bcrypt.compare(wachtwoord, u.passwordHash))) {
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(wachtwoord, 10) } });
  }
  return { id: u.id };
}

/** Het werkgeversdeel: aanmelden en de pagina's beoordelen. Zonder wachtwoord of met een verkeerd account: overgeslagen. */
export async function draaiWerkgeverRondgang(gelijktijdig = 3, intern = `http://localhost:${process.env.PORT ?? "3000"}`): Promise<WerkgeverRondgang> {
  const email = (env.RONDGANG_WERKGEVER_EMAIL ?? RONDGANG_WERKGEVER_STANDAARD).trim().toLowerCase();
  const wachtwoord = env.RONDGANG_WERKGEVER_PASS;
  const leeg = (overgeslagen: string): WerkgeverRondgang => ({ ingelogd: false, paginas: 0, overgeslagen, problemen: [] });
  if (!wachtwoord) return leeg("geen RONDGANG_WERKGEVER_PASS");
  if (!isReservedTestAddress(email)) return leeg("het werkgeversadres eindigt niet op een testdomein");
  const account = await rondgangWerkgever(email, wachtwoord).catch(() => ({ reden: "het rondgang-werkgeversaccount kon niet worden gelezen" }));
  if ("reden" in account) return leeg(account.reden);

  const jar: Jar = new Map();
  const ingelogd = await meldAan(intern, email, wachtwoord, jar, "/werkgever", "werkgever").catch(() => false);
  if (!ingelogd) {
    return { ingelogd: false, paginas: 0, overgeslagen: "inloggen mislukt", problemen: [{ route: "/login", status: null, reden: "de rondgang-werkgever kon niet inloggen" }] };
  }

  const problemen: RondgangProbleem[] = [];
  let i = 0;
  let gestopt = false;
  const loper = async () => {
    for (;;) {
      if (gestopt) return;
      const route = WERKGEVER_PAGINAS[i++];
      if (!route) return;
      const r = await haalWerker(intern, route, jar, "werkgever");
      if (r.status === 403) {
        // nooit een reeks 403's (CrowdSec); voor dit account niet te verwachten, dus stoppen en melden
        gestopt = true;
        problemen.push({ route, status: 403, reden: "geweigerd (403): werkgeversdeel gestopt" });
        return;
      }
      if (r.naar) {
        const pad = redirectPad(r.naar);
        if (pad.startsWith("/login")) problemen.push({ route, status: r.status, reden: "stuurt de werkgever naar het inloggen (uitgelogd)" });
        else if (pad.startsWith("/dashboard")) problemen.push({ route, status: r.status, reden: "stuurt de werkgever naar de werkersapp (geen werkgeversrol?)" });
        continue; // een andere doorverwijzing binnen de werkgeversapp is geen fout
      }
      const reden = beoordeel(r.status, r.body, r.contentType);
      if (reden) problemen.push({ route, status: r.status, reden });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, gelijktijdig) }, loper));
  jar.clear();
  problemen.sort((a, b) => a.route.localeCompare(b.route));
  return { ingelogd: true, paginas: WERKGEVER_PAGINAS.length, ...(gestopt ? { overgeslagen: "gestopt na een 403" } : {}), problemen };
}
