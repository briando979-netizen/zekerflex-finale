import { bouwer, bouwerIngesteld } from "@/lib/bouwer/werker";
import type { ControleBezig, ControleKort, ControlesStand, ControleUitslag } from "@/lib/bouwer/controles-tekst";

// ---------------------------------------------------------------------------
// De controle vóór het live zetten: de eigen "CI" van ZekerFlex, op de eigen
// server. De Bouwer-container (deploy/bouwer/werker/controle.mjs) draait voor
// een vastlegging van GitHub main TypeScript op het hele project, eslint op de
// gewijzigde bestanden en de tests die die bestanden raken, en bewaart de
// uitslag. De live-zetter weigert een versie die faalt (tenzij "zonder
// controle"); de planner laat elke 10 minuten de nieuwste main alvast
// controleren, zodat Admin → ZekerFlex AI → Live zetten meteen ziet of main
// schoon is. Dit bestand praat met die container; types en teksten staan in
// lib/bouwer/controles-tekst.ts (ook voor de client).
// ---------------------------------------------------------------------------

export type { ControleBezig, ControleKort, ControlesStand, ControleUitslag };

export async function lijstControles(): Promise<ControlesStand> {
  return bouwer<ControlesStand>("/controles");
}

export async function controleVan(sha: string): Promise<ControleUitslag> {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Onbekende vastlegging");
  return bouwer<ControleUitslag>(`/controles/${sha}`);
}

/** Een controle starten op de achtergrond; de Bouwer weigert (409) als er al een loopt of hij zelf aan het werk is. */
export async function startControle(doel = "main", door = "app", opnieuw = false, vanaf?: string): Promise<{ bezig: ControleBezig }> {
  // vanaf = de live VERSIE (volledige sha): eslint en tests dekken dan het hele stuk tussen live en doel, niet alleen sinds de vorige controle
  return bouwer<{ bezig: ControleBezig }>("/controles", { method: "POST", body: { sha: doel, door, opnieuw, ...(vanaf ? { vanaf } : {}) } });
}

/** Voor Admin → Systeem: de nieuwste uitslag, of null als de Bouwer er niet is of niet antwoordt. */
export async function nieuwsteControle(): Promise<ControleKort | null> {
  if (!bouwerIngesteld()) return null;
  try {
    return (await lijstControles()).uitslagen[0] ?? null;
  } catch {
    return null;
  }
}
