// ---------------------------------------------------------------------------
// ESC/POS: de printtaal van bijna elke thermische bon- en labelprinter (Epson,
// Star, Sunmi, de goedkope Bluetooth-printers van 58/80 mm). We maken hier de
// ruwe bytes voor één label of bon; de browser stuurt ze via Web Bluetooth
// naar de printer, de printagent op een computer via CUPS (lp -o raw).
// Puur bestand: geen DOM, geen node-modules, dus ook in de browser en in tests.
// ---------------------------------------------------------------------------

import { knipRegel, type LabelInhoud } from "./modules";

const ESC = 0x1b;
const GS = 0x1d;

/** Tekens per regel op een 58 mm-rol (standaard lettertype) en 80 mm. */
export const KOLOMMEN = { 58: 32, 80: 48 } as const;
export type Rolbreedte = keyof typeof KOLOMMEN;

export interface EscPosOpties {
  rol: Rolbreedte;
  /** papier afsnijden aan het einde (bonprinters met mes) */
  snijden: boolean;
}

/** Latin-1 (codetabel 0, "PC437/WPC1252"-achtig): accenten gaan mee, de rest wordt een vraagteken. */
export function naarBytes(tekst: string): number[] {
  const out: number[] = [];
  for (const ch of tekst.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 63;
    if (c === 0x20ac) out.push(0x80); // € in WPC1252
    else if (c < 0x100) out.push(c);
    else if (c === 0x2026) out.push(0x2e, 0x2e, 0x2e); // … → ...
    else out.push(0x3f);
  }
  return out;
}

/** Bouwt ESC/POS-bytes regel voor regel; ook gebruikt voor de kassabon (lib/sites/kassa-escpos.ts). */
export class Schrijver {
  private bytes: number[] = [];
  init(): this {
    this.bytes.push(ESC, 0x40); // reset
    this.bytes.push(ESC, 0x74, 0x10); // codetabel WPC1252
    return this;
  }
  uitlijnen(hoe: "links" | "midden" | "rechts"): this {
    this.bytes.push(ESC, 0x61, hoe === "links" ? 0 : hoe === "midden" ? 1 : 2);
    return this;
  }
  /** breedte en hoogte 1–8 (vermenigvuldiging) */
  grootte(b: number, h: number): this {
    const bb = Math.min(8, Math.max(1, b)) - 1;
    const hh = Math.min(8, Math.max(1, h)) - 1;
    this.bytes.push(GS, 0x21, (bb << 4) | hh);
    return this;
  }
  vet(aan: boolean): this {
    this.bytes.push(ESC, 0x45, aan ? 1 : 0);
    return this;
  }
  tekst(s: string): this {
    this.bytes.push(...naarBytes(s), 0x0a);
    return this;
  }
  leeg(n = 1): this {
    for (let i = 0; i < n; i++) this.bytes.push(0x0a);
    return this;
  }
  lijn(kolommen: number): this {
    return this.tekst("-".repeat(kolommen));
  }
  /** QR-code via de ingebouwde QR-functie van de printer (model 2, maat 6, foutcorrectie M). */
  qr(data: string): this {
    const d = naarBytes(data);
    const len = d.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;
    this.bytes.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06); // maat 6
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // foutcorrectie M
    this.bytes.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...d); // opslaan
    this.bytes.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // printen
    return this;
  }
  snijden(): this {
    this.bytes.push(GS, 0x56, 0x42, 0x00); // gedeeltelijk afsnijden na doorvoer
    return this;
  }
  klaar(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Eén label of bon als ESC/POS-bytes. Badges en naamstickers krijgen de naam
 * groot; een incheckbon een kopregel; een verzendlabel het adres regel voor regel.
 */
export function labelNaarEscPos(inhoud: LabelInhoud, opties: EscPosOpties = { rol: 58, snijden: true }): Uint8Array {
  const kol = KOLOMMEN[opties.rol];
  const w = new Schrijver().init();
  if (inhoud.soort === "incheckbon") {
    w.uitlijnen("midden").vet(true).grootte(1, 2).tekst(knipRegel("Ingecheckt", kol)).grootte(1, 1).vet(false);
    if (inhoud.tijd) w.tekst(knipRegel(inhoud.tijd, kol));
    w.lijn(kol).uitlijnen("links");
  }
  w.uitlijnen(inhoud.soort === "verzendlabel" ? "links" : "midden");
  const kopGroot = inhoud.soort !== "verzendlabel";
  if (kopGroot) w.vet(true).grootte(2, 2);
  // bij dubbele breedte passen half zoveel tekens op een regel
  w.tekst(knipRegel(inhoud.kop, kopGroot ? Math.floor(kol / 2) : kol));
  if (kopGroot) w.grootte(1, 1).vet(false);
  for (const r of inhoud.regels) if (r.trim()) w.tekst(knipRegel(r, kol));
  if (inhoud.soort !== "incheckbon" && inhoud.tijd) w.tekst(knipRegel(inhoud.tijd, kol));
  if (inhoud.qr) w.leeg().uitlijnen("midden").qr(inhoud.qr);
  if (inhoud.voet) w.leeg().uitlijnen("midden").tekst(knipRegel(inhoud.voet, kol));
  w.leeg(3);
  if (opties.snijden) w.snijden();
  return w.klaar();
}

/** Bluetooth-printers melden zich meestal met deze dienst (0x18F0) en dit schrijfkanaal (0x2AF1). */
export const BLUETOOTH_PRINT = {
  diensten: ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455"],
  schrijfKenmerken: ["00002af1-0000-1000-8000-00805f9b34fb", "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", "49535343-8841-43f4-a8d4-ecbe34729bb3"],
  /** per schrijfactie, veilig voor de kleinste buffers */
  brokGrootte: 100,
} as const;

/** Grote bytereeksen in brokken, want een Bluetooth-schrijfactie neemt maar ~100–512 bytes tegelijk. */
export function inBrokken(bytes: Uint8Array, grootte = BLUETOOTH_PRINT.brokGrootte): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += grootte) out.push(bytes.slice(i, i + grootte));
  return out;
}
