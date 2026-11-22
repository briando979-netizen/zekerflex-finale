// ---------------------------------------------------------------------------
// De Meetkamer (Admin → Mensen & bedrijven → Meetkamer, 20 nov 2026, eigenaar:
// "een meting van elke echte gebruiker: wat hij deed, hoe laat hij inlogde,
// hoeveel er opnieuw inloggen, wat ze klikken, wat ze op de voorpagina doen;
// en als niet alles te volgen is, bouw dat dan"). Dit bestand is puur: het
// rekent met inlogmomenten (AuditLog auth.login.*) en gebeurtenissen
// (AnalyticsEvent: pagina's, kliks, interacties) die lib/analytics/meetkamer.ts
// ophaalt. Tijden in Nederlandse tijd (lib/time/amsterdam.ts), nooit getHours().
// ---------------------------------------------------------------------------

import { bucketCount, dayKeyNl, timelineKeys, type Period } from "@/lib/admin/period";
import { amsterdamParts } from "@/lib/time/amsterdam";

export interface LoginRij {
  userId: string;
  at: Date;
  /** true = gelukt; false = mislukt of geblokkeerd */
  ok: boolean;
}

export interface EventRij {
  userId: string | null;
  sessionId: string;
  path: string;
  type: string; // PAGEVIEW | CLICK | INTERACTION | CUSTOM
  label: string | null;
  at: Date;
}

/** Hoeveel gebeurtenissen per uur van de dag (0–23), in Nederlandse tijd. */
export function uurVerdeling(tijden: readonly Date[]): number[] {
  const uren = Array.from({ length: 24 }, () => 0);
  for (const t of tijden) {
    const u = amsterdamParts(t).hour;
    uren[u] = (uren[u] ?? 0) + 1;
  }
  return uren;
}

export const UUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

export interface GebruikerStand {
  userId: string;
  logins: number;
  mislukt: number;
  eersteLogin: Date | null;
  laatsteLogin: Date | null;
  paginas: number;
  kliks: number;
  acties: number;
  sessies: number;
  laatstGezien: Date | null;
  laatstePad: string | null;
  /** aantal verschillende dagen (NL) waarop iemand iets deed of inlogde */
  dagenActief: number;
}

/** Per account: inlogs en gedrag in de periode bij elkaar. */
export function perGebruiker(logins: readonly LoginRij[], events: readonly EventRij[]): Map<string, GebruikerStand> {
  const uit = new Map<string, GebruikerStand>();
  const sessies = new Map<string, Set<string>>();
  const dagen = new Map<string, Set<string>>();
  const leeg = (userId: string): GebruikerStand => ({ userId, logins: 0, mislukt: 0, eersteLogin: null, laatsteLogin: null, paginas: 0, kliks: 0, acties: 0, sessies: 0, laatstGezien: null, laatstePad: null, dagenActief: 0 });
  const van = (userId: string) => {
    let s = uit.get(userId);
    if (!s) {
      s = leeg(userId);
      uit.set(userId, s);
      sessies.set(userId, new Set());
      dagen.set(userId, new Set());
    }
    return s;
  };
  for (const l of logins) {
    const s = van(l.userId);
    dagen.get(l.userId)?.add(dayKeyNl(l.at));
    if (!l.ok) {
      s.mislukt += 1;
      continue;
    }
    s.logins += 1;
    if (!s.eersteLogin || l.at < s.eersteLogin) s.eersteLogin = l.at;
    if (!s.laatsteLogin || l.at > s.laatsteLogin) s.laatsteLogin = l.at;
  }
  for (const e of events) {
    if (!e.userId) continue;
    const s = van(e.userId);
    sessies.get(e.userId)?.add(e.sessionId);
    dagen.get(e.userId)?.add(dayKeyNl(e.at));
    if (e.type === "PAGEVIEW") s.paginas += 1;
    else if (e.type === "CLICK") s.kliks += 1;
    else s.acties += 1;
    if (!s.laatstGezien || e.at > s.laatstGezien) {
      s.laatstGezien = e.at;
      s.laatstePad = e.path;
    }
  }
  for (const s of uit.values()) {
    s.sessies = sessies.get(s.userId)?.size ?? 0;
    s.dagenActief = dagen.get(s.userId)?.size ?? 0;
  }
  return uit;
}

/** Hoeveel accounts in de periode twee keer of vaker inlogden ("opnieuw ingelogd"). */
export const telTerugkomers = (standen: Iterable<GebruikerStand>): number => [...standen].filter((s) => s.logins >= 2).length;

/** Hoeveel accounts op minstens twee verschillende dagen iets deden. */
export const telMeerdereDagen = (standen: Iterable<GebruikerStand>): number => [...standen].filter((s) => s.dagenActief >= 2).length;

