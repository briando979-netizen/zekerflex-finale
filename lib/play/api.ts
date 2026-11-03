import { toegangstoken } from "@/lib/play/account";

// ---------------------------------------------------------------------------
// Een dunne laag over de Google Play Android Developer API (v3). Alles gaat via
// een "edit": openen, wijzigen, bevestigen (commit). Een app moet al bestaan in
// Google Play (de eerste versie uploadt de eigenaar zelf in Play Console); daarna
// kan alles hier: versies uploaden, sporen (interne/gesloten test, productie),
// testers, winkelpagina en afbeeldingen. Fouten van Google worden PlayFout;
// lib/play/uitleg.ts vertaalt ze naar gewoon Nederlands.
// ---------------------------------------------------------------------------

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";

export type Spoor = "internal" | "alpha" | "beta" | "production";
export const SPOREN: Spoor[] = ["internal", "alpha", "production"];

export interface Release {
  name?: string;
  versionCodes?: string[];
  status: "draft" | "inProgress" | "halted" | "completed";
  userFraction?: number;
  releaseNotes?: { language: string; text: string }[];
}

export interface Track {
  track: string;
  releases?: Release[];
}

export interface Edit {
  pakket: string;
  id: string;
}

export type AfbeeldingSoort = "icon" | "featureGraphic" | "phoneScreenshots";

export class PlayFout extends Error {
  constructor(
    readonly status: number,
    readonly reden: string,
    message: string,
  ) {
    super(message);
    this.name = "PlayFout";
  }
}

type Lichaam = { json: unknown } | { bytes: Uint8Array; type: string } | undefined;

