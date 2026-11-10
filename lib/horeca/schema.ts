import { z } from "zod";
import { AppError } from "@/lib/errors";
import { MODULE_SLEUTELS } from "@/lib/horeca/modules";
import { isTijd } from "@/lib/horeca/tijden";
import { SOORTEN } from "@/lib/horeca/soorten";
import { MAX_AANTAL, MAX_REGELS } from "@/lib/horeca/bestellen";
import { MOMENTEN } from "@/lib/horeca/taken";
import { SCHERM_ROLLEN } from "@/lib/horeca/schermen";
import { MAX_GROEPEN, MAX_KEUZES } from "@/lib/horeca/opties";

// Invoer van het horecabeheer (/api/horeca/beheer). Eén POST met een "actie";
// alles wat de zaak wijzigt, gaat langs deze schema's.

const tekst = (max: number) => z.string().trim().max(max);
const btwTarief = z.union([z.literal(9), z.literal(21), z.literal(0)]);
const methode = z.enum(["pin", "contant", "ideal", "overig"]);
const centen = (max: number) => z.number().int().min(0).max(max);
const kleur = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Kies een kleur.");
const tijd = z.string().refine(isTijd, "Gebruik UU:MM.");
const id = z.string().min(1).max(40);
const gekozenSchema = z.array(z.object({ groep: tekst(40), keuzes: z.array(tekst(40)).max(MAX_KEUZES) })).max(MAX_GROEPEN);
const optieGroepSchema = z.object({
  naam: tekst(40).pipe(z.string().min(1)),
  keuzes: z.array(z.object({ naam: tekst(40).pipe(z.string().min(1)), prijsCent: z.number().int().min(0).max(100_000) })).min(1).max(MAX_KEUZES),
  verplicht: z.boolean(),
  meer: z.boolean(),
});
const mandSchema = z
  .array(z.object({ itemId: id, aantal: z.number().int().min(1).max(MAX_AANTAL), opmerking: tekst(140).optional(), opties: gekozenSchema.optional() }))
  .min(1, "Je mandje is leeg.")
  .max(MAX_REGELS);

export const aanzettenSchema = z.object({
  actie: z.literal("aanzetten"),
  naam: tekst(80).pipe(z.string().min(2, "Vul de naam van de zaak in.")),
  soort: z.enum(SOORTEN),
  plaats: tekst(80).default(""),
  adres: tekst(160).default(""),
  telefoon: tekst(40).default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).default(""),
  kvk: tekst(20).default(""),
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
    btw: btwTarief.default(9),
    opties: z.array(optieGroepSchema).max(MAX_GROEPEN).default([]),
    voorraad: z.number().int().min(0).max(100_000).nullable().default(null),
  }),
  z.object({ actie: z.literal("voorraad"), id, voorraad: z.number().int().min(0).max(100_000).nullable() }),
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
  z.object({
    actie: z.literal("reservering"),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Kies een datum."),
    tijd,
    personen: z.number().int().min(1).max(500),
    naam: tekst(80).pipe(z.string().min(2, "Vul de naam in.")),
    email: z.union([z.literal(""), z.string().trim().email().max(200)]),
    telefoon: tekst(40),
    opmerking: tekst(500),
  }),
  z.object({ actie: z.literal("reservering-status"), id, status: z.enum(["BEVESTIGD", "AANGEKOMEN", "NIET_GEKOMEN", "GEANNULEERD"]) }),
  z.object({ actie: z.literal("reservering-tafel"), id, tafelId: id.nullable() }),
  z.object({ actie: z.literal("kassa-instellingen"), btwNummer: tekst(30), voettekst: tekst(300) }),
  z.object({ actie: z.literal("kas-tellen"), datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Kies een datum."), geteldCent: centen(10_000_000) }),
  z.object({
    actie: z.literal("reserveer-instellingen"),
    slotMinuten: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    verblijfMinuten: z.number().int().min(30).max(360),
    maxGroep: z.number().int().min(1).max(100),
    dagenVooruit: z.number().int().min(1).max(365),
    maxGasten: z.number().int().min(0).max(2000),
  }),
]);

const datumSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Kies een datum.");

/** Takenlijsten (module taken): eigen schema, zodat de grote unie hierboven overzichtelijk blijft. */
export const takenActieSchema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("takenlijst"),
    id: id.optional(),
    naam: tekst(60).pipe(z.string().min(1, "Geef de lijst een naam.")),
    moment: z.enum(MOMENTEN),
    regels: z.string().max(6000),
  }),
  z.object({ actie: z.literal("takenlijst-weg"), id }),
  z.object({ actie: z.literal("takenlijst-voorbeeld") }),
  z.object({ actie: z.literal("afvinken"), lijstId: id, datum: datumSchema, taak: z.number().int().min(0).max(39), waarde: tekst(20).default(""), door: tekst(60).default("") }),
  z.object({ actie: z.literal("afvinken-weg"), lijstId: id, datum: datumSchema, taak: z.number().int().min(0).max(39) }),
]);
export const TAKEN_ACTIES: readonly string[] = ["takenlijst", "takenlijst-weg", "takenlijst-voorbeeld", "afvinken", "afvinken-weg"];

const oproepSoort = z.enum(["ober", "rekening"]);
const reserveringStatus = z.enum(["BEVESTIGD", "AANGEKOMEN", "NIET_GEKOMEN", "GEANNULEERD"]);