/** Per dag (NL): hoeveel verschillende accounts iets deden of inlogden. */
export function actieveAccountsPerDag(logins: readonly LoginRij[], events: readonly EventRij[], period: Pick<Period, "days" | "bucket" | "to">): number[] {
  const perDag = new Map<string, Set<string>>();
  const tel = (userId: string | null, at: Date) => {
    if (!userId) return;
    const dag = dayKeyNl(at);
    const sleutel = period.bucket === "month" ? dag.slice(0, 7) : dag;
    let set = perDag.get(sleutel);
    if (!set) perDag.set(sleutel, (set = new Set()));
    set.add(userId);
  };
  for (const l of logins) if (l.ok) tel(l.userId, l.at);
  for (const e of events) tel(e.userId, e.at);
  return timelineKeys(period).map((k) => perDag.get(k)?.size ?? 0);
}

/** Inlogs per dag (alleen gelukte). */
export const loginsPerDag = (logins: readonly LoginRij[], period: Pick<Period, "days" | "bucket" | "to">): number[] =>
  bucketCount(
    logins.filter((l) => l.ok),
    (l) => l.at,
    period,
  );

export type TijdlijnSoort = "login" | "login-mislukt" | "pagina" | "klik" | "interactie" | "actie";

export interface TijdlijnItem {
  key: string;
  at: Date;
  soort: TijdlijnSoort;
  tekst: string;
  pad: string | null;
}

export interface AuditRij {
  id: string;
  action: string;
  summary: string;
  at: Date;
}

/** De tijdlijn van één account: inlogs, bekeken pagina's, kliks en andere vastgelegde acties, nieuwste eerst. */
export function tijdlijnVan(audit: readonly AuditRij[], events: readonly EventRij[], max = 600): TijdlijnItem[] {
  const items: TijdlijnItem[] = [];
  for (const a of audit) {
    if (a.action === "auth.login.succeeded") items.push({ key: `a-${a.id}`, at: a.at, soort: "login", tekst: "Ingelogd", pad: null });
    else if (a.action === "auth.login.failed" || a.action === "auth.login.locked") items.push({ key: `a-${a.id}`, at: a.at, soort: "login-mislukt", tekst: a.action === "auth.login.locked" ? "Inloggen geblokkeerd (te veel pogingen)" : "Inloggen mislukt", pad: null });
    else items.push({ key: `a-${a.id}`, at: a.at, soort: "actie", tekst: a.summary || a.action, pad: null });
  }
  events.forEach((e, i) => {
    if (e.type === "PAGEVIEW") items.push({ key: `e-${i}-${e.at.getTime()}`, at: e.at, soort: "pagina", tekst: `Bekeek ${e.path}`, pad: e.path });
    else if (e.type === "CLICK") items.push({ key: `e-${i}-${e.at.getTime()}`, at: e.at, soort: "klik", tekst: e.label ? `Klikte op "${e.label}"` : "Klikte", pad: e.path });
    else items.push({ key: `e-${i}-${e.at.getTime()}`, at: e.at, soort: "interactie", tekst: e.label ? `${e.type === "CUSTOM" ? "Gebeurtenis" : "Gebruikte"} ${e.label}` : e.type.toLowerCase(), pad: e.path });
  });
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, max);
}

/** De tijdlijn in dagen (NL), nieuwste dag eerst, voor de weergave. */
export function tijdlijnPerDag(items: readonly TijdlijnItem[]): { dag: string; items: TijdlijnItem[] }[] {
  const per = new Map<string, TijdlijnItem[]>();
  for (const it of items) {
    const dag = dayKeyNl(it.at);
    const lijst = per.get(dag);
    if (lijst) lijst.push(it);
    else per.set(dag, [it]);
  }
  return [...per.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([dag, lijst]) => ({ dag, items: lijst }));
}

// --- dekking: waar meten we wel en niet -------------------------------------

export interface Sectie {
  id: string;
  naam: string;
  /** padbegin(nen) die bij deze sectie horen; "/" alleen exact */
  paden: string[];
}

/** De delen van ZekerFlex die elk hun eigen meting horen te hebben. Volgorde = volgorde op het scherm. */
export const SECTIES: Sectie[] = [
  { id: "voorpagina", naam: "Voorpagina", paden: ["/"] },
  { id: "inloggen", naam: "Inloggen & aanmelden", paden: ["/login", "/register", "/wachtwoord", "/verifieer", "/uitnodiging"] },
  { id: "werker", naam: "Werker-app", paden: ["/dashboard"] },
  { id: "werkgever", naam: "Werkgevers-app", paden: ["/werkgever", "/studio"] },
  { id: "klussen", naam: "Klussen & vacatures", paden: ["/klussen", "/open-diensten", "/freelance-werk", "/personeel-inhuren", "/klus-plaatsen"] },
  { id: "marketing", naam: "Marketing-pagina's", paden: ["/aanbod", "/prijzen", "/bedrijven", "/voor-freelancers", "/uitzendbureau", "/flexwerk", "/over-ons", "/kennis", "/nieuws", "/contact", "/demo", "/app", "/apps", "/producten", "/rekentools", "/developers"] },
  { id: "online", naam: "Online tools (verborgen)", paden: ["/online", "/website-maken", "/logo-maker", "/advertentie-op-maat", "/domeinnaam", "/starters", "/website-check", "/review-check", "/rijschool-software", "/apps-en-spelletjes", "/website-check"] },
  { id: "shop", naam: "Webshop (verborgen)", paden: ["/shop", "/verkopen"] },
  { id: "beheer", naam: "Beheer", paden: ["/admin"] },
  { id: "overig", naam: "Overig", paden: [] },
];