async function vraag<T>(methode: string, url: string, lichaam?: Lichaam): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${await toegangstoken()}` };
  let body: BodyInit | undefined;
  if (lichaam && "json" in lichaam) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(lichaam.json);
  } else if (lichaam) {
    headers["content-type"] = lichaam.type;
    body = new Blob([lichaam.bytes as Uint8Array<ArrayBuffer>]);
  }
  const res = await fetch(url, { method: methode, headers, ...(body !== undefined ? { body } : {}), signal: AbortSignal.timeout(lichaam && !("json" in lichaam) ? 300_000 : 60_000) });
  const tekst = await res.text();
  const data = tekst ? (JSON.parse(tekst) as unknown) : {};
  if (!res.ok) {
    const e = (data as { error?: { message?: string; status?: string; errors?: { reason?: string }[] } }).error;
    throw new PlayFout(res.status, e?.errors?.[0]?.reason ?? e?.status ?? "", e?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

const app = (pakket: string) => `${API}/${encodeURIComponent(pakket)}`;
const editUrl = (e: Edit) => `${app(e.pakket)}/edits/${encodeURIComponent(e.id)}`;

export async function nieuweEdit(pakket: string): Promise<Edit> {
  const r = await vraag<{ id: string }>("POST", `${app(pakket)}/edits`, { json: {} });
  return { pakket, id: r.id };
}

export async function gooiEditWeg(e: Edit): Promise<void> {
  await vraag("DELETE", editUrl(e)).catch(() => undefined);
}

/** Bevestigt de edit. Mag Google de wijziging niet zelf ter beoordeling sturen, dan doet de eigenaar dat in Play Console. */
export async function bevestig(e: Edit): Promise<{ handmatigVersturen: boolean }> {
  try {
    await vraag("POST", `${editUrl(e)}:commit`);
    return { handmatigVersturen: false };
  } catch (err) {
    if (err instanceof PlayFout && /changesNotSentForReview/i.test(err.message)) {
      await vraag("POST", `${editUrl(e)}:commit?changesNotSentForReview=true`);
      return { handmatigVersturen: true };
    }
    throw err;
  }
}

/** Opent een edit, voert het werk uit en bevestigt (of gooit hem weg bij alleen lezen of een fout). */
export async function metEdit<T>(pakket: string, werk: (e: Edit) => Promise<T>, opslaan = true): Promise<T & { handmatigVersturen: boolean }> {
  const e = await nieuweEdit(pakket);
  try {
    const r = await werk(e);
    const b = opslaan ? await bevestig(e) : (await gooiEditWeg(e), { handmatigVersturen: false });
    return { ...r, ...b };
  } catch (err) {
    await gooiEditWeg(e);
    throw err;
  }
}

export async function sporen(e: Edit): Promise<Track[]> {
  return (await vraag<{ tracks?: Track[] }>("GET", `${editUrl(e)}/tracks`)).tracks ?? [];
}

export async function zetSpoor(e: Edit, spoor: Spoor, releases: Release[]): Promise<void> {
  await vraag("PUT", `${editUrl(e)}/tracks/${spoor}`, { json: { track: spoor, releases } });
}

export async function uploadBundel(e: Edit, aab: Uint8Array): Promise<{ versionCode: number }> {
  return vraag<{ versionCode: number }>("POST", `${UPLOAD}/${encodeURIComponent(e.pakket)}/edits/${encodeURIComponent(e.id)}/bundles?uploadType=media`, {
    bytes: aab,
    type: "application/octet-stream",
  });
}

/** Contactgegevens op de winkelpagina; PATCH, zodat de standaardtaal blijft zoals de eigenaar hem koos. */
export async function zetDetails(e: Edit, d: { contactEmail?: string; contactWebsite?: string }): Promise<void> {
  await vraag("PATCH", `${editUrl(e)}/details`, { json: d });
}

export async function zetVermelding(e: Edit, taal: string, v: { title: string; shortDescription: string; fullDescription: string }): Promise<void> {
  await vraag("PUT", `${editUrl(e)}/listings/${taal}`, { json: { language: taal, ...v } });
}

/** Vervangt alle afbeeldingen van één soort (icoon, functieafbeelding, schermafbeeldingen). */
export async function vervangAfbeeldingen(e: Edit, taal: string, soort: AfbeeldingSoort, afbeeldingen: Uint8Array[]): Promise<void> {
  await vraag("DELETE", `${editUrl(e)}/listings/${taal}/${soort}`);
  for (const png of afbeeldingen) {
    await vraag("POST", `${UPLOAD}/${encodeURIComponent(e.pakket)}/edits/${encodeURIComponent(e.id)}/listings/${taal}/${soort}?uploadType=media`, {
      bytes: png,
      type: "image/png",
    });
  }
}

export async function zetTesters(e: Edit, spoor: Spoor, googleGroups: string[]): Promise<void> {
  await vraag("PUT", `${editUrl(e)}/testers/${spoor}`, { json: { googleGroups } });
}

/** De SHA-256 van de ondertekensleutel van Google (Play App Signing), voor Digital Asset Links. */
export async function ondertekenVingerafdruk(pakket: string, versionCode: number): Promise<string | null> {
  const r = await vraag<{ generatedApks?: { certificateSha256Hash?: string }[] }>("GET", `${app(pakket)}/generatedApks/${versionCode}`);
  const hash = r.generatedApks?.find((g) => g.certificateSha256Hash)?.certificateSha256Hash;
  return hash ? alsVingerafdruk(hash) : null;
}

/** "ab12…" (hex) of base64 → "AB:12:…", zoals assetlinks.json het wil. */
export function alsVingerafdruk(hash: string): string | null {
  const s = hash.trim();
  let hex = "";
  if (/^[0-9a-fA-F:]{64,95}$/.test(s)) hex = s.replace(/:/g, "");
  else {
    try {
      hex = Buffer.from(s, /[-_]/.test(s) ? "base64url" : "base64").toString("hex");
    } catch {
      return null;
    }
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex.toUpperCase().match(/../g)!.join(":");
}

/** Staat de app openbaar in de Play Store? null = niet vast te stellen (Google even onbereikbaar). */
export async function inWinkel(pakket: string): Promise<boolean | null> {
  try {
    const res = await fetch(winkelLink(pakket), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

export const winkelLink = (pakket: string) => `https://play.google.com/store/apps/details?id=${encodeURIComponent(pakket)}`;
export const testLink = (pakket: string) => `https://play.google.com/apps/testing/${encodeURIComponent(pakket)}`;

/** De hoogste versie in een spoor (of in alle sporen). */
export function hoogsteVersie(tracks: Track[], spoor?: string): number {
  let max = 0;
  for (const t of tracks) {
    if (spoor && t.track !== spoor) continue;
    for (const r of t.releases ?? []) for (const v of r.versionCodes ?? []) max = Math.max(max, Number(v) || 0);
  }
  return max;
}
