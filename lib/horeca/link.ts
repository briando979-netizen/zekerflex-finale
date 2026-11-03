import { createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Ondertekende links voor gasten (bijvoorbeeld "reservering annuleren"): wie
// de link heeft, mag precies dat ene doen met precies die ene reservering.
// De sleutel is afgeleid van het servergeheim en per doel anders, zodat een
// link nooit voor iets anders bruikbaar is. De kern is puur (sleutel als
// argument) en los te testen.
// ---------------------------------------------------------------------------

export type LinkDoel = "annuleer";

const sleutelVoor = (geheim: string, doel: LinkDoel) => createHmac("sha256", geheim).update(`horeca-link:${doel}`).digest();

export function tekenMet(geheim: string, doel: LinkDoel, id: string): string {
  const data = Buffer.from(id).toString("base64url");
  return `${data}.${createHmac("sha256", sleutelVoor(geheim, doel)).update(data).digest("base64url")}`;
}

/** Het id achter een geldige link, of null (vervalst, ander doel, kapot). */
export function leesMet(geheim: string, doel: LinkDoel, token: string | undefined): string | null {
  if (!token || token.length > 200) return null;
  const [data, handtekening] = token.split(".");
  if (!data || !handtekening) return null;
  const verwacht = createHmac("sha256", sleutelVoor(geheim, doel)).update(data).digest();
  const gekregen = Buffer.from(handtekening, "base64url");
  if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) return null;
  const id = Buffer.from(data, "base64url").toString();
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null;
}