/** Bij welke sectie hoort een pad. */
export function sectieVan(path: string): string {
  const p = path.split("?")[0] ?? "/";
  if (p === "/") return "voorpagina";
  for (const s of SECTIES) {
    if (s.id === "voorpagina" || s.id === "overig") continue;
    if (s.paden.some((b) => p === b || p.startsWith(`${b}/`))) return s.id;
  }
  return "overig";
}

export interface DekkingRij {
  id: string;
  naam: string;
  paginas: number;
  weergaven: number;
  kliks: number;
  accounts: number;
  /** "goed" = pagina's én kliks gemeten; "deels" = alleen pagina's; "niets" = geen enkele gebeurtenis */
  stand: "goed" | "deels" | "niets";
}

/** Per sectie: hoeveel pagina's, weergaven, kliks en accounts we zagen, en of de meting daar werkt. */
export function dekking(padTelling: readonly { path: string; type: string; count: number }[], ingelogd: readonly EventRij[]): DekkingRij[] {
  const per = new Map<string, { paden: Set<string>; weergaven: number; kliks: number; accounts: Set<string> }>();
  const van = (id: string) => {
    let r = per.get(id);
    if (!r) per.set(id, (r = { paden: new Set(), weergaven: 0, kliks: 0, accounts: new Set() }));
    return r;
  };
  for (const t of padTelling) {
    const r = van(sectieVan(t.path));
    r.paden.add(t.path);
    if (t.type === "PAGEVIEW") r.weergaven += t.count;
    else if (t.type === "CLICK") r.kliks += t.count;
  }
  for (const e of ingelogd) if (e.userId) van(sectieVan(e.path)).accounts.add(e.userId);
  return SECTIES.map((s) => {
    const r = per.get(s.id);
    const weergaven = r?.weergaven ?? 0;
    const kliks = r?.kliks ?? 0;
    return { id: s.id, naam: s.naam, paginas: r?.paden.size ?? 0, weergaven, kliks, accounts: r?.accounts.size ?? 0, stand: weergaven > 0 && kliks > 0 ? "goed" : weergaven > 0 ? "deels" : "niets" };
  });
}

/** De meest geklikte dingen op één pagina, met aandeel. */
export function topLabels(rijen: readonly { label: string | null; count: number }[], n = 25): { label: string; count: number; aandeel: number }[] {
  const totaal = rijen.reduce((s, r) => s + r.count, 0);
  return rijen
    .filter((r) => r.label)
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((r) => ({ label: r.label as string, count: r.count, aandeel: totaal > 0 ? Math.round((r.count / totaal) * 100) : 0 }));
}

/** Scroldiepte op een pagina: hoeveel sessies 25/50/75/100 % haalden (labels "scroll:25" …). */
export function scrolDiepte(rijen: readonly { label: string | null; count: number }[]): { diepte: number; count: number }[] {
  return [25, 50, 75, 100].map((d) => ({ diepte: d, count: rijen.find((r) => r.label === `scroll:${d}`)?.count ?? 0 }));
}

/** Waar ging iemand vanaf de voorpagina heen: de eerste volgende pagina binnen dezelfde sessie. */
export function volgendeNaVoorpagina(paginas: readonly { sessionId: string; path: string; at: Date }[], n = 12): { path: string; count: number }[] {
  const perSessie = new Map<string, { path: string; at: Date }[]>();
  for (const p of paginas) {
    const l = perSessie.get(p.sessionId);
    if (l) l.push(p);
    else perSessie.set(p.sessionId, [p]);
  }
  const tel = new Map<string, number>();
  for (const lijst of perSessie.values()) {
    lijst.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let i = 0; i < lijst.length - 1; i++) {
      if (lijst[i]?.path !== "/") continue;
      const volgende = lijst[i + 1]?.path;
      if (!volgende || volgende === "/") continue;
      tel.set(volgende, (tel.get(volgende) ?? 0) + 1);
      break; // één keer per sessie
    }
  }
  return [...tel.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([path, count]) => ({ path, count }));
}
