// Invoer van een zakelijk offerteverzoek uit de webshop (POST /api/shop/offerte).
// Apart van lib/shop/zakelijk.ts, omdat de browser geen zod mag meeladen.

import { z } from "zod";
import { OFFERTE_WENSEN } from "@/lib/shop/zakelijk";

export const offerteSchema = z.object({
  bedrijf: z.string().trim().min(2).max(160),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().max(40).optional(),
  medewerkers: z.number().int().min(1).max(100_000).optional(),
  wensen: z.array(z.enum(OFFERTE_WENSEN)).max(3).default([]),
  bericht: z.string().trim().max(2000).optional(),
  lijst: z.string().trim().max(4000).optional(),
  akkoord: z.literal(true),
});
export type Offerte = z.infer<typeof offerteSchema>;

const WENS_TEKST: Record<(typeof OFFERTE_WENSEN)[number], string> = {
  logo: "logo of bedrukking",
  rekening: "bestellen op rekening",
  vestigingen: "leveren op meerdere adressen",
};

/** De notitie bij de lead in de salespijplijn (platte tekst). */
export function offerteNotitie(o: Offerte): string {
  return [
    "Offerteverzoek uit de zakelijke webshop (/shop/zakelijk).",
    o.medewerkers ? `Medewerkers: ${o.medewerkers}.` : null,
    o.wensen.length ? `Wensen: ${o.wensen.map((w) => WENS_TEKST[w]).join(", ")}.` : null,
    o.lijst ? `Bestellijst:\n${o.lijst}` : null,
    o.bericht ? `Bericht: ${o.bericht}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Testadressen (RFC 2606 en .test/.invalid) maken geen lead en sturen geen mail naar sales. */
export const isTestOfferte = (email: string): boolean => /@([a-z0-9-]+\.)*(example\.(com|net|org)|test|invalid|localhost)$/i.test(email.trim());
