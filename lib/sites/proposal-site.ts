import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";
import { importRemoteImage } from "@/lib/media/clean-image";
import { textOn } from "@/lib/sites/render";
import { siteSaveSchema } from "@/lib/sites/schema";
import { addMedia, createSite, markProposal, publishSite, saveSite } from "@/lib/sites/store";
import { SECTOR_TEMPLATES, isHexColor, newBlock, type Block, type BlockProps, type BlockType, type Company, type Media, type Page, type SectorTemplate, type SiteDoc, type SiteProposalMark, type Theme } from "@/lib/sites/types";
import { clipSentences, type BusinessFacts } from "@/lib/website-check/proposal";

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
  ["horeca", /restaurant|caf[eé]|bistro|brasserie|eetcaf|lunchroom|catering|bakker|banket|patisserie|hotel|pizzeria|snackbar|grill|\bbar\b|koffie|ijssalon|slager|traiteur|horeca/i],
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

const GOLD = "#B8925A";

/** Their own colour where it carries white text, otherwise as the accent; gold and the sector colour when they have none. */
export function proposalTheme(brand: string | null, template: SectorTemplate, logo: string | null): Theme {
  const own = brand && isHexColor(brand) ? brand : null;
  const dark = own !== null && textOn(own) === "#ffffff";
  return { kleur: dark ? own : template.theme.kleur, accent: own && !dark ? own : GOLD, lettertype: "klassiek", hoeken: "strak", stijl: "luxe", logo };
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
}

