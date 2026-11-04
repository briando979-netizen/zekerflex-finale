import { z } from "zod";
import { VERKOPER_CATEGORIEEN } from "@/lib/shop/verkoper-core";

// Invoer voor een verkopersproduct (Studio → Verkopen). Prijzen in centen, incl. btw.
const naam = z.string().trim().min(3, "Geef het product een naam van minstens 3 tekens.").max(90, "De naam mag hoogstens 90 tekens zijn.");
const omschrijving = z.string().trim().min(20, "Beschrijf het product in minstens 20 tekens.").max(3000, "De omschrijving mag hoogstens 3000 tekens zijn.");
const prijsCents = z.number().int().min(100, "De prijs is minstens € 1,00.").max(500_000, "De prijs is hoogstens € 5.000.");
const voorraad = z.number().int().min(0, "De voorraad kan niet negatief zijn.").max(10_000, "De voorraad is hoogstens 10.000.");
const fotoId = z.string().trim().min(10).max(64);

export const nieuwProductSchema = z.object({
  naam,
  omschrijving,
  categorie: z.enum(VERKOPER_CATEGORIEEN),
  prijsCents,
  voorraad: voorraad.default(0),
  maten: z
    .array(z.object({ maat: z.string().trim().min(1, "Vul elke maat in.").max(20), voorraad }))
    .max(12, "Hoogstens 12 maten.")
    .default([])
    .refine((m) => new Set(m.map((x) => x.maat.toLowerCase())).size === m.length, "Elke maat mag maar één keer."),
  fotoUploadId: fotoId.nullable().default(null),
});

export const wijzigProductSchema = z.object({
  naam: naam.optional(),
  omschrijving: omschrijving.optional(),
  categorie: z.enum(VERKOPER_CATEGORIEEN).optional(),
  prijsCents: prijsCents.optional(),
  fotoUploadId: fotoId.optional(),
  voorraad: z.record(z.string().max(64), voorraad).optional(),
  pauze: z.boolean().optional(),
});