/** Het live-dashboard en de schermen-tab in het beheer: apparaten koppelen, oproepen afhandelen, tafels. */
export const liveActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("apparaat"), id: id.optional(), naam: tekst(40).pipe(z.string().min(1, "Geef het apparaat een naam, bijvoorbeeld Tablet keuken.")), rol: z.enum(SCHERM_ROLLEN) }),
  z.object({ actie: z.literal("apparaat-code"), id }),
  z.object({ actie: z.literal("apparaat-weg"), id }),
  z.object({ actie: z.literal("oproep-af"), tafelId: id, soort: oproepSoort.optional() }),
  z.object({ actie: z.literal("tafel-vrij"), tafelId: id }),
  z.object({ actie: z.literal("serveer"), tafelId: id }),
  z.object({ actie: z.literal("afrekenen"), tafelId: id, methode }),
]);
export const LIVE_ACTIES: readonly string[] = ["apparaat", "apparaat-code", "apparaat-weg", "oproep-af", "tafel-vrij", "serveer", "afrekenen"];

/** Wat een gekoppeld scherm kan doen (/api/horeca/scherm); welk scherm wat mag staat in lib/horeca/schermen.ts. */
export const schermActieSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("fase"), id, stap: z.enum(["start", "klaar", "terugNaarBezig", "terugNaarNieuw"]) }),
  // één bestelling (id) of alles wat klaarstaat aan een tafel (tafelId); terug = per ongeluk afgevinkt
  z.object({ actie: z.literal("serveer"), id: id.nullable().default(null), tafelId: id.nullable().default(null), terug: z.boolean().default(false) }),
  z.object({ actie: z.literal("bestelling"), tafelId: id.nullable(), mand: mandSchema, opmerking: tekst(300).default(""), naam: tekst(60).default("") }),
  z.object({ actie: z.literal("uitverkocht"), id, beschikbaar: z.boolean() }),
  z.object({ actie: z.literal("voorraad"), id, voorraad: z.number().int().min(0).max(100_000).nullable() }),
  z.object({ actie: z.literal("reservering-status"), id, status: reserveringStatus }),
  z.object({ actie: z.literal("reservering-tafel"), id, tafelId: id.nullable() }),
  z.object({ actie: z.literal("inloop"), personen: z.number().int().min(1).max(100), naam: tekst(80).default(""), tafelId: id.nullable().default(null) }),
  z.object({ actie: z.literal("oproep-af"), tafelId: id, soort: oproepSoort.optional() }),
  z.object({ actie: z.literal("tafel-vrij"), tafelId: id }),
  // kassa: een tafel of één bestelling, alles of per gerecht, in een of meer delen
  z.object({
    actie: z.literal("afrekenen"),
    tafelId: id.nullable().default(null),
    bestellingId: id.nullable().default(null),
    selectie: z.array(z.object({ bestellingId: id, index: z.number().int().min(0).max(MAX_REGELS), aantal: z.number().int().min(1).max(MAX_AANTAL) })).max(200).nullable().default(null),
    delen: z.array(z.object({ methode, bedragCent: centen(10_000_000).default(0), fooiCent: centen(100_000).default(0) })).min(1, "Kies hoe er betaald wordt.").max(20),
  }),
  // snelle verkoop aan de bar of balie: bestellen en meteen afrekenen
  z.object({ actie: z.literal("verkoop"), mand: mandSchema, methode, fooiCent: centen(100_000).default(0), meegegeven: z.boolean().default(false) }),
]);
export type SchermActieInvoer = z.output<typeof schermActieSchema>;

/** Een gast aan tafel roept de ober of vraagt de rekening (/api/horeca/site/<slug>/oproep). */
export const gastOproepSchema = z.object({ code: z.string().min(6).max(40), soort: oproepSoort });

/** Een apparaat koppelen met de code uit het beheer (/api/horeca/scherm/koppel). */
export const koppelSchema = z.object({ code: z.string().trim().min(6).max(20) });

/** Een gast reserveert online (/api/horeca/site/<slug>/reserveren). */
export const gastReserveringSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Kies een datum."),
  tijd,
  personen: z.number().int().min(1).max(100),
  naam: tekst(80).pipe(z.string().min(2, "Vul je naam in.")),
  email: z.string().trim().email("Vul een geldig e-mailadres in.").max(200),
  telefoon: tekst(40).pipe(z.string().min(6, "Vul je telefoonnummer in.")),
  opmerking: tekst(500).default(""),
});

/** Een gast bestelt via de QR-code op tafel (/api/horeca/site/<slug>/bestellen). */
export const gastBestellingSchema = z.object({ code: z.string().min(6).max(40), mand: mandSchema, opmerking: tekst(300).default(""), naam: tekst(60).default("") });

/** Het geld van de zaak bij Stripe (Afrekenen → Jullie geld): automatisch uitbetalen aan/uit, of zelf opnemen (lib/horeca/uitbetalen.ts). */
export const uitbetaalSchema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("uitbetalen-automatisch"), aan: z.boolean() }),
  z.object({ actie: z.literal("uitbetalen-opnemen"), bedragCent: z.number().int().min(100).max(100_000_000).optional() }),
]);

export type BeheerActie = z.infer<typeof beheerActieSchema>;

/** Parse of gooi een nette Nederlandse fout (eerste melding). */
export function lees<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw AppError.validation(r.error.issues[0]?.message ?? "Controleer de invoer.", r.error.flatten());
  return r.data as z.output<S>;
}