/** A wide photo for the opening, the next one beside the "about" text, and a gallery of 2 to 6 that fills whole rows. */
export function pickPhotos(media: Pick<Media, "id" | "width" | "height">[]): ProposalPhotos {
  const wide = media.find((m) => m.width >= m.height * 1.2 && m.width >= 900) ?? media.find((m) => m.width >= 900);
  const rest = media.filter((m) => m.id !== wide?.id);
  const pool = rest.slice(1).map((m) => m.id);
  return { hero: wide?.id ?? null, over: rest[0]?.id ?? null, galerij: pool.length >= 2 ? pool.slice(0, 6) : [] };
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
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} en ${parts[parts.length - 1]}`;
}

/** The pages of the proposal: home, about, contact. Every text fits the builder's limits (lib/sites/schema.ts). */
export function proposalPages(c: Company, t: SectorTemplate, f: BusinessFacts, photos: ProposalPhotos, newId: () => string): Page[] {
  const block = <T extends BlockType>(type: T, props: Partial<BlockProps[T]>) => {
    const b = newBlock(type, newId());
    return { ...b, props: { ...b.props, ...props } } as Block;
  };
  const kop = (s: string) => s.slice(0, 160);
  const horeca = t.id === "horeca";
  const diensten = f.secties.length
    ? f.secties.slice(0, 6).map((s) => ({ titel: s.kop.slice(0, 200), tekst: s.tekst }))
    : t.diensten.map((d) => ({ titel: fill(d.titel, c), tekst: fill(d.tekst, c) }));
  const namen = f.secties.slice(0, 3).map((s) => s.kop);
  const heroTekst = namen.length >= 2 ? `${listOf(namen)}${c.plaats ? ` in ${c.plaats} en omgeving` : ""}.` : fill(t.heroTekst, c);
  const knop = horeca ? "Reserveer of bestel" : t.id === "zorg" ? "Neem contact op" : "Vraag een offerte aan";
  const over = f.intro ?? fill(t.over, c);
  const reviews = block("reviews", {
    kop: "Wat klanten zeggen (voorbeeld)",
    items: [
      {
        naam: "Hier komt de naam van een klant",
        tekst: f.reviews ? "Hier komen jullie bestaande reviews te staan, netjes met sterren erbij." : "Hier komen de reviews van jullie klanten. Wij helpen je om ze na elke klus netjes op te vragen.",
        sterren: 5,
      },
    ],
  });
  const uren = block("openingstijden", {
    kop: "Openingstijden (voorbeeld)",
    regels: [
      { dag: "Maandag tot en met vrijdag", tijd: "08:00 – 17:00" },
      { dag: "Zaterdag", tijd: "Op afspraak" },
      { dag: "Zondag", tijd: "Gesloten" },
    ],
  });
  const home: Block[] = [
    block("hero", { kop: kop(c.naam), tekst: heroTekst, knop, knopLink: "contact", foto: photos.hero }),
    block("diensten", { kop: horeca ? "Ons aanbod" : "Wat we doen", items: diensten }),
    block("tekstFoto", { kop: kop(`Over ${c.naam}`), tekst: clipSentences(over, 320), foto: photos.over, fotoLinks: false }),
    ...(photos.galerij.length >= 2 ? [block("galerij", { kop: horeca ? "Sfeer en smaak" : t.id === "bouw" ? "Ons werk" : "Een indruk", fotos: photos.galerij })] : []),
    reviews,
    block("cta", {
      kop: kop(horeca ? `Tot snel bij ${c.naam}` : `Benieuwd wat ${c.naam} voor je kan doen?`),
      tekst: c.telefoon ? `Bel ${c.telefoon} of stuur een bericht, dan nemen we snel contact met je op.` : "Stuur ons een bericht, dan nemen we snel contact met je op.",
      knop: "Neem contact op",
      knopLink: "contact",
    }),
  ];
  const eerste = namen[0] ?? t.naam;
  return [
    {
      id: newId(),
      slug: "",
      titel: "Home",
      seoTitel: (c.plaats ? `${c.naam} | ${eerste} in ${c.plaats}` : `${c.naam} | ${eerste}`).slice(0, 70),
      seoOmschrijving: clipSentences(heroTekst, 165),
      blocks: home,
    },
    {
      id: newId(),
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: `Over ${c.naam}`.slice(0, 70),
      seoOmschrijving: clipSentences(over, 165),
      blocks: [block("tekst", { kop: kop(`Over ${c.naam}`), tekst: over }), block("faq", { items: t.faq.map((q) => ({ vraag: fill(q.vraag, c).slice(0, 200), antwoord: fill(q.antwoord, c) })) })],
    },
    {
      id: newId(),
      slug: "contact",
      titel: "Contact",
      seoTitel: `Contact | ${c.naam}`.slice(0, 70),
      seoOmschrijving: `Neem contact op met ${c.naam}${c.plaats ? ` in ${c.plaats}` : ""}.`.slice(0, 165),
      blocks: [block("contact", { kop: "Neem contact op", tekst: `Heb je een vraag of wil je een afspraak maken? Laat het ${c.naam} weten.`, formulier: true }), uren],
    },
  ];
}

const rid = () => `b${randomBytes(6).toString("hex")}`;

export interface ProposalSiteInput {
  proposalId: string;
  facts: BusinessFacts;
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
  const fotos: Media[] = [];
  for (const url of facts.fotos.slice(0, 8)) {
    try {
      const image = await importRemoteImage(url);
      // icons and thumbnails don't make a luxe page
      if (Math.max(image.width, image.height) < 500) continue;
      fotos.push(await addMedia(site.id, image, { alt: `Foto van ${bedrijf.naam}`, bron: "internet", sourceUrl: url }));
    } catch (err) {
      logger.info("proposal photo skipped", { siteId: site.id, reason: String(err) });
    }
  }

  const theme = proposalTheme(facts.kleur, template, logo);
  // the same check as the builder's own saves: a page from someone else's text must still fit
  const doc = siteSaveSchema.parse({ theme, bedrijf, pages: proposalPages(bedrijf, template, facts, pickPhotos(fotos), rid) });
  await saveSite(site.id, doc);
  await markProposal(site.id, input.mark);
  return publishSite(site.id, input.by);
}
