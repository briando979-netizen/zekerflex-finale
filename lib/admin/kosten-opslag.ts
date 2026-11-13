import { z } from "zod";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { STANDAARD_POSTEN, pasToe, type KostenStand, type KostenWijziging } from "@/lib/admin/kosten";

// ---------------------------------------------------------------------------
// De bewerkbare kostenlijst van Beheer -> Kosten: een KV-sleutel voor de hele site (niet per gebruiker, dus niet
// in ERASABLE_KV_PREFIXES). Zonder opgeslagen stand gelden de startgegevens uit lib/admin/kosten.ts. Alleen
// PLATFORM_ADMIN komt hier via de route /api/admin/kosten.
// ---------------------------------------------------------------------------

const KEY = "admin:kosten";

export const postSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Ongeldige sleutel."),
  naam: z.string().trim().min(1, "Geef de post een naam.").max(80),
  soort: z.enum(["handmatig", "schatting"]),
  bedragCent: z.number().int().min(0).max(100_000_000).nullable(),
  munt: z.enum(["EUR", "USD"]),
  per: z.enum(["maand", "jaar", "eenmalig"]),
  btwPct: z.number().int().min(0).max(100).nullable(),
  bron: z.string().trim().min(1, "Vul in waar het bedrag vandaan komt.").max(120),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-DD.").nullable(),
  opmerking: z.string().trim().max(200).optional(),
});

export const wijzigingSchema = z.union([z.object({ upsert: postSchema }).strict(), z.object({ verwijder: z.string().regex(/^[a-z0-9-]{1,40}$/) }).strict()]);

const standaard = (): KostenStand => ({ posten: STANDAARD_POSTEN, versie: 0, bijgewerktOp: null });

/** De opgeslagen stand, of de startgegevens als er nog niets is bewaard (of de opslag even niet antwoordt). */
export async function leesKosten(): Promise<KostenStand> {
  const raw = await kvGet<Partial<KostenStand>>(KEY).catch(() => null);
  if (!raw || !Array.isArray(raw.posten)) return standaard();
  return { posten: raw.posten, versie: typeof raw.versie === "number" ? raw.versie : 0, bijgewerktOp: typeof raw.bijgewerktOp === "string" ? raw.bijgewerktOp : null };
}

/** Past een gevalideerde wijziging toe, bewaart hem en geeft de nieuwe serverversie terug. */
export async function wijzigKosten(wijziging: KostenWijziging, nu = new Date()): Promise<KostenStand> {
  const volgende = pasToe(await leesKosten(), wijziging, nu);
  await kvSet(KEY, volgende);
  return volgende;
}
