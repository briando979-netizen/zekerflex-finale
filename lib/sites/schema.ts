import { z } from "zod";
import { ibanGeldig } from "@/lib/sites/winkel-betalen";
import { CODE_PATROON } from "@/lib/sites/winkel-korting";
import { verzendmethodenVan } from "@/lib/sites/winkel-verzending";

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

/** an https address, or empty (a video or route link; never a third-party embed) */
const httpsLink = z.string().trim().max(300).regex(/^$|^https:\/\/[^\s<>"']+$/, "Een link begint met https://.");
/** settings every block can have (lib/sites/types.ts BlockExtra) */
const basis = {
  id: z.string().max(40),
  verborgen: z.boolean().optional(),
  ruimte: z.enum(["klein", "normaal", "groot"]).optional(),
  achtergrond: z.enum(["geen", "zacht", "merk", "accent"]).optional(),
  uitlijning: z.enum(["links", "midden", "rechts"]).optional(),
};

const block = z.discriminatedUnion("type", [
  z.object({ ...basis, type: z.literal("hero"), props: z.object({ kop, tekst, knop: short, knopLink: link, foto: mediaId }) }),
  z.object({ ...basis, type: z.literal("tekst"), props: z.object({ kop, tekst }) }),
  z.object({ ...basis, type: z.literal("tekstFoto"), props: z.object({ kop, tekst, foto: mediaId, fotoLinks: z.boolean() }) }),
  z.object({ ...basis, type: z.literal("diensten"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst, foto: mediaId.optional() })).max(12) }) }),
  z.object({ ...basis, type: z.literal("galerij"), props: z.object({ kop, fotos: z.array(z.string().regex(/^m[a-z0-9]{6,20}$/)).max(24) }) }),
  z.object({ ...basis, type: z.literal("reviews"), props: z.object({ kop, items: z.array(z.object({ naam: short, tekst, sterren: z.number().int().min(0).max(5) })).max(12) }) }), // 0: een klantverhaal zonder sterren (geen verzonnen score)
  z.object({ ...basis, type: z.literal("faq"), props: z.object({ kop, items: z.array(z.object({ vraag: short, antwoord: tekst })).max(20) }) }),
  z.object({ ...basis, type: z.literal("openingstijden"), props: z.object({ kop, regels: z.array(z.object({ dag: short, tijd: short })).max(10) }) }),
  z.object({ ...basis, type: z.literal("cta"), props: z.object({ kop, tekst, knop: short, knopLink: link }) }),
  z.object({ ...basis, type: z.literal("contact"), props: z.object({ kop, tekst, formulier: z.boolean() }) }),
  z.object({ ...basis, type: z.literal("vacatures"), props: z.object({ kop, tekst, aantal: z.number().int().min(1).max(12) }) }),
  z.object({ ...basis, type: z.literal("stappen"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
  z.object({ ...basis, type: z.literal("usps"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
  z.object({ ...basis, type: z.literal("producten"), props: z.object({ kop, tekst, categorie: z.string().trim().max(60), aantal: z.number().int().min(1).max(48) }) }),
  z.object({ ...basis, type: z.literal("uitgelicht"), props: z.object({ productId: z.string().regex(/^$|^p[a-z0-9]{6,20}$/), kop, tekst, fotoLinks: z.boolean() }) }),
  z.object({ ...basis, type: z.literal("burger3d"), props: z.object({ kop, tekst, lagen: z.array(z.object({ titel: short, tekst: z.string().trim().max(300) })).max(7), knop: short, knopLink: link }) }),
  z.object({
    ...basis,
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
  z.object({
    ...basis,
    type: z.literal("prijzen"),
    props: z.object({
      kop,
      tekst,
      items: z
        .array(z.object({ naam: short, prijs: z.string().trim().max(40), eenheid: z.string().trim().max(40), punten: z.string().trim().max(600), knop: short, knopLink: link, uitgelicht: z.boolean() }))
        .max(4),
    }),
  }),
  z.object({ ...basis, type: z.literal("team"), props: z.object({ kop, tekst, items: z.array(z.object({ naam: short, functie: short, foto: mediaId })).max(12) }) }),
  z.object({ ...basis, type: z.literal("cijfers"), props: z.object({ kop, items: z.array(z.object({ waarde: z.string().trim().max(24), label: short })).max(6) }) }),
  z.object({ ...basis, type: z.literal("logos"), props: z.object({ kop, fotos: z.array(z.string().regex(/^m[a-z0-9]{6,20}$/)).max(12) }) }),
  z.object({ ...basis, type: z.literal("video"), props: z.object({ kop, tekst, foto: mediaId, knop: short, link: httpsLink }) }),
  z.object({ ...basis, type: z.literal("kaart"), props: z.object({ kop, tekst, adres: z.string().trim().max(300), routeLink: httpsLink, knop: short }) }),
  z.object({ ...basis, type: z.literal("afbeelding"), props: z.object({ foto: mediaId, bijschrift: short, breed: z.boolean() }) }),
  z.object({ ...basis, type: z.literal("scheiding"), props: z.object({ vorm: z.enum(["ruimte", "lijn"]), hoogte: z.enum(["klein", "normaal", "groot"]) }) }),
  z.object({ ...basis, type: z.literal("knoppen"), props: z.object({ kop, items: z.array(z.object({ tekst: short, link, vorm: z.enum(["vol", "lijn"]) })).max(4) }) }),
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
  btw: z.union([z.literal(21), z.literal(9), z.literal(0)]).optional(),
});

/** A shipping method (lib/sites/types.ts Verzendmethode). */
const verzendmethodeSchema = z.object({
  id: z.string().regex(/^v[a-z0-9]{4,20}$/),
  soort: z.enum(["afhalen", "bezorgen"]),
  naam: z.string().trim().min(1, "Geef elke verzendmethode een naam.").max(60),
  prijsCents: cents,
  gratisVanafCents: cents.nullable(),
  gebied: z.enum(["nl", "eu", "overal"]),
  adres: z.string().trim().max(200),
  levertijd: z.string().trim().max(60),
  actief: z.boolean(),
});

/** A discount code (lib/sites/types.ts Kortingscode). */
const kortingscodeSchema = z
  .object({
    id: z.string().regex(/^k[a-z0-9]{4,20}$/),
    code: z.string().trim().toUpperCase().regex(CODE_PATROON, "Een kortingscode heeft 3 tot 20 letters, cijfers of streepjes, zoals ZOMER10."),
    soort: z.enum(["procent", "bedrag"]),
    waarde: z.number().int().min(1, "Geef de korting een waarde.").max(10_000_000),
    minimumCents: cents.nullable(),
    totEnMet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Een datum schrijf je als 2026-12-31.").nullable(),
    maxGebruik: z.number().int().min(1).max(1_000_000).nullable(),
    actief: z.boolean(),
  })
  .refine((k) => k.soort !== "procent" || k.waarde <= 100, { message: "Een percentage is hoogstens 100.", path: ["waarde"] });

/** How customers pay (lib/sites/types.ts BetaalInstelling). */
const betalenSchema = z.object({
  methoden: z.array(z.enum(["afhalen", "overboeking", "rembours"])).max(3),
  iban: z.string().trim().max(40),
  tenaamstelling: z.string().trim().max(70),
});

/** VAT on orders (lib/sites/types.ts BtwInstelling). */
const btwSchema = z.object({ inclusief: z.boolean(), standaard: z.union([z.literal(21), z.literal(9), z.literal(0)]), kor: z.boolean() });

export const winkelSchema = z
  .object({
    producten: z.array(productSchema).max(300),
    bestellen: z.boolean(),
    levering: z.object({ afhalen: z.boolean(), bezorgen: z.boolean(), bezorgkostenCents: cents, gratisVanafCents: cents.nullable() }),
    betaalTekst: z.string().trim().max(600),
    verzendmethoden: z.array(verzendmethodeSchema).max(12).optional(),
    kortingscodes: z.array(kortingscodeSchema).max(200).optional(),
    betalen: betalenSchema.optional(),
    btw: btwSchema.optional(),
  })
  .superRefine((w, ctx) => {
    const slugs = w.producten.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: "custom", message: "Twee producten hebben hetzelfde webadres." });
    if (new Set(w.producten.map((p) => p.id)).size !== w.producten.length) ctx.addIssue({ code: "custom", message: "Een product staat er twee keer in." });
    if (w.bestellen && !verzendmethodenVan(w).some((m) => m.actief)) {
      ctx.addIssue({ code: "custom", message: w.verzendmethoden ? "Zet minstens één verzendmethode aan, of zet online bestellen uit." : "Kies of klanten hun bestelling afhalen, laten bezorgen of allebei." });
    }
    if (w.verzendmethoden && new Set(w.verzendmethoden.map((m) => m.id)).size !== w.verzendmethoden.length) ctx.addIssue({ code: "custom", message: "Een verzendmethode staat er twee keer in." });
    const codes = (w.kortingscodes ?? []).map((k) => k.code);
    const dubbel = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dubbel) ctx.addIssue({ code: "custom", message: `De kortingscode ${dubbel} staat er twee keer in.` });
    else if (new Set((w.kortingscodes ?? []).map((k) => k.id)).size !== codes.length) ctx.addIssue({ code: "custom", message: "Een kortingscode staat er twee keer in." });
    if (w.betalen?.methoden.includes("overboeking") && !(ibanGeldig(w.betalen.iban) && w.betalen.tenaamstelling)) {
      ctx.addIssue({ code: "custom", message: "Vul voor betalen per overboeking een geldig IBAN en de naam van de rekening in." });
    }
  });

const page = z.object({
  id: z.string().max(40),
  slug: z.string().regex(/^$|^[a-z0-9-]{1,40}$/),
  titel: z.string().trim().min(1).max(40),
  seoTitel: z.string().trim().max(70),
  seoOmschrijving: z.string().trim().max(170),
  blocks: z.array(block).max(30),
  menu: z.boolean().optional(),
  menuLabel: z.string().trim().max(40).optional(),
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
