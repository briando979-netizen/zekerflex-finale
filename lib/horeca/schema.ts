import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MODULE_SLEUTELS } from "@/lib/horeca/modules";
import { isTijd } from "@/lib/horeca/tijden";
import { SOORTEN } from "@/lib/horeca/soorten";
import { MAX_AANTAL, MAX_REGELS } from "@/lib/horeca/bestellen";

// Invoer van het horecabeheer (/api/horeca/beheer). Eén POST met een "actie";
// alles wat de zaak wijzigt, gaat langs deze schema's.

const tekst = (max: number) => z.string().trim().max(max);
const kleur = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Kies een kleur.");
const tijd = z.string().refine(isTijd, "Gebruik UU:MM.");
const id = z.string().min(1).max(40);
const mandSchema = z
  .array(z.object({ itemId: id, aantal: z.number().int().min(1).max(MAX_AANTAL), opmerking: tekst(140).optional() }))
  .min(1, "Je mandje is leeg.")
  .max(MAX_REGELS);

export const aanzettenSchema = z.object({
  actie: z.literal("aanzetten"),
  naam: tekst(80).pipe(z.string().min(2, "Vul de naam van de zaak in.")),
  soort: z.enum(SOORTEN),
  plaats: tekst(80).default(""),
  telefoon: tekst(40).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
});

export const beheerActieSchema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("gegevens"),
    naam: tekst(80).pipe(z.string().min(2, "Vul de naam van de zaak in.")),
    soort: z.enum(SOORTEN),
    plaats: tekst(80),
    adres: tekst(160),
    telefoon: tekst(40),
    email: z.union([z.literal(""), z.string().trim().email().max(200)]),
    kvk: tekst(20),
    kleur,
    accent: kleur,
    kop: tekst(120),
    intro: tekst(600),
  }),
  z.object({ actie: z.literal("online"), online: z.boolean() }),
  z.object({
    actie: z.literal("openingstijden"),
    tijden: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.object({ van: tijd, tot: tijd }).nullable()),
  }),
  z.object({ actie: z.literal("module"), module: z.enum(MODULE_SLEUTELS), aan: z.boolean() }),
  z.object({ actie: z.literal("categorie"), id: id.optional(), naam: tekst(60).pipe(z.string().min(1, "Geef de categorie een naam.")) }),
  z.object({ actie: z.literal("categorie-weg"), id }),
  z.object({
    actie: z.literal("item"),
    id: id.optional(),
    categorieId: id.nullable(),
    naam: tekst(80).pipe(z.string().min(1, "Geef het gerecht een naam.")),
    omschrijving: tekst(300),
    prijsCent: z.number().int().min(0).max(100_000_00),
    allergenen: z.array(z.string().max(20)).max(14),
    vegetarisch: z.boolean(),
    veganistisch: z.boolean(),
    beschikbaar: z.boolean(),
    station: z.enum(["keuken", "bar"]),
  }),
  z.object({ actie: z.literal("item-weg"), id }),
  z.object({ actie: z.literal("beschikbaar"), id, beschikbaar: z.boolean() }),
  z.object({
    actie: z.literal("tafel"),
    id: id.optional(),
    naam: tekst(30).pipe(z.string().min(1, "Geef de tafel een naam of nummer.")),
    plaatsen: z.number().int().min(1).max(40),
    zone: tekst(30),
    actief: z.boolean(),
  }),
  z.object({ actie: z.literal("tafel-weg"), id }),
  z.object({ actie: z.literal("tafel-code"), id }),
  z.object({ actie: z.literal("bestelling"), tafelId: id.nullable(), mand: mandSchema, opmerking: tekst(300), naam: tekst(60) }),
  z.object({ actie: z.literal("bestelstatus"), id, status: z.enum(["NIEUW", "IN_BEREIDING", "KLAAR", "GESERVEERD", "GEANNULEERD"]) }),
]);

/** Een gast bestelt via de QR-code op tafel (/api/horeca/site/<slug>/bestellen). */
export const gastBestellingSchema = z.object({ code: z.string().min(6).max(40), mand: mandSchema, opmerking: tekst(300).default(""), naam: tekst(60).default("") });

export type BeheerActie = z.infer<typeof beheerActieSchema>;

/** Parse of gooi een nette Nederlandse fout (eerste melding). */
export function lees<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw AppError.validation(r.error.issues[0]?.message ?? "Controleer de invoer.", r.error.flatten());
  return r.data as z.output<S>;
}
