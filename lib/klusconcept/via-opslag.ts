import { kvGet, kvSet } from "@/lib/storage/kv";
import { telViaStap, viaSleutel, type ViaStap, type ViaTelling } from "@/lib/klusconcept/via";

// De maandtelling van /klus-plaatsen?via=werker (lib/klusconcept/via.ts): een totaal per maand, nooit een persoon, een tijdstip per
// bezoek of een adres. Zoals meting:id-soort (lib/kyc/id-soort-meting.ts): geen gebruikers-id in de sleutel, dus niet in
// ERASABLE_KV_PREFIXES. Een storing telt niet en houdt niets tegen.

export async function telKlusVia(stap: ViaStap, nu: Date = new Date()): Promise<void> {
  const sleutel = viaSleutel(nu);
  await kvSet(sleutel, telViaStap(await kvGet<Partial<ViaTelling>>(sleutel), stap));
}

/** De telling van de maand van `nu` (nullen als er nog niets is). */
export async function leesKlusVia(nu: Date = new Date()): Promise<ViaTelling> {
  const t = await kvGet<Partial<ViaTelling>>(viaSleutel(nu)).catch(() => null);
  return { bezoek: Number(t?.bezoek) || 0, concept: Number(t?.concept) || 0 };
}
