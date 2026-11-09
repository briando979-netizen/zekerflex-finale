// Puur (ook voor de browser): een naam voor een passkey die de gebruiker
// herkent. De browser stelt er een voor uit de user-agent; de gebruiker kan
// hem aanpassen en de server maakt hem netjes. Merknamen zijn in elke taal gelijk.

export const NAAM_MAX = 60;

export function raadToestelNaam(userAgent: string): string {
  const ua = userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Passkey";
}

/** Geen stuurtekens, geen dubbele spaties, hooguit 60 tekens; leeg wordt "Passkey". */
export function netteNaam(ruw: unknown): string {
  const s = typeof ruw === "string" ? ruw : "";
  // eslint-disable-next-line no-control-regex
  const schoon = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(schoon).slice(0, NAAM_MAX).join("").trim() || "Passkey";
}
