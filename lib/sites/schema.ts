import { z } from "zod";

// ---------------------------------------------------------------------------
// What the builder may save. Everything is escaped when rendered anyway; this
// keeps the data well-formed and bounded (no giant pages, no unknown fields).
// ---------------------------------------------------------------------------

const kop = z.string().trim().max(160);
const tekst = z.string().trim().max(4000);
const short = z.string().trim().max(200);
const link = z.string().trim().max(300);
const mediaId = z.string().regex(/^m[a-z0-9]{6,20}$/).nullable();
const klok = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Een tijd schrijf je als 17:30.");
/** per weekday (0 = Sunday) from-to, or null = no reservations that day */
const dagTijd = z.object({ van: klok, tot: klok }).nullable();
const reserveerTijden = z.object({ "0": dagTijd, "1": dagTijd, "2": dagTijd, "3": dagTijd, "4": dagTijd, "5": dagTijd, "6": dagTijd });

const block = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(40), type: z.literal("hero"), props: z.object({ kop, tekst, knop: short, knopLink: link, foto: mediaId }) }),
  z.object({ id: z.string().max(40), type: z.literal("tekst"), props: z.object({ kop, tekst }) }),
  z.object({ id: z.string().max(40), type: z.literal("tekstFoto"), props: z.object({ kop, tekst, foto: mediaId, fotoLinks: z.boolean() }) }),
  z.object({ id: z.string().max(40), type: z.literal("diensten"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst, foto: mediaId.optional() })).max(12) }) }),
  z.object({ id: z.string().max(40), type: z.literal("galerij"), props: z.object({ kop, fotos: z.array(z.string().regex(/^m[a-z0-9]{6,20}$/)).max(24) }) }),
  z.object({ id: z.string().max(40), type: z.literal("reviews"), props: z.object({ kop, items: z.array(z.object({ naam: short, tekst, sterren: z.number().int().min(0).max(5) })).max(12) }) }), // 0: een klantverhaal zonder sterren (geen verzonnen score)
  z.object({ id: z.string().max(40), type: z.literal("faq"), props: z.object({ kop, items: z.array(z.object({ vraag: short, antwoord: tekst })).max(20) }) }),
  z.object({ id: z.string().max(40), type: z.literal("openingstijden"), props: z.object({ kop, regels: z.array(z.object({ dag: short, tijd: short })).max(10) }) }),
  z.object({ id: z.string().max(40), type: z.literal("cta"), props: z.object({ kop, tekst, knop: short, knopLink: link }) }),
  z.object({ id: z.string().max(40), type: z.literal("contact"), props: z.object({ kop, tekst, formulier: z.boolean() }) }),
  z.object({ id: z.string().max(40), type: z.literal("vacatures"), props: z.object({ kop, tekst, aantal: z.number().int().min(1).max(12) }) }),
  z.object({ id: z.string().max(40), type: z.literal("stappen"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
  z.object({ id: z.string().max(40), type: z.literal("usps"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
  z.object({ id: z.string().max(40), type: z.literal("producten"), props: z.object({ kop, tekst, categorie: z.string().trim().max(60), aantal: z.number().int().min(1).max(48) }) }),
  z.object({ id: z.string().max(40), type: z.literal("uitgelicht"), props: z.object({ productId: z.string().regex(/^$|^p[a-z0-9]{6,20}$/), kop, tekst, fotoLinks: z.boolean() }) }),
  z.object({ id: z.string().max(40), type: z.literal("burger3d"), props: z.object({ kop, tekst, lagen: z.array(z.object({ titel: short, tekst: z.string().trim().max(300) })).max(7), knop: short, knopLink: link }) }),
  z.object({
    id: z.string().max(40),
    type: z.literal("reserveren"),
    props: z.object({
      kop,
      tekst,
      tijden: reserveerTijden,
      slotMinuten: z.union([z.literal(15), z.literal(30), z.literal(60)]),
      verblijfMinuten: z.number().int().min(30).max(360),
      maxGroep: z.number().int().min(1).max(100),
      dagenVooruit: z.number().int().min(1).max(365),
      maxGasten: z.number().int().min(1).max(2000),
    }),
  }),
]);

const cents = z.number().int().min(0).max(10_000_000);

/** A product of the site's own shop (lib/sites/types.ts SiteProduct). */
export const productSchema = z.object({
  id: z.string().regex(/^p[a-z0-9]{6,20}$/),
  naam: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  prijsCents: cents,
  oudePrijsCents: cents.nullable().optional(),
  korteTekst: z.string().trim().max(200),
  omschrijving: tekst,
  fotos: z.array(z.string().regex(/^m[a-z0-9]{6,20}$/)).max(8),
  categorie: z.string().trim().max(60),
  zichtbaar: z.boolean(),
  uitverkocht: z.boolean(),
  voorraad: z.number().int().min(0).max(1_000_000).nullable().optional(),
  opties: z
    .array(z.object({ naam: z.string().trim().min(1).max(30), waarden: z.array(z.string().trim().min(1).max(40)).min(1).max(20) }))
    .max(2)
    .optional(),
  bron: z.object({ zekerflex: z.string().max(60) }).optional(),
});

export const winkelSchema = z
  .object({
    producten: z.array(productSchema).max(300),
    bestellen: z.boolean(),
    levering: z.object({ afhalen: z.boolean(), bezorgen: z.boolean(), bezorgkostenCents: cents, gratisVanafCents: cents.nullable() }),
    betaalTekst: z.string().trim().max(600),
  })
  .superRefine((w, ctx) => {
    const slugs = w.producten.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: "custom", message: "Twee producten hebben hetzelfde webadres." });
    if (new Set(w.producten.map((p) => p.id)).size !== w.producten.length) ctx.addIssue({ code: "custom", message: "Een product staat er twee keer in." });
    if (w.bestellen && !w.levering.afhalen && !w.levering.bezorgen) ctx.addIssue({ code: "custom", message: "Kies of klanten hun bestelling afhalen, laten bezorgen of allebei." });
  });

const page = z.object({
  id: z.string().max(40),
  slug: z.string().regex(/^$|^[a-z0-9-]{1,40}$/),
  titel: z.string().trim().min(1).max(40),
  seoTitel: z.string().trim().max(70),
  seoOmschrijving: z.string().trim().max(170),
  blocks: z.array(block).max(30),
});

export const companySchema = z.object({
  naam: z.string().trim().min(1).max(100),
  kvk: z.string().trim().regex(/^$|^\d{8}$/, "Een KVK-nummer heeft 8 cijfers."),
  straat: z.string().trim().max(120),
  postcode: z.string().trim().max(10),
  plaats: z.string().trim().max(80),
  telefoon: z.string().trim().max(30),
  email: z.string().trim().max(200).refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Vul een geldig e-mailadres in."),
  // checked loosely, so half-typed numbers still save; the site shows the button only for a real number (waNumber)
  whatsapp: z.string().trim().max(30).regex(/^[\d\s+()-]*$/, "Gebruik voor WhatsApp alleen cijfers, spaties en een +.").optional(),
  socials: z.array(z.string().trim().max(300).regex(/^https:\/\/[^\s<>"']+$/, "Een link naar sociale media begint met https://.")).max(6).optional(),
});

export const themeSchema = z.object({
  kleur: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lettertype: z.enum(["modern", "klassiek", "vriendelijk"]),
  hoeken: z.enum(["rond", "strak"]),
  stijl: z.enum(["standaard", "luxe", "premium", "beleving"]).optional(),
  logo: mediaId.optional(),
});

export const siteSaveSchema = z
  .object({
    theme: themeSchema,
    bedrijf: companySchema,
    pages: z.array(page).min(1).max(12),
    /** alt texts of existing photos (the photos themselves are added via upload/import) */
    altTexts: z.record(z.string().regex(/^m[a-z0-9]{6,20}$/), z.string().trim().max(200)).optional(),
    /** the site's shop (lib/sites/winkel.ts); absent = leave it as it is */
    winkel: winkelSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const slugs = v.pages.map((p) => p.slug);
    if (!slugs.includes("")) ctx.addIssue({ code: "custom", message: "Er moet een homepagina zijn." });
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: "custom", message: "Twee pagina's hebben hetzelfde webadres." });
    if (slugs.some((s) => ["privacy", "bedankt", "media", "assets", "_zf", "sitemap", "robots", "p", "winkel", "bestellen", "besteld", "mand", "reserveren", "gereserveerd", "wat-kan-deze-site"].includes(s))) {
      ctx.addIssue({ code: "custom", message: "Dit webadres voor een pagina is gereserveerd." });
    }
  });

export const createSchema = z.object({
  templateId: z.string().max(40),
  /** website bouwen (standaard) of webshop openen */
  soort: z.enum(["website", "webshop"]).optional(),
  bedrijf: companySchema,
});
