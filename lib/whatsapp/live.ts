// Live WhatsApp in Admin → WhatsApp (15 nov 2026): de gekoppelde WhatsApp via de brug (deploy/whatsapp-brug). Puur,
// zodat het scherm en de server dezelfde regels gebruiken.

export interface LiveGesprekKort {
  jid: string;
  naam: string | null;
  groep: boolean;
  ongelezen: number;
  bijgewerkt: number;
  laatste: { tekst: string; tijd: number; vanMij: boolean } | null;
}

export interface LiveBericht {
  id: string;
  vanMij: boolean;
  tekst: string;
  tijd: number;
}

export interface LiveGesprek {
  jid: string;
  naam: string | null;
  groep: boolean;
  berichten: LiveBericht[];
}

export interface LiveStand {
  ingericht: boolean;
  verbonden: boolean;
  wachtOpQr: boolean;
  /** de koppelcode als SVG (alleen zolang er niet gekoppeld is) */
  qrSvg: string | null;
  gesprekken: number;
}

/** Een gewoon gesprek of een groep (zelfde regel als de brug); geen status, kanalen of verzendlijsten. */
export function geldigeJid(jid: unknown): jid is string {
  return typeof jid === "string" && /^[\d-]{5,40}@(s\.whatsapp\.net|g\.us|lid)$/.test(jid);
}

/** Wat het scherm toont als er geen naam is: het nummer als +31 6 …, of "Groep". */
export function toonNaam(g: { jid: string; naam: string | null; groep?: boolean }): string {
  if (g.naam?.trim()) return g.naam.trim();
  if (g.groep || g.jid.endsWith("@g.us")) return "Groep";
  const cijfers = g.jid.split("@")[0] ?? "";
  if (g.jid.endsWith("@lid")) return "WhatsApp-contact";
  return cijfers.startsWith("31") && cijfers.length === 11 ? `+31 ${cijfers.slice(2, 3)} ${cijfers.slice(3, 7)} ${cijfers.slice(7)}` : `+${cijfers}`;
}
