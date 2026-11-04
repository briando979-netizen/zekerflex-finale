import { clipSentences, extractBusiness, type BusinessFacts } from "@/lib/website-check/proposal";

// ---------------------------------------------------------------------------
// De hele website van een bedrijf inlezen, niet alleen de homepage (4 nov 2026):
// de eigenaar vond de nieuwe sites uit de gratis check onvolledig, met
// voorbeeldtijden en voorbeeldreviews in plaats van hun eigen gegevens. Hier de
// pure kant: welke subpagina's lezen we (over ons, aanbod/menu, werk, contact,
// veelgestelde vragen, reviews), en wat halen we eruit — openingstijden,
// vragen met antwoord, klantverhalen, sterke punten, "sinds 1998", de tekst van
// "over ons" — en hoe voegen we de pagina's samen. Het ophalen (SSRF-veilig) en
// Google staan in inlezen-site.ts. Alleen wat er echt staat; niets verzonnen.
// ---------------------------------------------------------------------------

export type PaginaSoort = "home" | "aanbod" | "over" | "werk" | "contact" | "faq" | "reviews";

/** Per soort subpagina: woorden in het adres of de linktekst. Volgorde = voorrang. */
const SOORTEN: [Exclude<PaginaSoort, "home">, RegExp][] = [
  ["aanbod", /diensten|dienst\b|aanbod|services?\b|behandeling|producten|assortiment|menukaart|\bmenu\b|\bkaart\b|gerechten|lunch|diner|prijzen|tarieven|wat-we-doen|wat we doen|werkzaamheden|specialisaties|cursus|lessen|arrangement|activiteiten/i],
  ["over", /over-?ons|over ons|\bover\b|about|wie-?zijn-?wij|wie zijn wij|ons-?verhaal|ons verhaal|historie|geschiedenis|het team|ons team/i],
  ["werk", /projecten|portfolio|galerij|gallery|\bfoto'?s?\b|fotos|realisaties|ons-?werk|ons werk|referenties|impressie/i],
  ["contact", /contact|\broute\b|openingstijden|bereikbaarheid|locatie/i],
  ["faq", /\bfaq\b|veelgestelde|veel gestelde|vragen/i],
  ["reviews", /reviews?\b|ervaringen|recensies|testimonials?|klantverhalen|beoordelingen/i],
];
const NOOIT = /privacy|cookie|voorwaarden|disclaimer|login|inloggen|account|winkelwagen|winkelmand|\bcart\b|checkout|wp-admin|wp-login|\/feed|\/tag\/|\/category\/|\/author\/|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4)$/i;
/** Hooguit zoveel pagina's per soort (aanbod mag er twee zijn, bv. "lunch" en "diner"). */
const PER_SOORT: Record<Exclude<PaginaSoort, "home">, number> = { aanbod: 2, over: 1, werk: 1, contact: 1, faq: 1, reviews: 1 };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", euro: "€", hellip: "…", ndash: "–", mdash: "—" };
export function ontsnap(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (ENT[k] !== undefined) return ENT[k]!;
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)) || 32);
    return m;
  });
}
const plat = (html: string) => ontsnap(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const zonderCode = (html: string) => html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");

/** De zichtbare tekst van een pagina met regels: elk blok-element op een eigen regel. */
export function tekstVan(html: string): string {
  return ontsnap(
    zonderCode(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|td|th|tr|dt|dd|address|span|section|article|summary)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n[\s]*/g, "\n")
    .trim();
}

const zelfdeSite = (a: string, b: string) => a.toLowerCase().replace(/^www\./, "") === b.toLowerCase().replace(/^www\./, "");

/** De subpagina's die het lezen waard zijn, in volgorde van de soorten; hooguit `max`. */
export function kiesSubpaginas(html: string, finalUrl: string, max = 6): { url: string; soort: PaginaSoort }[] {
  const basis = new URL(finalUrl);
  const gekozen: { url: string; soort: PaginaSoort }[] = [];
  const gezien = new Set<string>([basis.origin + basis.pathname.replace(/\/+$/, "")]);
  const links: { url: string; label: string }[] = [];
  for (const m of zonderCode(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1] ?? "");
    const raw = href ? ontsnap(href[1] ?? href[2] ?? href[3] ?? "") : "";
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|whatsapp):/i.test(raw)) continue;
    let u: URL;
    try {
      u = new URL(raw, basis);
    } catch {
      continue;
    }
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !zelfdeSite(u.hostname, basis.hostname) || NOOIT.test(u.pathname)) continue;
    u.hash = "";
    const sleutel = u.origin + u.pathname.replace(/\/+$/, "");
    if (gezien.has(sleutel) || u.pathname.split("/").filter(Boolean).length > 3) continue;
    gezien.add(sleutel);
    links.push({ url: u.toString(), label: plat(m[2] ?? "").slice(0, 60) });
  }
  for (const [soort, re] of SOORTEN) {
    const passend = links.filter((l) => re.test(decodeURIComponentVeilig(new URL(l.url).pathname)) || re.test(l.label));
    for (const l of passend.slice(0, PER_SOORT[soort])) {
      if (gekozen.length >= max || gekozen.some((g) => g.url === l.url)) continue;
      gekozen.push({ url: l.url, soort });
    }
  }
  return gekozen;
}

