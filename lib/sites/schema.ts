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

const block = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(40), type: z.literal("hero"), props: z.object({ kop, tekst, knop: short, knopLink: link, foto: mediaId }) }),
  z.object({ id: z.string().max(40), type: z.literal("tekst"), props: z.object({ kop, tekst }) }),
  z.object({ id: z.string().max(40), type: z.literal("tekstFoto"), props: z.object({ kop, tekst, foto: mediaId, fotoLinks: z.boolean() }) }),
  z.object({ id: z.string().max(40), type: z.literal("diensten"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst, foto: mediaId.optional() })).max(12) }) }),
  z.object({ id: z.string().max(40), type: z.literal("galerij"), props: z.object({ kop, fotos: z.array(z.string().regex(/^m[a-z0-9]{6,20}$/)).max(24) }) }),
  z.object({ id: z.string().max(40), type: z.literal("reviews"), props: z.object({ kop, items: z.array(z.object({ naam: short, tekst, sterren: z.number().int().min(1).max(5) })).max(12) }) }),
  z.object({ id: z.string().max(40), type: z.literal("faq"), props: z.object({ kop, items: z.array(z.object({ vraag: short, antwoord: tekst })).max(20) }) }),
  z.object({ id: z.string().max(40), type: z.literal("openingstijden"), props: z.object({ kop, regels: z.array(z.object({ dag: short, tijd: short })).max(10) }) }),
  z.object({ id: z.string().max(40), type: z.literal("cta"), props: z.object({ kop, tekst, knop: short, knopLink: link }) }),
  z.object({ id: z.string().max(40), type: z.literal("contact"), props: z.object({ kop, tekst, formulier: z.boolean() }) }),
  z.object({ id: z.string().max(40), type: z.literal("vacatures"), props: z.object({ kop, tekst, aantal: z.number().int().min(1).max(12) }) }),
  z.object({ id: z.string().max(40), type: z.literal("stappen"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
  z.object({ id: z.string().max(40), type: z.literal("usps"), props: z.object({ kop, items: z.array(z.object({ titel: short, tekst })).max(8) }) }),
]);

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
  stijl: z.enum(["standaard", "luxe", "premium"]).optional(),
  logo: mediaId.optional(),
});

export const siteSaveSchema = z
  .object({
    theme: themeSchema,
    bedrijf: companySchema,
    pages: z.array(page).min(1).max(12),
    /** alt texts of existing photos (the photos themselves are added via upload/import) */
    altTexts: z.record(z.string().regex(/^m[a-z0-9]{6,20}$/), z.string().trim().max(200)).optional(),
  })
  .superRefine((v, ctx) => {
    const slugs = v.pages.map((p) => p.slug);
    if (!slugs.includes("")) ctx.addIssue({ code: "custom", message: "Er moet een homepagina zijn." });
    if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: "custom", message: "Twee pagina's hebben hetzelfde webadres." });
    if (slugs.some((s) => ["privacy", "bedankt", "media", "assets", "_zf", "sitemap", "robots"].includes(s))) {
      ctx.addIssue({ code: "custom", message: "Dit webadres voor een pagina is gereserveerd." });
    }
  });

export const createSchema = z.object({
  templateId: z.string().max(40),
  bedrijf: companySchema,
});
