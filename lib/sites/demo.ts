import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { importRemoteImage } from "@/lib/media/clean-image";
import { addMedia, createSite, markExample, publishSite, saveSite, siteBySlug, siteOfTenant } from "@/lib/sites/store";
import { slugify, type Block, type BlockProps, type BlockType, type Company, type Page, type SiteProduct, type Theme, type Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Voorbeeldwebsite: zekerflex.com/site/bakkerij-jansen laat zien wat een bedrijf
// met de websitebouwer krijgt. Bakkerij Jansen bestaat niet, en dat staat op
// elke pagina (SiteDoc.voorbeeld); het contactformulier verstuurt niets en er
// gaan geen bedrijfsgegevens naar zoekmachines. De site maakt zichzelf aan bij
// het eerste bezoek en werkt zich bij als DEMO_VERSION omhoog gaat. Foto's:
// Unsplash (vrije licentie), één keer opgehaald en bij ons bewaard.
// ---------------------------------------------------------------------------

export const DEMO_SLUG = "bakkerij-jansen";
// 2: the premium house style (3 Nov 2026); 3: a webshop with products; 4: choices (taart) and stock;
// 5: the beleving style, like schwarzwald.zekerflex.com and the branch examples (4 Nov 2026)
const DEMO_VERSION = 5;
const DEMO_TENANT = "voorbeeld:bakkerij-jansen";
const STATE_KEY = "site-demo:bakkerij-jansen";
const LOCK_KEY = "site-demo-lock:bakkerij-jansen";
const BY = { userId: "system", name: "ZekerFlex (voorbeeld)" };

const BEDRIJF: Company = { naam: "Bakkerij Jansen", kvk: "", straat: "", postcode: "", plaats: "Zonnedorp", telefoon: "", email: "" };
const THEME: Theme = { kleur: "#3B2A1E", accent: "#D4A24C", lettertype: "klassiek", hoeken: "rond", stijl: "beleving" };

const PHOTOS = {
  hero: { id: "1509440159596-0249088772ff", alt: "Ambachtelijk brood met zaden en een bos tarwe" },
  desem: { id: "1586444248902-2f64eddc13df", alt: "Desembrood met een krokante, bebloemde korst" },
  mand: { id: "1608198093002-ad4e005484ec", alt: "Een mand vol verschillende broden" },
  croissant: { id: "1555507036-ab1f4038808a", alt: "Croissants met poedersuiker" },
  chocolade: { id: "1483695028939-5bb13f8648b0", alt: "Chocoladebroodjes op een bakplaat" },
  schaal: { id: "1530610476181-d83430b64dcd", alt: "Verse croissants op een zilveren schaal" },
  cupcakes: { id: "1486427944299-d1955d23e34d", alt: "Cupcakes met vrolijke spikkels" },
} as const;
type PhotoKey = keyof typeof PHOTOS;

export const photoUrl = (id: string) => `https://images.unsplash.com/photo-${id}?w=2000&q=80&auto=format&fit=crop`;

/** The example's pages; `foto` gives the media id of a photo, or null when it could not be fetched. */
export function demoPages(foto: (key: PhotoKey) => string | null): Page[] {
  let n = 0;
  const block = <T extends BlockType>(type: T, props: BlockProps[T]) => ({ id: `bdemo${String(++n).padStart(3, "0")}`, type, props }) as Block;
  const uren = block("openingstijden", {
    kop: "Openingstijden",
    regels: [
      { dag: "Maandag", tijd: "Gesloten" },
      { dag: "Dinsdag tot en met vrijdag", tijd: "07:00 – 18:00" },
      { dag: "Zaterdag", tijd: "07:00 – 16:00" },
      { dag: "Zondag", tijd: "Gesloten" },
    ],
  });
  return [
    {
      id: "pdemo-home",
      slug: "",
      titel: "Home",
      seoTitel: "Bakkerij Jansen | Ambachtelijk brood, elke ochtend vers",
      seoOmschrijving: "Desem, volkoren, croissants en taart op bestelling: elke dag vers uit de oven bij Bakkerij Jansen.",
      blocks: [
        block("hero", { kop: "Ambachtelijk brood, elke ochtend vers", tekst: "Bij Bakkerij Jansen kneden we nog met de hand. Desem, volkoren, croissants en taart op bestelling: elke dag vers uit de oven.", knop: "Bestel online", knopLink: "winkel", foto: foto("hero") }),
        block("producten", { kop: "Vandaag vers in de winkel", tekst: "Bestel online en haal het morgenochtend op, of laat het bezorgen.", categorie: "", aantal: 4 }),
        block("diensten", {
          kop: "Vers uit onze oven",
          items: [
            { titel: "Desem & volkoren", tekst: "Langzaam gerezen brood met een krokante korst, gebakken met meel van de molen om de hoek." },
            { titel: "Banket & croissants", tekst: "Echte roomboter, vroeg in de ochtend gevouwen en gebakken." },
            { titel: "Taarten op bestelling", tekst: "Voor verjaardagen, bruiloften en het werk, met jouw eigen tekst erop." },
          ],
        }),
        block("tekstFoto", { kop: "Al drie generaties bakkers", tekst: "Wat begon als een klein bakkerijtje aan het dorpsplein, is nog altijd een familiebedrijf. We bakken zoals opa het ons leerde: met tijd, goede ingrediënten en zonder haast.\n\nJe proeft het verschil.", foto: foto("desem"), fotoLinks: false }),
        block("uitgelicht", { productId: DEMO_UITGELICHT, kop: "Favoriet van de week", tekst: "", fotoLinks: true }),
        block("galerij", { kop: "Uit de bakkerij", fotos: (["croissant", "chocolade", "schaal", "cupcakes", "mand"] as const).map(foto).filter((f): f is string => Boolean(f)) }),
        block("reviews", {
          kop: "Zo kan het eruitzien met reviews (voorbeeld)",
          items: [
            { naam: "Voorbeeldklant", tekst: "Het lekkerste desembrood van de streek. Elke zaterdag halen we hier onze broodjes.", sterren: 5 },
            { naam: "Voorbeeldklant", tekst: "Onze bruidstaart was prachtig en heerlijk, precies zoals we het wilden.", sterren: 5 },
          ],
        }),
        uren,
        block("cta", { kop: "Taart nodig voor een feestje?", tekst: "Bestel minstens twee dagen van tevoren, dan staat hij klaar wanneer jij wilt.", knop: "Neem contact op", knopLink: "contact" }),
      ],
    },
    {
      id: "pdemo-assortiment",
      slug: "assortiment",
      titel: "Assortiment",
      seoTitel: "Assortiment | Bakkerij Jansen",
      seoOmschrijving: "Brood, banket en taart: dit bakt Bakkerij Jansen het hele jaar door.",
      blocks: [
        block("tekstFoto", { kop: "Ons assortiment", tekst: "Elke dag een ander lekker aanbod. Dit bakken we het hele jaar door; op zaterdag hebben we extra specialiteiten.", foto: foto("mand"), fotoLinks: true }),
        block("producten", { kop: "Brood", tekst: "", categorie: "Brood", aantal: 8 }),
        block("producten", { kop: "Banket en zoet", tekst: "", categorie: "Banket en zoet", aantal: 8 }),
        block("faq", {
          kop: "Veelgestelde vragen",
          items: [
            { vraag: "Kan ik brood reserveren?", antwoord: "Ja, bel of mail ons de dag ervoor, dan leggen we het voor je klaar." },
            { vraag: "Hebben jullie glutenvrij brood?", antwoord: "We bakken op vrijdag glutenvrij brood. Omdat we ook met gewoon meel werken, kunnen we sporen niet uitsluiten." },
            { vraag: "Leveren jullie aan bedrijven?", antwoord: "Ja, voor lunches en vergaderingen bezorgen we in de buurt. Vraag naar de mogelijkheden." },
          ],
        }),
      ],
    },
    {
      id: "pdemo-over",
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: "Over ons | Bakkerij Jansen",
      seoOmschrijving: "Een familiebakkerij met drie generaties vakmanschap.",
      blocks: [
        block("tekstFoto", { kop: "Over Bakkerij Jansen", tekst: "Onze bakkerij is al drie generaties in handen van de familie. Elke nacht om vier uur gaan de ovens aan, zodat jij om zeven uur vers brood kunt halen.\n\nWe werken met eerlijke ingrediënten: meel van een molen uit de buurt, echte roomboter en geen onnodige toevoegingen.", foto: foto("schaal"), fotoLinks: false }),
        block("tekst", { kop: "Vakmanschap met tijd", tekst: "Goed brood heeft tijd nodig. Ons desem rijst drie dagen, ons banket wordt met de hand gevouwen. Dat is meer werk, maar je proeft het bij elke hap." }),
      ],
    },
    {
      id: "pdemo-contact",
      slug: "contact",
      titel: "Contact",
      seoTitel: "Contact | Bakkerij Jansen",
      seoOmschrijving: "Vragen, een bestelling of een taart op maat? Neem contact op met Bakkerij Jansen.",
      blocks: [block("contact", { kop: "Kom langs of neem contact op", tekst: "Vragen, een bestelling of een taart op maat? Laat het ons weten, dan reageren we dezelfde dag.", formulier: true }), uren],
    },
  ];
}

const DEMO_UITGELICHT = "pdemo00croissant";

/** The example's shop (lib/sites/winkel.ts): real-looking products with the demo's own photos; ordering is inert on an example. */
export function demoWinkel(foto: (key: PhotoKey) => string | null): Winkel {
  const p = (id: string, naam: string, categorie: string, prijsCents: number, korteTekst: string, omschrijving: string, fotoKey: PhotoKey | null, extra: Partial<SiteProduct> = {}): SiteProduct => {
    const f = fotoKey ? foto(fotoKey) : null;
    return { id, naam, slug: slugify(naam), prijsCents, oudePrijsCents: null, korteTekst, omschrijving, fotos: f ? [f] : [], categorie, zichtbaar: true, uitverkocht: false, ...extra };
  };
  return {
    producten: [
      p("pdemo0000desem", "Desembrood wit", "Brood", 465, "Drie dagen gerezen, met een open kruim", "Ons desembrood rijst drie dagen. Dat geeft een open kruim, een licht zurige smaak en een stevige, krokante korst.\n\nGebakken met meel van de molen om de hoek. Heel of gesneden, ongeveer 800 gram.", "desem"),
      p("pdemo00volkoren", "Volkoren met zaden", "Brood", 395, "Met zonnebloempitten, lijnzaad en sesam", "Een stevig volkorenbrood vol zaden en pitten. Lekker bij de lunch en lang vers.\n\nOngeveer 800 gram.", "hero"),
      p("pdemo0000mand", "Broodmand voor de zondag", "Brood", 1495, "Vier broden en zes broodjes, voor het hele gezin", "Voor een ontbijt of brunch met het hele gezin: desem, volkoren, spelt en een stokbrood, met zes zachte broodjes.\n\nBestel uiterlijk vrijdag, dan staat hij zondagochtend klaar.", "mand", { oudePrijsCents: 1695 }),
      p("pdemo00stokbrood", "Stokbrood", "Brood", 225, "Elke ochtend en middag vers", "Een knapperig stokbrood, twee keer per dag vers uit de oven.", null, { uitverkocht: true }),
      p(DEMO_UITGELICHT, "Roomboter croissant", "Banket en zoet", 185, "Met echte roomboter, met de hand gevouwen", "Vroeg in de ochtend gevouwen met echte Franse roomboter, voor een krokante buitenkant en een luchtig, zacht binnenste.\n\nNaturel, of vraag naar de amandelcroissant.", "croissant", { voorraad: 4 }),
      p("pdemo0chocolade", "Chocoladebroodje", "Banket en zoet", 210, "Bladerdeeg met twee staafjes pure chocolade", "Luchtig bladerdeeg met twee staafjes pure chocolade. Het lekkerst nog even warm.", "chocolade"),
      p("pdemo00cupcakes", "Cupcakes, doosje van 6", "Banket en zoet", 1250, "Vrolijk versierd, voor elk feestje", "Zes cupcakes met vanille, chocolade en aardbei, versierd met botercrème en spikkels.\n\nTip: bestel ze twee dagen van tevoren met jouw kleuren.", "cupcakes", { voorraad: 12 }),
      p("pdemo000taart", "Taart op maat", "Banket en zoet", 3450, "Kies smaak, formaat en tekst", "Voor verjaardagen, bruiloften en het werk. Kies smaak en formaat, en zet er je eigen tekst op (bij de opmerking). Prijs voor een taart van 10 tot 12 personen.\n\nBestel minstens twee dagen van tevoren.", "schaal", {
        opties: [
          { naam: "Formaat", waarden: ["6 tot 8 personen", "10 tot 12 personen", "16 tot 20 personen"] },
          { naam: "Smaak", waarden: ["Aardbei", "Chocolade", "Vanille", "Citroen"] },
        ],
      }),
    ],
    bestellen: true,
    levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 },
    betaalTekst: "Je betaalt bij het afhalen of bij de bezorging, contant of met pin.",
  };
}