function decodeURIComponentVeilig(s: string): string {
  try {
    return decodeURIComponent(s).replace(/[-_]/g, " ");
  } catch {
    return s;
  }
}

// --- openingstijden ------------------------------------------------------------

export interface UrenRegel {
  dag: string;
  tijd: string;
}

const DAGEN: [RegExp, string][] = [
  [/^ma(andag|\.)?$/i, "Maandag"],
  [/^di(nsdag|\.)?$/i, "Dinsdag"],
  [/^wo(ensdag|\.)?$/i, "Woensdag"],
  [/^do(nderdag|\.)?$/i, "Donderdag"],
  [/^vr(ijdag|\.)?$/i, "Vrijdag"],
  [/^za(terdag|\.)?$/i, "Zaterdag"],
  [/^zo(ndag|\.)?$/i, "Zondag"],
];
const DAG = "(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma\\.?|di\\.?|wo\\.?|do\\.?|vr\\.?|za\\.?|zo\\.?)";
const REGEL = new RegExp(`^(${DAG})(?:\\s*(?:t\\/m|tot en met|tot|-|–|—|&|en)\\s*(${DAG}))?(?=[\\s:.,–—-]|$)\\s*[:.,–—-]?\\s*(.*)$`, "i");
const TIJD = /(\d{1,2})[:.](\d{2})\s*(?:uur\s*)?(?:-|–|—|tot|t\/m)\s*(\d{1,2})[:.](\d{2})/g;
const dagNaam = (s: string) => DAGEN.find(([re]) => re.test(s.trim()))?.[1] ?? null;
const uur = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

function tijdVan(rest: string): string | null {
  const reeksen = [...rest.matchAll(TIJD)].filter((t) => Number(t[1]) <= 24 && Number(t[3]) <= 24).map((t) => `${uur(t[1]!, t[2]!)} – ${uur(t[3]!, t[4]!)}`);
  if (reeksen.length) return reeksen.slice(0, 3).join(" en ");
  if (/^\s*(gesloten|dicht|closed)\b/i.test(rest)) return "Gesloten";
  if (/^\s*(op afspraak|alleen op afspraak|volgens afspraak)/i.test(rest)) return "Op afspraak";
  return null;
}

