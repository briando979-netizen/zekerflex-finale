import { KOLOMMEN, Schrijver, type EscPosOpties } from "@/lib/locatie/escpos";
import { bonOpmaak, type KassaBon } from "@/lib/sites/kassa";

// ---------------------------------------------------------------------------
// De kassabon (lib/sites/kassa.ts) als ESC/POS-bytes voor een thermische bonprinter van 58 of
// 80 mm, via Bluetooth vanuit de browser (components/locatie/BluetoothPrint.tsx). Puur bestand.
// ---------------------------------------------------------------------------

export function bonNaarEscPos(bon: KassaBon, opties: EscPosOpties = { rol: 58, snijden: true }): Uint8Array {
  const kol = KOLOMMEN[opties.rol];
  const { kop, regels, voet } = bonOpmaak(bon, kol);
  const w = new Schrijver().init().uitlijnen("midden");
  kop.forEach((r, i) => (i === 0 ? w.vet(true).tekst(r).vet(false) : w.tekst(r)));
  w.leeg().uitlijnen("links");
  for (const r of regels) {
    const totaal = r.startsWith("Totaal");
    if (totaal) w.vet(true);
    w.tekst(r);
    if (totaal) w.vet(false);
  }
  w.leeg().uitlijnen("midden");
  for (const r of voet) w.tekst(r);
  w.leeg(3);
  if (opties.snijden) w.snijden();
  return w.klaar();
}