/** One builder at a time; a lock older than two minutes is from a crashed run. */
async function takeLock(): Promise<boolean> {
  try {
    await prisma.keyValueStore.create({ data: { key: LOCK_KEY, value: new Date().toISOString() } });
    return true;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const since = await kvGet<string>(LOCK_KEY).catch(() => null);
    if (since && Date.now() - new Date(since).getTime() > 120_000) await kvDelete(LOCK_KEY);
    return false;
  }
}

/** Make sure the example site exists, is up to date and published. Cheap when it already is. */
export async function ensureDemoSite(): Promise<void> {
  const state = await kvGet<{ version: number; siteId: string }>(STATE_KEY).catch(() => null);
  if (state?.version === DEMO_VERSION) return;
  // a real company that already has this address keeps it; no example then
  const owner = await siteBySlug(DEMO_SLUG);
  if (owner && owner.tenantId !== DEMO_TENANT) return;
  if (!(await takeLock())) return;
  try {
    const site = (await siteOfTenant(DEMO_TENANT)) ?? (await createSite(DEMO_TENANT, BY, { templateId: "horeca", bedrijf: BEDRIJF }));
    if (site.slug !== DEMO_SLUG) logger.warn("demo site got another address", { slug: site.slug });
    const ids: Partial<Record<PhotoKey, string>> = {};
    for (const [key, p] of Object.entries(PHOTOS) as [PhotoKey, (typeof PHOTOS)[PhotoKey]][]) {
      const url = photoUrl(p.id);
      const have = site.media.find((m) => m.sourceUrl === url);
      if (have) {
        ids[key] = have.id;
        continue;
      }
      try {
        const image = await importRemoteImage(url);
        ids[key] = (await addMedia(site.id, image, { alt: p.alt, bron: "internet", sourceUrl: url })).id;
      } catch (err) {
        logger.warn("demo photo failed", { key, err: String(err) });
      }
    }
    const foto = (k: PhotoKey) => ids[k] ?? null;
    await saveSite(site.id, { theme: THEME, bedrijf: BEDRIJF, pages: demoPages(foto) as never, winkel: demoWinkel(foto) });
    await markExample(site.id);
    await publishSite(site.id, BY);
    await kvSet(STATE_KEY, { version: DEMO_VERSION, siteId: site.id });
  } finally {
    await kvDelete(LOCK_KEY).catch(() => undefined);
  }
}