/** Openingstijden uit de tekst van een pagina (of uit Google: "maandag: 09:00–17:00"). Leeg als het er niet duidelijk staat. */
export function leesOpeningstijden(tekst: string): UrenRegel[] {
  const regels = tekst.split("\n").map((r) => r.trim()).filter(Boolean);
  const uit: UrenRegel[] = [];
  for (let i = 0; i < regels.length && uit.length < 10; i++) {
    const r = regels[i]!;
    if (r.length > 80) continue;
    const m = REGEL.exec(r);
    if (!m) continue;
    const van = dagNaam(m[1]!);
    const tot = m[2] ? dagNaam(m[2]) : null;
    if (!van) continue;
    // "Maandag" op de ene regel en "09:00 - 17:00" op de volgende (tabellen)
    let tijd = tijdVan(m[3] ?? "");
    if (!tijd && !(m[3] ?? "").trim() && regels[i + 1] && regels[i + 1]!.length <= 60) {
      tijd = tijdVan(regels[i + 1]!);
      if (tijd) i++;
    }
    if (!tijd) continue;
    const dag = tot && tot !== van ? `${van} t/m ${tot.toLowerCase()}` : van;
    if (!uit.some((u) => u.dag === dag)) uit.push({ dag, tijd });
  }
  // één losse regel is te weinig zekerheid, tenzij het een reeks dagen is ("Ma t/m vr 9:00 – 17:00")
  return uit.length >= 2 || (uit.length === 1 && uit[0]!.dag.includes("t/m")) ? uit : [];
}

// --- veelgestelde vragen ----------------------------------------------------------

