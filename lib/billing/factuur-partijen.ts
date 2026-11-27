// ---------------------------------------------------------------------------
// Afzender en ontvanger op de factuur-pdf (lib/pdf/documents.ts), puur. Een factuur moet de naam en het adres van
// beide partijen noemen, het btw-identificatienummer van de afzender, en bij verlegde btw ook dat van de ontvanger
// (art. 35a Wet OB); het KVK-nummer hoort er volgens het Handelsregisterbesluit bij. De e-factuur haalt dezelfde
// gegevens op (lib/efactuur/factuur.ts). Wat ontbreekt, laten we weg: nooit een lege regel of een gok.
// ---------------------------------------------------------------------------

export interface FactuurPartij {
  naam: string;
  straat?: string | undefined;
  postcode?: string | undefined;
  plaats?: string | undefined;
  /** ISO-landcode; NL wordt niet afgedrukt */
  land?: string | undefined;
  kvk?: string | undefined;
  btw?: string | undefined;
}

/** De regels onder de naam: straat, postcode en plaats, KVK, btw-id (alleen wat bekend is). */
export function partijRegels(p: FactuurPartij): string[] {
  const regels: string[] = [];
  if (p.straat?.trim()) regels.push(p.straat.trim());
  const plaats = [p.postcode?.trim(), p.plaats?.trim()].filter(Boolean).join(" ");
  const land = p.land?.trim().toUpperCase();
  if (plaats) regels.push(land && land !== "NL" ? `${plaats} (${land})` : plaats);
  else if (land && land !== "NL") regels.push(land);
  if (p.kvk?.trim()) regels.push(`KVK ${p.kvk.trim()}`);
  if (p.btw?.trim()) regels.push(`Btw-id ${p.btw.trim().replace(/\s+/g, "").toUpperCase()}`);
  return regels;
}

/** "Hoofdstraat" + "12a" → "Hoofdstraat 12a" (het Handelsregister geeft ze los). */
export const straatMetNummer = (straat: string | null | undefined, nummer: string | null | undefined): string | undefined => {
  const s = [straat?.trim(), nummer?.trim()].filter(Boolean).join(" ");
  return s || undefined;
};
