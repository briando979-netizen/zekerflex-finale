// ---------------------------------------------------------------------------
// Wat er van de chip komt (de Android-app leest hem via NFC, zie
// android-twa/.../ChipActivity.java), tot een uitslag: de MRZ uit DG1 en de
// passieve authenticatie (lib/kyc/chip/sod.ts). "Echt" betekent: de gegevens
// staan precies zo op een chip die door een vertrouwde overheid is ondertekend.
// Puur (de CSCA's komen als argument): los te testen in tests/kyc-chip.test.ts.
// ---------------------------------------------------------------------------

import type { X509Certificate } from "node:crypto";
import { kinderen, leesEen } from "@/lib/kyc/chip/der";
import { controleerSod, type SodControle } from "@/lib/kyc/chip/sod";
import { leesMrz, type MrzFormaat, type MrzUitslag } from "@/lib/kyc/mrz";

/** DG1 (tag 0x61) bevat de MRZ als één tekst (tag 0x5F1F): 90 tekens bij een ID-kaart, 88 bij een paspoort. */
export function mrzUitDg1(dg1: Buffer): { formaat: MrzFormaat; regels: string[] } | null {
  try {
    const top = leesEen(dg1);
    if (top.tag !== 0x61) return null;
    const veld = kinderen(top).find((k) => k.tag === 0x5f1f);
    if (!veld) return null;
    const t = veld.waarde.toString("latin1");
    const knip = (n: number) => Array.from({ length: t.length / n }, (_, i) => t.slice(i * n, (i + 1) * n));
    if (t.length === 90) return { formaat: "TD1", regels: knip(30) };
    if (t.length === 72) return { formaat: "TD2", regels: knip(36) };
    if (t.length === 88) return { formaat: "TD3", regels: knip(44) };
    return null;
  } catch {
    return null;
  }
}

export interface ChipUitslag extends SodControle {
  /** de MRZ zoals op de chip (met controlecijfers); het BSN-veld zit er al niet meer in */
  mrz: MrzUitslag | null;
  /**
   * Alles klopt: hashes, handtekening, keten naar een vertrouwde CSCA, certificaten
   * geldig, een geldige MRZ en een niet verlopen document. Let op (review H3):
   * "echt" zegt dat de gegevens door de overheid zijn ondertekend, niet dat wie ze
   * instuurt de kaart ook vasthoudt (geen actieve authenticatie).
   */
  echt: boolean;
}

export function controleerChip(d: { dg1: Buffer; dg2?: Buffer; sod: Buffer }, csca: X509Certificate[], nu: Date = new Date()): ChipUitslag {
  const groepen: Record<number, Buffer> = { 1: d.dg1, ...(d.dg2 ? { 2: d.dg2 } : {}) };
  const sod = controleerSod(d.sod, groepen, csca, nu);
  const gevonden = mrzUitDg1(d.dg1);
  const mrz = gevonden ? leesMrz(gevonden.formaat, gevonden.regels, nu) : null;
  if (!mrz) sod.fouten.push("De gegevens op de chip (DG1) zijn niet te lezen");
  return { ...sod, mrz, echt: sod.hashesOk && sod.handtekeningOk && sod.ketenOk === true && sod.geldigOk && mrz?.geldig === true && !mrz.verlopen };
}
