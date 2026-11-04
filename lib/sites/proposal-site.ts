import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { importRemoteImage } from "@/lib/media/clean-image";
import { zonderDubbeleFotos } from "@/lib/sites/foto-afdruk";
import { textOn } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
import { addMedia, createSite, markProposal, publishSite, saveSite } from "@/lib/sites/store";
import { SECTOR_TEMPLATES, isHexColor, newBlock, type Block, type BlockProps, type BlockType, type Company, type Media, type Page, type SectorTemplate, type SiteDoc, type SiteProposalMark, type Theme } from "@/lib/sites/types";
import { clipSentences, type BusinessFacts } from "@/lib/website-check/proposal";
import type { RijkeFeiten } from "@/lib/website-check/inlezen";

// ---------------------------------------------------------------------------
// The new website in a website proposal (lib/sales/website-proposal.ts). Built
// from what the company's current site says about itself — name, contact
// details, its services in its own words, its own photos and logo — in the
// luxe style, with what the check found missing put right: a privacy statement,
// a contact form, a WhatsApp button, a clear call to action, room for reviews
// and opening hours. What we cannot know (hours, reviews) is shown as a marked
// example, never as a fact. Pure functions first; buildProposalSite fetches
// the photos and saves the site.
// ---------------------------------------------------------------------------

/** What the sales lead adds when the site itself says nothing. */
export interface ProposalLead {
  naam: string | null;
  plaats: string | null;
  kvk: string | null;
  sector: string | null;
}

const SECTOR_WORDS: [string, RegExp][] = [
  ["horeca", /restaurant|caf[eé]|bistro|brasserie|eetcaf|lunchroom|catering|bakker|banket|patisserie|hotel|pizzeria|snackbar|grill|\bbar\b|koffie|ijssalon|slager|traiteur|horeca|\beten\b|drinken|borrel|\bdiner\b|\blunch\b|ontbijt|terras|tapas|wijnbar|brouwerij|\bfood/i],
  ["bouw", /bouw|aannem|schilder|stukad|timmer|loodgiet|installat|elektr|dakdek|\bdak|tegel|klus|renovat|metsel|vloer|badkamer|glaszet|hovenier|tuin|stratenma|sloop|isolat|kozijn/i],
  ["schoonmaak", /schoonma|glazenwas|reinig|facilit|hygi[eë]n/i],
  ["logistiek", /transport|logistiek|koerier|verhuis|opslag|vracht|expeditie|distributie|bezorg/i],
  ["zorg", /zorg|fysio|therap|praktijk|tandarts|huisarts|kraam|welzijn|psycholo|verpleeg|pedicure|massage/i],
];

/** The sector template that fits the name, headings and lead sector; the general one when nothing fits. */
export function templateFor(text: string): SectorTemplate {
  const id = SECTOR_WORDS.find(([, re]) => re.test(text))?.[0] ?? "algemeen";
  return SECTOR_TEMPLATES.find((t) => t.id === id) ?? SECTOR_TEMPLATES[0]!;
}

/** The forest green whose dark tones are exactly those of schwarzwald.zekerflex.com (night #0A120E, forest, moss). */
export const SCHWARZWALD_GROEN = "#325A46";
/** Their orange: the accent when a company has no light colour of its own. */
export const SCHWARZWALD_ORANJE = "#FF5F1F";

/**
 * Their own colour where it carries white text, otherwise as the accent; the Schwarzwald green and
 * orange when they have none. In the beleving style, exactly like schwarzwald.zekerflex.com (since
 * 4 Nov 2026; earlier proposals keep "premium" or "luxe").
 */
export function proposalTheme(brand: string | null, template: SectorTemplate, logo: string | null): Theme {
  void template;
  const own = brand && isHexColor(brand) ? brand : null;
  const dark = own !== null && textOn(own) === "#ffffff";
  return { kleur: dark ? own : SCHWARZWALD_GROEN, accent: own && !dark ? own : SCHWARZWALD_ORANJE, lettertype: "modern", hoeken: "rond", stijl: "beleving", logo };
}

const THREE_DIGIT_AREAS = new Set(["010", "013", "015", "020", "023", "024", "026", "030", "033", "035", "036", "038", "040", "043", "045", "046", "050", "053", "055", "058", "070", "071", "072", "073", "074", "075", "076", "077", "078", "079", "085", "088", "097"]);

