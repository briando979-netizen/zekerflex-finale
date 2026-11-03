import { z } from "zod";
import { AppError } from "@/lib/errors";
import { isDatum, isTijd } from "@/lib/rijschool/planning";
import { isOnderdeel } from "@/lib/rijschool/leskaart";
import { isTheorieOnderdeel } from "@/lib/rijschool/theorie";
import { websiteSchema } from "@/lib/rijschool/website";

// ---------------------------------------------------------------------------
// Invoer van het rijschool-pakket: beheer, publieke site, leerling- en
// instructeur-app. Strikt: lengtes begrensd, datums als "2026-11-03" en tijden
// als "10:30" (Nederlandse kloktijd, zie lib/rijschool/planning.ts).
// ---------------------------------------------------------------------------

// Nederlandse meldingen voor velden zonder eigen melding; eigen meldingen in
// de schema's gaan altijd voor.
const nlFouten: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case "invalid_type":
      return { message: issue.received === "undefined" ? "Vul alle verplichte velden in." : "Een veld heeft een ongeldige waarde." };
    case "too_small":
      return { message: issue.type === "string" ? "Een veld is leeg of te kort." : "Een waarde is te laag." };
    case "too_big":
      return { message: issue.type === "string" ? "Een tekst is te lang." : "Een waarde is te hoog." };
    case "invalid_string":
      return { message: "Een veld heeft een ongeldige vorm." };
    case "invalid_enum_value":
    case "invalid_union_discriminator":
    case "invalid_literal":
      return { message: "Ongeldige keuze." };
    default:
      return { message: ctx.defaultError };
  }
};

/** Controleer invoer; bij een fout één duidelijke Nederlandse melding (422). */
export function lees<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data, { errorMap: nlFouten });
  if (!r.success) throw AppError.validation(r.error.issues[0]?.message ?? "Controleer je invoer.");
  return r.data;
}

const tekst = (max: number) => z.string().trim().max(max);
const naam = tekst(100).min(2, "Vul een naam in.");
const email = z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").max(200);
const telefoon = tekst(30).regex(/^[0-9+ ()-]*$/, "Vul een geldig telefoonnummer in.");
const kleur = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Kies een kleur.");
const datum = z.string().refine(isDatum, "Kies een datum.");
const datumOfLeeg = z.union([datum, z.literal("")]);
const tijdVeld = z.string().refine(isTijd, "Kies een tijd.");
const id = z.string().min(1).max(40);

export const aanzettenSchema = z.object({
  naam,
  plaats: tekst(80),
  telefoon,
  email: z.union([email, z.literal("")]),
});

export const instellingenSchema = z.object({
  naam,
  plaats: tekst(80),
  adres: tekst(160),
  telefoon,
  email: z.union([email, z.literal("")]),
  kvk: z.string().regex(/^(\d{8})?$/, "Een KVK-nummer heeft 8 cijfers."),
  kleur,
  accent: kleur,
  lesMinuten: z.number().int().min(30).max(180),
  annuleerUren: z.number().int().min(0).max(168),
  proeflesOnline: z.boolean(),
  zelfPlannen: z.boolean(),
  online: z.boolean(),
});

export const werktijdSchema = z
  .object({ dag: z.number().int().min(1).max(7), van: tijdVeld, tot: tijdVeld })
  .refine((w) => w.van < w.tot, "De eindtijd moet na de begintijd liggen.");

export const instructeurSchema = z.object({
  naam,
  email,
  telefoon,
  bio: tekst(600),
  categorieen: z.array(z.enum(["AM", "A", "B", "BE", "C", "CE", "D"])).min(1).max(7),
  werktijden: z.array(werktijdSchema).max(21),
  kleur,
  actief: z.boolean(),
});

export const voertuigSchema = z.object({
  naam: tekst(80).min(2, "Vul een naam in, bijvoorbeeld het merk en model."),
  kenteken: tekst(12),
  automaat: z.boolean(),
  categorie: z.enum(["AM", "A", "B", "BE", "C", "CE", "D"]),
  actief: z.boolean(),
});

export const productSchema = z.object({
  naam: tekst(80).min(2, "Vul een naam in."),
  omschrijving: tekst(400),
  soort: z.enum(["LES", "PAKKET", "EXAMEN", "PROEFLES", "OVERIG"]),
  prijsCent: z.number().int().min(0).max(1_000_000),
  lessen: z.number().int().min(0).max(200),
  lesMinuten: z.number().int().min(30).max(180),
  examen: z.boolean(),
  zichtbaar: z.boolean(),
  populair: z.boolean(),
  volgorde: z.number().int().min(0).max(999),
});

export const leerlingSchema = z.object({
  naam,
  email,
  telefoon,
  adres: tekst(160),
  geboortedatum: datumOfLeeg,
  automaat: z.boolean(),
  status: z.enum(["AANMELDING", "ACTIEF", "GESLAAGD", "GESTOPT"]),
  instructeurId: id.nullable(),
  theorieGehaald: z.boolean(),
  examenDatum: datumOfLeeg,
  notitie: tekst(2000),
});

export const lesSchema = z.object({
  instructeurId: id,
  leerlingId: id.nullable(),
  voertuigId: id.nullable(),
  soort: z.enum(["LES", "PROEFLES", "TOETS", "EXAMEN"]),
  datum,
  tijd: tijdVeld,
  duurMin: z.number().int().min(15).max(300),
  ophaaladres: tekst(160),
});

