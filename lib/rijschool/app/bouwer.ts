import { AppError } from "@/lib/errors";
import type { BouwManifest } from "@/lib/rijschool/app/twa";

// ---------------------------------------------------------------------------
// De Android-bouwer (deploy/android-bouwer): een eigen container op het interne
// netwerk die de .aab bouwt. Hier alleen de HTTP-aanroepen; de volgorde (bouw
// starten, volgen, resultaat verwerken) staat in lib/rijschool/app/store.ts.
// ---------------------------------------------------------------------------

const URL_BOUWER = process.env.ANDROID_BOUWER_URL || "http://android-bouwer:4300";
const TOKEN = process.env.ANDROID_BOUWER_TOKEN || "";

export const bouwerIngesteld = () => TOKEN.length >= 24;

export interface BouwStand {
  id: string;
  staat: "wacht" | "bezig" | "klaar" | "mislukt";
  log: string[];
  fout?: string;
  plaatsInRij?: number;
  resultaat?: { vingerafdruk: string; grootte: number; nieuweSleutel?: string };
}

async function vraag(pad: string, init: RequestInit = {}, timeout = 30_000): Promise<Response> {
  if (!bouwerIngesteld()) throw AppError.precondition("Het bouwen van apps staat nog niet aan op de server. De beheerder van ZekerFlex zet het aan (deploy/android-bouwer/installeer.sh).");
  try {
    return await fetch(`${URL_BOUWER}${pad}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw AppError.upstream("De Android-bouwer is even niet bereikbaar. Probeer het zo opnieuw.");
  }
}

export async function startBouw(opdracht: { manifest: BouwManifest; icoon: string; maskeerbaar: string; sleutel: { wachtwoord: string; keystore?: string } }): Promise<string> {
  const res = await vraag("/bouw", { method: "POST", body: JSON.stringify(opdracht) });
  const data = (await res.json().catch(() => ({}))) as { id?: string; fout?: string };
  if (!res.ok || !data.id) throw AppError.upstream(data.fout ?? "De Android-bouwer nam de opdracht niet aan.");
  return data.id;
}

export async function bouwStand(id: string): Promise<BouwStand | null> {
  const res = await vraag(`/bouw/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw AppError.upstream("De Android-bouwer gaf geen stand.");
  return (await res.json()) as BouwStand;
}

export async function haalAab(id: string): Promise<Buffer> {
  const res = await vraag(`/bouw/${encodeURIComponent(id)}/aab`, {}, 120_000);
  if (!res.ok) throw AppError.upstream("Het app-bestand kon niet worden opgehaald.");
  return Buffer.from(await res.arrayBuffer());
}