/** "0548123456" → "0548 123 456", "0612345678" → "06 1234 5678"; anything else as it came. */
export function formatPhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+31")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0031")) d = `0${d.slice(4)}`;
  if (!/^0\d{9}$/.test(d)) return raw.trim().slice(0, 30);
  if (d.startsWith("06")) return `06 ${d.slice(2, 6)} ${d.slice(6)}`;
  if (THREE_DIGIT_AREAS.has(d.slice(0, 3))) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

const NAME_NOISE = new Set(["b.v", "bv", "b.v.", "vof", "v.o.f", "holding", "het", "de", "en", "van", "the"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length >= 3 && !NAME_NOISE.has(w)));

/** The name the company uses on its own site, unless it has nothing in common with the registered name. */
export function proposalName(fromSite: string | null, fromLead: string | null): string {
  const site = fromSite?.trim() || "";
  const lead = fromLead?.trim() || "";
  if (site && (!lead || [...words(site)].some((w) => words(lead).has(w)))) return site.slice(0, 100);
  return (lead || site || "Je bedrijf").slice(0, 100);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function proposalCompany(f: BusinessFacts, lead: ProposalLead): Company {
  const socials = f.socials.map((u) => u.replace(/^http:\/\//i, "https://")).filter((u) => /^https:\/\/[^\s<>"']+$/.test(u) && u.length <= 300).slice(0, 6);
  return {
    naam: proposalName(f.naam, lead.naam),
    kvk: f.kvk ?? (lead.kvk && /^\d{8}$/.test(lead.kvk) ? lead.kvk : ""),
    straat: (f.straat ?? "").slice(0, 120),
    postcode: (f.postcode ?? "").slice(0, 10),
    plaats: (f.plaats ?? lead.plaats ?? "").slice(0, 80),
    telefoon: f.telefoon ? formatPhone(f.telefoon) : "",
    email: f.email && EMAIL.test(f.email) && f.email.length <= 200 ? f.email : "",
    ...(f.mobiel && f.telefoon ? { whatsapp: formatPhone(f.telefoon) } : {}),
    ...(socials.length ? { socials } : {}),
  };
}

export interface ProposalPhotos {
  hero: string | null;
  over: string | null;
  galerij: string[];
  /** one photo per service card, in the order of the services (since 4 Nov 2026); a missing one gets an accent tile */
  diensten?: string[] | undefined;
  /** every photo, for the photo page */
  alle?: string[] | undefined;
}

/** Photo counts that fill whole rows in the gallery (lib/sites/render.ts galleryClass). */
const VOLLE_RIJEN = [12, 9, 8, 6, 5, 4, 3, 2];
export const volleRij = (n: number, max: number) => VOLLE_RIJEN.find((k) => k <= Math.min(n, max)) ?? 0;

/**
 * A wide photo for the opening, the next one beside the "about" text, then (when there are services) one per
 * service card, and a gallery that fills whole rows with what is left.
 */
export function pickPhotos(media: Pick<Media, "id" | "width" | "height">[], dienstenAantal = 0): ProposalPhotos {
  const wide = media.find((m) => m.width >= m.height * 1.2 && m.width >= 900) ?? media.find((m) => m.width >= 900);
  const rest = media.filter((m) => m.id !== wide?.id);
  const pool = rest.slice(1).map((m) => m.id);
  if (dienstenAantal <= 0) return { hero: wide?.id ?? null, over: rest[0]?.id ?? null, galerij: pool.length >= 2 ? pool.slice(0, 6) : [] };
  const kaarten = pool.slice(0, Math.min(dienstenAantal, 6));
  const over = pool.slice(kaarten.length);
  return {
    hero: wide?.id ?? null,
    over: rest[0]?.id ?? null,
    diensten: kaarten,
    galerij: over.slice(0, volleRij(over.length, 6)),
    alle: media.map((m) => m.id).slice(0, volleRij(media.length, 12)),
  };
}

const fill = (s: string, c: Company) =>
  s
    .replaceAll("{bedrijf}", c.naam)
    .replaceAll("{plaats} en omgeving", c.plaats ? `${c.plaats} en omgeving` : "de regio")
    .replaceAll("{plaats}", c.plaats || "de regio");

/** "Binnenschilderwerk", "Buitenschilderwerk", "Behangen" → "Binnenschilderwerk, buitenschilderwerk en behangen". */
export function listOf(items: string[]): string {
  const low = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);
  const parts = items.map((s, i) => (i === 0 ? s : low(s)));
  if (parts.length <= 1) return parts[0] ?? "";
  // "Banket en croissants" in the list: commas only, or the "en"s run together
  if (parts.some(hasEn)) return parts.join(", ");
  return `${parts.slice(0, -1).join(", ")} en ${parts[parts.length - 1]}`;
}
const hasEn = (s: string) => /\sen\s/i.test(s);

/** What Google shows under the title (50 to 160 characters works best): the hero line, topped up with the first words about the company. */
export const homeDescription = (heroTekst: string, over: string) => clipSentences(heroTekst.length >= 90 ? heroTekst : `${heroTekst} ${over}`.trim(), 160);

/** What a reading of their whole site adds (lib/website-check/inlezen.ts); all optional, so plain facts still work. */
export type ProposalFacts = BusinessFacts & Partial<Pick<RijkeFeiten, "overTekst" | "uren" | "faq" | "getuigenissen" | "usps" | "sinds" | "google">>;

const komma = (n: number) => n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const getal = (n: number) => n.toLocaleString("nl-NL");

/** "Zo simpel is het": three plain steps per kind of business, no promises about prices or times. */
function stappenVoor(t: SectorTemplate, c: Company): { titel: string; tekst: string }[] {
  const bel = c.telefoon ? `Bel ${c.telefoon}, app of stuur een bericht.` : "Stuur een bericht via het formulier.";
  if (t.id === "horeca") {
    return [
      { titel: "Kies je moment", tekst: `Reserveer of bestel vooraf. ${bel}` },
      { titel: "Kom langs", tekst: `We heten je welkom${c.plaats ? ` in ${c.plaats}` : ""}.` },
      { titel: "Geniet", tekst: `Van alles wat ${c.naam} voor je klaarmaakt.` },
    ];
  }
  if (t.id === "zorg") {
    return [
      { titel: "Neem contact op", tekst: bel },
      { titel: "Kennismaken", tekst: "We bespreken je vraag en wat bij je past." },
      { titel: "Samen verder", tekst: `${c.naam} staat voor je klaar.` },
    ];
  }
  return [
    { titel: "Neem contact op", tekst: `Vertel wat je nodig hebt. ${bel}` },
    { titel: "Advies op maat", tekst: "We bespreken de mogelijkheden en wat het kost." },
    { titel: "Aan de slag", tekst: `${c.naam} gaat voor je aan de slag.` },
  ];
}

/**
 * The pages of the proposal, from what their own site (and Google) says: home, their offer, about, photos and
 * contact. Since 4 Nov 2026 only real data: their own opening hours, questions, customer stories and strengths;
 * what we don't know is left out instead of shown as an example. Every text fits the builder's limits.
 */
export function proposalPages(c: Company, t: SectorTemplate, f: ProposalFacts, photos: ProposalPhotos, newId: () => string, nu = new Date()): Page[] {
  const block = <T extends BlockType>(type: T, props: Partial<BlockProps[T]>) => {
    const b = newBlock(type, newId());
    return { ...b, props: { ...b.props, ...props } } as Block;
  };
  const kop = (s: string) => s.slice(0, 160);
  const horeca = t.id === "horeca";
  const kaartFoto = (i: number) => photos.diensten?.[i] ?? null;
  const alleDiensten = f.secties.length
    ? f.secties.slice(0, 12).map((s, i) => ({ titel: s.kop.slice(0, 200), tekst: s.tekst, ...(kaartFoto(i) ? { foto: kaartFoto(i) } : {}) }))
    : t.diensten.map((d, i) => ({ titel: fill(d.titel, c), tekst: fill(d.tekst, c), ...(kaartFoto(i) ? { foto: kaartFoto(i) } : {}) }));
  const namen = f.secties.slice(0, 3).map((s) => s.kop);
  // "Binnenschilderwerk en buitenschilderwerk in Rijssen en omgeving." — a list with commas only gets the place as its own sentence
  const waar = c.plaats ? (namen.some(hasEn) ? `. In ${c.plaats} en omgeving` : ` in ${c.plaats} en omgeving`) : "";
  const heroTekst = namen.length >= 2 ? `${listOf(namen)}${waar}.` : fill(t.heroTekst, c);
  const knop = horeca ? "Reserveer of bestel" : t.id === "zorg" ? "Neem contact op" : "Vraag een offerte aan";
  const over = f.intro ?? fill(t.over, c);
  const overLang = f.overTekst ?? over;

  // their strengths, only facts: Google score, since when, their own list, direct contact
  const usps: { titel: string; tekst: string }[] = [];
  if (f.google && f.google.rating >= 4 && f.google.aantal >= 5) usps.push({ titel: `${komma(f.google.rating)} op Google`, tekst: `Gemiddeld, uit ${getal(f.google.aantal)} reviews van klanten.` });
  if (f.sinds) usps.push({ titel: `Sinds ${f.sinds}`, tekst: `Al ${nu.getUTCFullYear() - f.sinds} jaar${c.plaats ? ` in ${c.plaats}` : ""}.` });
  for (const u of f.usps ?? []) usps.push({ titel: u.slice(0, 200), tekst: "" });
  if (c.whatsapp) usps.push({ titel: "Direct contact", tekst: `Bel of app ${c.whatsapp}.` });

  const reviews = (f.getuigenissen ?? []).length
    ? block("reviews", {
        kop: "Wat klanten zeggen",
        // the stars only where their own site shows them (0 = no stars row)
        items: (f.getuigenissen ?? []).slice(0, 6).map((g) => ({ naam: g.naam.slice(0, 200), tekst: clipSentences(g.tekst, 600), sterren: g.sterren ?? 0 })),
      })
    : null;
  const uren = (f.uren ?? []).length ? block("openingstijden", { kop: "Openingstijden", regels: (f.uren ?? []).slice(0, 10) }) : null;
  const googleRegel = f.google && f.google.rating >= 4 ? ` Klanten geven ons een ${komma(f.google.rating)} op Google.` : "";
  const cta = block("cta", {
    kop: kop(horeca ? `Tot snel bij ${c.naam}` : `Benieuwd wat ${c.naam} voor je kan doen?`),
    tekst: (c.telefoon ? `Bel ${c.telefoon} of stuur een bericht, dan nemen we snel contact met je op.` : "Stuur ons een bericht, dan nemen we snel contact met je op.") + googleRegel,
    knop: "Neem contact op",
    knopLink: "contact",
  });
  const aanbodPagina = alleDiensten.length >= 4;
  const fotoPagina = (photos.alle ?? []).length >= 6;

  // the order of schwarzwald.zekerflex.com: opening, about, the offer as photo tiles, strengths, steps, photos, reviews, closing
  const home: Block[] = [
    block("hero", { kop: kop(c.naam), tekst: heroTekst, knop, knopLink: "contact", foto: photos.hero }),
    block("tekstFoto", { kop: kop(`Over ${c.naam}`), tekst: clipSentences(over, 420), foto: photos.over, fotoLinks: false }),
    block("diensten", { kop: horeca ? "Ons aanbod" : "Wat we doen", items: alleDiensten.slice(0, 6) }),
    ...(usps.length >= 2 ? [block("usps", { kop: `Waarom ${c.naam}`.slice(0, 160), items: usps.slice(0, 4) })] : []),
    block("stappen", { kop: "Zo simpel is het", items: stappenVoor(t, c) }),
    ...(photos.galerij.length >= 2 ? [block("galerij", { kop: horeca ? "Sfeer en smaak" : t.id === "bouw" ? "Ons werk" : "Een indruk", fotos: photos.galerij })] : []),
    ...(reviews ? [reviews] : []),
    ...(uren && horeca ? [uren] : []),
    cta,
  ];
  const eerste = namen[0] ?? t.naam;
  const pages: Page[] = [
    {
      id: newId(),
      slug: "",
      titel: "Home",
      seoTitel: (c.plaats ? `${c.naam} | ${eerste} in ${c.plaats}` : `${c.naam} | ${eerste}`).slice(0, 70),
      seoOmschrijving: homeDescription(heroTekst, over),
      blocks: home,
    },
  ];
  if (aanbodPagina) {
    pages.push({
      id: newId(),
      slug: "aanbod",
      titel: horeca ? "Aanbod" : "Diensten",
      seoTitel: `${horeca ? "Aanbod" : "Diensten"} | ${c.naam}`.slice(0, 70),
      seoOmschrijving: clipSentences(`${listOf(alleDiensten.slice(0, 4).map((d) => d.titel))}${waar}. Bekijk alles wat ${c.naam} voor je doet.`, 160),
      blocks: [block("diensten", { kop: horeca ? "Ons aanbod" : "Onze diensten", items: alleDiensten }), cta],
    });
  }
  pages.push({
    id: newId(),
    slug: "over-ons",
    titel: "Over ons",
    seoTitel: `Over ${c.naam}`.slice(0, 70),
    seoOmschrijving: clipSentences(over, 160),
    blocks: [
      block("tekstFoto", { kop: kop(`Over ${c.naam}`), tekst: overLang, foto: photos.over ?? photos.hero, fotoLinks: true }),
      ...(usps.length >= 2 ? [block("usps", { kop: "Waarom klanten voor ons kiezen", items: usps.slice(0, 6) })] : []),
      ...((f.faq ?? []).length ? [block("faq", { kop: "Veelgestelde vragen", items: (f.faq ?? []).map((q) => ({ vraag: q.vraag.slice(0, 200), antwoord: q.antwoord })) })] : []),
    ],
  });
  if (fotoPagina) {
    pages.push({
      id: newId(),
      slug: "fotos",
      titel: horeca ? "Sfeer" : t.id === "bouw" ? "Ons werk" : "Foto's",
      seoTitel: `Foto's | ${c.naam}`.slice(0, 70),
      seoOmschrijving: clipSentences(`Foto's van ${c.naam}${c.plaats ? ` in ${c.plaats}` : ""}: een indruk van ons werk, onze zaak en onze mensen.`, 160),
      blocks: [block("galerij", { kop: horeca ? "Sfeer en smaak" : t.id === "bouw" ? "Ons werk" : "Een indruk", fotos: photos.alle ?? [] }), cta],
    });
  }
  pages.push({
    id: newId(),
    slug: "contact",
    titel: "Contact",
    seoTitel: `Contact | ${c.naam}`.slice(0, 70),
    seoOmschrijving: clipSentences(`Neem contact op met ${c.naam}${c.plaats ? ` in ${c.plaats}` : ""}. ${c.telefoon ? `Bel ${c.telefoon} of stuur` : "Stuur"} een bericht via het formulier, dan reageren we snel.`, 160),
    blocks: [block("contact", { kop: "Neem contact op", tekst: `Heb je een vraag of wil je een afspraak maken? Laat het ${c.naam} weten.`, formulier: true }), ...(uren ? [uren] : [])],
  });
  return pages;
}

const rid = () => `b${randomBytes(6).toString("hex")}`;

export interface ProposalSiteInput {
  proposalId: string;
  facts: ProposalFacts;
  lead: ProposalLead;
  mark: SiteProposalMark;
  by: { userId: string; name: string };
}

/** Make, fill and publish the proposal's website at zekerflex.com/site/<bedrijfsnaam>. */
export async function buildProposalSite(input: ProposalSiteInput): Promise<SiteDoc> {
  const { facts, lead } = input;
  const template = templateFor([facts.naam, lead.naam, lead.sector, ...facts.koppen].filter(Boolean).join(" "));
  const bedrijf = proposalCompany(facts, lead);
  const site = await createSite(`voorstel:${input.proposalId}`, input.by, { templateId: template.id, bedrijf });

  // their own logo and photos, fetched once and served from here (img-src stays 'self')
  let logo: string | null = null;
  if (facts.logo) {
    try {
      const image = await importRemoteImage(facts.logo);
      logo = (await addMedia(site.id, image, { alt: `Logo van ${bedrijf.naam}`, bron: "internet", sourceUrl: facts.logo })).id;
    } catch (err) {
      logger.info("proposal logo skipped", { siteId: site.id, reason: String(err) });
    }
  }
  // up to 16 of their photos: downloaded four at a time, then stored one by one (addMedia rewrites the
  // site document, so storing in parallel would lose photos); the order of their site is kept
  const opgehaald: (Awaited<ReturnType<typeof importRemoteImage>> | null)[] = new Array(Math.min(facts.fotos.length, 16)).fill(null);
  const rij = facts.fotos.slice(0, 16).map((url, i) => ({ url, i }));
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let next = rij.shift(); next; next = rij.shift()) {
        try {
          const image = await importRemoteImage(next.url);
          // icons and thumbnails don't make a luxe page
          if (Math.max(image.width, image.height) >= 500) opgehaald[next.i] = image;
        } catch (err) {
          logger.info("proposal photo skipped", { siteId: site.id, reason: String(err) });
        }
      }
    }),
  );
  // the same photo under two addresses (another size, another name) counts once: the largest stays
  const uniek = await zonderDubbeleFotos(opgehaald, facts.fotos.slice(0, 16));
  const fotos: Media[] = [];
  for (const [i, image] of uniek.fotos.entries()) {
    if (!image) continue;
    fotos.push(await addMedia(site.id, image, { alt: `Foto van ${bedrijf.naam}`, bron: "internet", sourceUrl: uniek.bron[i] ?? image.sourceUrl }));
  }

  const theme = proposalTheme(facts.kleur, template, logo);
  const dienstenAantal = facts.secties.length || template.diensten.length;
  // the same check as the builder's own saves: a page from someone else's text must still fit
  const doc = siteSaveSchema.parse({ theme, bedrijf, pages: proposalPages(bedrijf, template, facts, pickPhotos(fotos, dienstenAantal), rid) });
  await saveSite(site.id, doc);
  await markProposal(site.id, input.mark);
  return publishSite(site.id, input.by);
}
