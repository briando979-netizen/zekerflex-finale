// De negen afdelingen van het hoofdkantoor, gedeeld door de 3D-scène en het
// zijpaneel. Geen three.js hier: dit bestand laadt mee met de pagina zelf.

export const ROOMS = [
  { id: "hq", name: "Hoofdkantoor · Jarvis", cx: 0, cy: 0, floor: 0xdfe6fb, accent: 0x4f6bed, staff: 2 },
  { id: "sales", name: "Sales & werving", cx: 1, cy: 0, floor: 0xebe4fb, accent: 0x8b5cf6, staff: 2 },
  { id: "operations", name: "Planning & uren", cx: 2, cy: 0, floor: 0xdcf5e4, accent: 0x16a34a, staff: 2 },
  { id: "finance", name: "Facturatie", cx: 0, cy: 1, floor: 0xd6f3e6, accent: 0x059669, staff: 2 },
  { id: "lobby", name: "Lobby & receptie", cx: 1, cy: 1, floor: 0xeef1f5, accent: 0x64748b, staff: 1 },
  { id: "bank", name: "ZekerFlex Bank", cx: 2, cy: 1, floor: 0xd3f2ee, accent: 0x0d9488, staff: 2 },
  { id: "shop", name: "Webshop & magazijn", cx: 0, cy: 2, floor: 0xf8eccd, accent: 0xd97706, staff: 2 },
  { id: "support", name: "Klantenservice & mail", cx: 1, cy: 2, floor: 0xdcedf8, accent: 0x0284c7, staff: 2 },
  { id: "legal", name: "Juridisch & compliance", cx: 2, cy: 2, floor: 0xf8e1ec, accent: 0xdb2777, staff: 2 },
] as const;

export type Room = (typeof ROOMS)[number];
export type RoomId = Room["id"];

/** Gebeurtenissen van de AI-orkestratie horen bij het hoofdkantoor (Jarvis). */
export const roomOf = (id: string): Room => ROOMS.find((r) => r.id === (id === "ai" ? "hq" : id)) ?? ROOMS[0];

export interface CityEvent {
  id: string;
  room: string;
  action: string;
  summary: string;
  severity: string;
  by: string;
  tenantId?: string | null;
  at: string;
}