export const betalingSchema = z.object({
  leerlingId: id,
  productId: id.nullable(),
  bedragCent: z.number().int().min(0).max(1_000_000),
  methode: z.enum(["PIN", "CONTANT", "OVERBOEKING"]),
  omschrijving: tekst(160).min(2, "Waarvoor is de betaling?"),
});

export const correctieSchema = z.object({
  leerlingId: id,
  minuten: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((m) => m !== 0, "Vul een aantal minuten in."),
  omschrijving: tekst(160).min(2, "Waarom deze correctie?"),
});

// --- beheer: één eindpunt, een actie per soort wijziging ----------------------

export const beheerActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("instellingen"), data: instellingenSchema }),
  z.object({ actie: z.literal("website"), data: websiteSchema }),
  z.object({ actie: z.literal("instructeur"), id: id.nullable(), data: instructeurSchema }),
  z.object({ actie: z.literal("voertuig"), id: id.nullable(), data: voertuigSchema }),
  z.object({ actie: z.literal("voertuigWeg"), id }),
  z.object({ actie: z.literal("product"), id: id.nullable(), data: productSchema }),
  z.object({ actie: z.literal("productWeg"), id }),
  z.object({ actie: z.literal("leerling"), id: id.nullable(), data: leerlingSchema }),
  z.object({ actie: z.literal("uitnodigen"), soort: z.enum(["leerling", "instructeur"]), id }),
  z.object({ actie: z.literal("les"), id: id.nullable(), data: lesSchema, mail: z.boolean() }),
  z.object({ actie: z.literal("lesStatus"), id, status: z.enum(["GEPLAND", "VOLTOOID", "GEANNULEERD", "NIET_VERSCHENEN"]), mail: z.boolean() }),
  z.object({ actie: z.literal("betaling"), data: betalingSchema }),
  z.object({ actie: z.literal("correctie"), data: correctieSchema }),
]);

export type BeheerActie = z.infer<typeof beheerActieSchema>;

// --- publieke site ----------------------------------------------------------

export const proeflesSchema = z.object({
  naam,
  email,
  telefoon: telefoon.min(10, "Vul je telefoonnummer in, dan kan de instructeur je bereiken."),
  adres: tekst(160).min(5, "Vul het adres in waar we je ophalen."),
  automaat: z.boolean(),
  instructeurId: id,
  start: z.string().datetime(),
  /** honeypot: mensen laten dit leeg */
  website: z.string().max(0).optional(),
  akkoord: z.literal(true, { errorMap: () => ({ message: "Ga akkoord met het verwerken van je gegevens voor de proefles." }) }),
});

export const accountActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("inloggen"), soort: z.enum(["leerling", "instructeur"]), email, wachtwoord: z.string().min(1).max(200) }),
  z.object({ actie: z.literal("uitloggen") }),
  z.object({ actie: z.literal("vergeten"), soort: z.enum(["leerling", "instructeur"]), email }),
  z.object({ actie: z.literal("wachtwoord"), token: z.string().min(20).max(200), wachtwoord: z.string().min(10, "Kies een wachtwoord van minstens 10 tekens.").max(200) }),
]);

// --- leerling-app -------------------------------------------------------------

export const leerlingActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("annuleer"), lesId: id }),
  z.object({ actie: z.literal("plan"), instructeurId: id, start: z.string().datetime() }),
  z.object({
    actie: z.literal("theorie"),
    onderdeel: z.string().refine((s) => s === "mix" || isTheorieOnderdeel(s), "Onbekend onderdeel."),
    goed: z.number().int().min(0).max(100),
    totaal: z.number().int().min(1).max(100),
  }),
  z.object({ actie: z.literal("profiel"), telefoon, adres: tekst(160) }),
  // online betalen (iDEAL): een pakket kopen of een openstaande betaling voldoen
  // precies één van beide; dat controleert de route (een refine kan niet in een discriminatedUnion)
  z.object({ actie: z.literal("betaal"), productId: id.optional(), betalingId: id.optional() }),
]);

// --- instructeur-app ----------------------------------------------------------

const beoordelingSchema = z.record(
  z.string().refine(isOnderdeel, "Onbekend onderdeel."),
  z.object({ score: z.number().int().min(1).max(5), notitie: tekst(500).optional() }),
);

export const instructeurActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("start"), lesId: id }),
  z.object({
    actie: z.literal("leskaart"),
    lesId: id,
    beoordeling: beoordelingSchema,
    verslag: tekst(2000),
    huiswerk: z.array(z.string().refine(isOnderdeel, "Onbekend onderdeel.")).max(10),
    interneNotitie: tekst(2000),
  }),
  z.object({ actie: z.literal("afronden"), lesId: id, status: z.enum(["VOLTOOID", "NIET_VERSCHENEN"]) }),
  z.object({ actie: z.literal("plan"), leerlingId: id, datum, tijd: tijdVeld, duurMin: z.number().int().min(15).max(300), voertuigId: id.nullable() }),
  z.object({ actie: z.literal("betaling"), leerlingId: id, productId: id.nullable(), bedragCent: z.number().int().min(0).max(1_000_000), methode: z.enum(["PIN", "CONTANT"]), omschrijving: tekst(160).min(2) }),
  // iDEAL in de auto: geeft de betaalpagina terug, de instructeur toont die als QR-code
  z.object({ actie: z.literal("ideal"), leerlingId: id, productId: id.nullable(), bedragCent: z.number().int().min(100).max(1_000_000), omschrijving: tekst(160).min(2) }),
]);