export function leesFaq(html: string): { vraag: string; antwoord: string }[] {
  const schoon = zonderCode(html);
  const vragen = [...schoon.matchAll(/<(h[2-5]|summary|dt|strong|b|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => ({ eind: (m.index ?? 0) + m[0].length, begin: m.index ?? 0, vraag: plat(m[2] ?? "") }))
    .filter((v) => v.vraag.endsWith("?") && v.vraag.length >= 10 && v.vraag.length <= 200);
  const uit: { vraag: string; antwoord: string }[] = [];
  vragen.forEach((v, i) => {
    if (uit.length >= 8 || uit.some((u) => u.vraag === v.vraag)) return;
    const stuk = schoon.slice(v.eind, Math.min(vragen[i + 1]?.begin ?? v.eind + 2000, v.eind + 2000));
    const antwoord = plat(stuk.split(/<h[1-5]\b/i)[0] ?? "");
    if (antwoord.length >= 20 && !/cookie|©|copyright/i.test(antwoord)) uit.push({ vraag: v.vraag, antwoord: clipSentences(antwoord, 500) });
  });
  return uit;
}

// --- klantverhalen op hun eigen site ----------------------------------------------------

export interface Getuigenis {
  naam: string;
  tekst: string;
  /** alleen als de site zelf sterren toont */
  sterren: number | null;
}

export function leesGetuigenissen(html: string): Getuigenis[] {
  const schoon = zonderCode(html);
  const starts = [
    ...[...schoon.matchAll(/<blockquote\b[^>]*>/gi)].map((m) => m.index ?? 0),
    ...[...schoon.matchAll(/<(div|li|figure|article|section)\b[^>]*class\s*=\s*["'][^"']*(testimonial|getuigenis|klantervaring|review-item|reviewitem|quote|ervaring)[^"']*["'][^>]*>/gi)].map((m) => m.index ?? 0),
  ].sort((a, b) => a - b);
  const uit: Getuigenis[] = [];
  for (const start of starts) {
    if (uit.length >= 6) break;
    const stuk = schoon.slice(start, start + 1800).split(/<\/(blockquote|figure|article|li)>/i)[0] ?? "";
    const regels = tekstVan(stuk).split("\n").map((r) => r.trim()).filter(Boolean);
    const tekst = regels.filter((r) => r.length >= 30 && r.length <= 600 && !/cookie|©|copyright|privacy/i.test(r)).sort((a, b) => b.length - a.length)[0];
    if (!tekst || uit.some((g) => g.tekst === tekst)) continue;
    const cite = /<(cite|figcaption|strong|b|h[3-6])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(stuk.slice(stuk.indexOf(">") + 1));
    const kandidaat = cite ? plat(cite[2] ?? "") : regels.find((r) => /^[-–—~]\s*\S/.test(r))?.replace(/^[-–—~]\s*/, "") ?? "";
    const naam = kandidaat && kandidaat.length <= 40 && kandidaat !== tekst && !kandidaat.endsWith("?") ? kandidaat : "Een klant";
    const sterTeken = (stuk.match(/★/g) ?? []).length;
    const sterTekst = /([1-5])(?:[.,]0)?\s*(?:\/\s*5|van de 5|uit 5|sterren)/i.exec(tekstVan(stuk));
    const sterren = sterTeken >= 1 && sterTeken <= 5 ? sterTeken : sterTekst ? Number(sterTekst[1]) : null;
    uit.push({ naam, tekst: tekst.replace(/^["“„']+|["”']+$/g, "").trim(), sterren });
  }
  return uit;
}

// --- sterke punten, "sinds", over ons ----------------------------------------------------

/** Lijstjes onder een kop als "Waarom kiezen voor ons" of met vinkjes: hun eigen sterke punten. */
export function leesUsps(html: string): string[] {
  const schoon = zonderCode(html);
  const uit: string[] = [];
  const add = (li: string) => {
    const t = plat(li).replace(/^[✓✔☑•\-–]\s*/, "");
    if (t.length >= 6 && t.length <= 90 && !uit.includes(t) && !/cookie|privacy|©/i.test(t)) uit.push(t);
  };
  for (const m of schoon.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)) {
    if (!/waarom|voordelen|onze belofte|wat (wij|we) (bieden|beloven)|kenmerken|garantie|daarom|zekerheid/i.test(plat(m[1] ?? ""))) continue;
    const na = schoon.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 2500);
    const lijst = /<ul\b[\s\S]*?<\/ul>/i.exec(na.split(/<h[1-4]\b/i)[0] ?? "");
    for (const li of lijst?.[0].match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []) add(li);
  }
  for (const li of schoon.match(/<li\b[^>]*>\s*(?:<[^>]+>\s*)*[✓✔☑][\s\S]*?<\/li>/gi) ?? []) add(li);
  for (const li of schoon.match(/<li\b[^>]*class\s*=\s*["'][^"']*\bcheck[^"']*["'][^>]*>[\s\S]*?<\/li>/gi) ?? []) add(li);
  return uit.slice(0, 6);
}

/** "Sinds 1998", "opgericht in 2005": het jaar, als het een geloofwaardig jaar is. */
export function leesSinds(tekst: string, nu = new Date()): number | null {
  const m = /(?:sinds|opgericht in|actief sinds|al sinds|gestart in|begonnen in|since)\s+(?:het jaar\s+)?((?:18|19|20)\d{2})\b/i.exec(tekst);
  const jaar = m ? Number(m[1]) : NaN;
  return Number.isFinite(jaar) && jaar >= 1850 && jaar <= nu.getUTCFullYear() - 1 ? jaar : null;
}

/** De tekst van "over ons": hun alinea's van minstens een zin, aan elkaar, tot 1200 tekens. */
export function leesOverTekst(html: string): string | null {
  const alineas = (zonderCode(html).match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [])
    .map(plat)
    .filter((t) => t.length >= 60 && !/cookie|©|copyright|privacy|javascript|browser|kvk|btw/i.test(t));
  const uniek = alineas.filter((t, i) => alineas.indexOf(t) === i);
  return uniek.length ? clipSentences(uniek.join("\n\n"), 1200) : null;
}

// --- samenvoegen -------------------------------------------------------------------------

export interface GelezenPagina {
  url: string;
  soort: PaginaSoort;
  html: string;
}

export interface RijkeFeiten extends BusinessFacts {
  /** de tekst van hun "over ons" (alinea's gescheiden door een lege regel) */
  overTekst: string | null;
  /** hun eigen openingstijden (of die van Google); leeg = onbekend */
  uren: UrenRegel[];
  faq: { vraag: string; antwoord: string }[];
  getuigenissen: Getuigenis[];
  usps: string[];
  sinds: number | null;
  /** score op Google, alleen als het Google-profiel bij deze website hoort */
  google: { rating: number; aantal: number; mapsUrl: string | null } | null;
  /** de gelezen adressen */
  paginas: string[];
}

const eerste = <T>(...xs: (T | null | undefined)[]): T | null => xs.find((x) => x !== null && x !== undefined) ?? null;

/** Alle gelezen pagina's tot één set feiten: algemene gegevens van de homepage, de rest van de pagina die erover gaat. */
export function voegSamen(paginas: GelezenPagina[], nu = new Date()): RijkeFeiten {
  const home = paginas.find((p) => p.soort === "home") ?? paginas[0];
  if (!home) throw new Error("geen pagina's");
  const per = paginas.map((p) => ({ ...p, f: extractBusiness(p.html, p.url), tekst: tekstVan(p.html) }));
  const h = per.find((p) => p.url === home.url)!;
  const van = (soort: PaginaSoort) => per.filter((p) => p.soort === soort);
  const contact = van("contact")[0];
  const volgorde = (...soorten: PaginaSoort[]) => [...soorten.flatMap(van), ...per.filter((p) => !soorten.includes(p.soort))];

  // diensten: eerst van de aanbodpagina's, dan de homepage; geen vragen als dienst
  const secties: BusinessFacts["secties"] = [];
  for (const p of volgorde("aanbod", "home")) {
    for (const s of p.f.secties) {
      if (s.kop.endsWith("?")) continue;
      const al = secties.findIndex((x) => x.kop.toLowerCase() === s.kop.toLowerCase());
      // dezelfde dienst op twee pagina's: de versie mét uitleg wint
      if (al >= 0) {
        if (!secties[al]!.tekst && s.tekst) secties[al] = s;
        continue;
      }
      if (secties.length < 12) secties.push(s);
    }
  }
  const fotos = [...new Set(volgorde("home", "werk", "aanbod", "over").flatMap((p) => p.f.fotos))].slice(0, 24);
  const over = van("over")[0];
  const uren = eerste(...[contact, ...volgorde("contact", "home")].map((p) => (p ? leesOpeningstijden(p.tekst) : null)).filter((u) => u && u.length)) ?? [];
  const faq = volgorde("faq", "home", "contact").flatMap((p) => leesFaq(p.html)).filter((q, i, all) => all.findIndex((x) => x.vraag === q.vraag) === i).slice(0, 8);
  const getuigenissen = volgorde("reviews", "home", "over").flatMap((p) => leesGetuigenissen(p.html)).filter((g, i, all) => all.findIndex((x) => x.tekst === g.tekst) === i).slice(0, 6);
  const usps = [...new Set(volgorde("home", "over", "aanbod").flatMap((p) => leesUsps(p.html)))].slice(0, 6);
  const telefoon = eerste(h.f.telefoon, contact?.f.telefoon, ...per.map((p) => p.f.telefoon));

  return {
    ...h.f,
    naam: eerste(h.f.naam, ...per.map((p) => p.f.naam)),
    telefoon,
    email: eerste(h.f.email, contact?.f.email, ...per.map((p) => p.f.email)),
    straat: eerste(contact?.f.straat, h.f.straat, ...per.map((p) => p.f.straat)),
    postcode: eerste(contact?.f.postcode, h.f.postcode, ...per.map((p) => p.f.postcode)),
    plaats: eerste(contact?.f.plaats, h.f.plaats, ...per.map((p) => p.f.plaats)),
    kvk: eerste(h.f.kvk, ...per.map((p) => p.f.kvk)),
    socials: [...new Set(per.flatMap((p) => p.f.socials))].slice(0, 6),
    logo: eerste(h.f.logo, ...per.map((p) => p.f.logo)),
    fotos,
    koppen: [...new Set(per.flatMap((p) => p.f.koppen))].slice(0, 12),
    secties,
    intro: eerste(over?.f.intro, h.f.intro, ...per.map((p) => p.f.intro)),
    mobiel: telefoon ? /^(\+?31|0031|0)6\d{8}$/.test(telefoon) : false,
    whatsapp: per.some((p) => p.f.whatsapp),
    openingstijden: uren.length > 0 || per.some((p) => p.f.openingstijden),
    reviews: getuigenissen.length > 0 || per.some((p) => p.f.reviews),
    privacy: per.some((p) => p.f.privacy),
    boeken: per.some((p) => p.f.boeken),
    overTekst: over ? leesOverTekst(over.html) : null,
    uren,
    faq,
    getuigenissen,
    usps,
    sinds: eerste(...per.map((p) => leesSinds(p.tekst, nu))),
    google: null,
    paginas: per.map((p) => p.url),
  };
}
