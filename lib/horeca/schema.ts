import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MODULE_SLEUTELS } from "@/lib/horeca/modules";
import { isTijd } from "@/lib/horeca/tijden";
import { SOORTEN } from "@/lib/horeca/soorten";

// Invoer van het horecabeheer (/api/horeca/beheer). Eén POST met een "actie";
// alles wat de zaak wijzigt, gaat langs deze schema's.

const tekst = (max: number) => z.string().trim().max(max);
const kleur = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Kies een kleur.");
const tijd = z.string().refine(isTijd, "Gebruik UU:MM.");
const id = z.string().min(1).max(40);

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
]);

export type BeheerActie = z.infer<typeof beheerActieSchema>;

/** Parse of gooi een nette Nederlandse fout (eerste melding). */
export function lees<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw AppError.validation(r.error.issues[0]?.message ?? "Controleer de invoer.", r.error.flatten());
  return r.data as z.output<S>;
}
