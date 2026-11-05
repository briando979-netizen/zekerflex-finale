// Kleine fetch-hulpjes voor de video-editor (client). Geen server-imports.

import type { Project } from "@/lib/video/model";

export interface VideoBestand {
  id: string;
  soort: "foto" | "video" | "audio";
  naam: string;
  mime: string;
  ext: string;
  bytes: number;
  duur: number | null;
  breedte: number | null;
  hoogte: number | null;
  herkomst: "upload" | "ai-foto" | "ai-stem" | "ai-clip" | "export" | "opname" | "muziek";
  op: string;
}

export interface AiStatus {
  beeld: "a1111" | "openai" | "comfyui" | "gemini" | "cloudflare" | null;
  gemini: boolean;
  beeldMelding: string | null;
  videoMelding: string | null;
}

export interface ProjectKort {
  id: string;
  naam: string;
  formaat: Project["formaat"];
  duur: number;
  clips: number;
  bijgewerkt: string;
  voorbeeld: string | null;
}

export const bestandAdres = (id: string) => `/api/admin/video/bestand/${id}`;

async function lees<T>(res: Response, standaard: string): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* geen JSON */
  }
  if (!res.ok) {
    const melding = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(melding || standaard);
  }
  return data as T;
}

export async function haalBestanden(): Promise<{ bestanden: VideoBestand[]; ai: AiStatus }> {
  return lees(await fetch("/api/admin/video/bestanden", { cache: "no-store" }), "De bestanden konden niet geladen worden.");
}

export async function uploadBestand(data: Blob, naam: string, herkomst: VideoBestand["herkomst"] = "upload", duur?: number): Promise<VideoBestand> {
  const q = new URLSearchParams({ naam, herkomst, ...(duur ? { duur: String(duur) } : {}) });
  const res = await fetch(`/api/admin/video/bestanden?${q}`, {
    method: "POST",
    headers: { "Content-Type": data.type || "application/octet-stream" },
    body: data,
  });
  return (await lees<{ item: VideoBestand }>(res, "Uploaden mislukt.")).item;
}

export async function zetBestandInfo(id: string, info: { naam?: string; duur?: number; breedte?: number; hoogte?: number }): Promise<VideoBestand> {
  const res = await fetch("/api/admin/video/bestanden", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...info }) });
  return (await lees<{ item: VideoBestand }>(res, "Bijwerken mislukt.")).item;
}

export async function verwijderBestand(id: string): Promise<void> {
  await lees(await fetch(`/api/admin/video/bestanden?id=${encodeURIComponent(id)}`, { method: "DELETE" }), "Verwijderen mislukt.");
}

export async function haalProjecten(): Promise<ProjectKort[]> {
  return (await lees<{ projecten: ProjectKort[] }>(await fetch("/api/admin/video/projecten", { cache: "no-store" }), "De projecten konden niet geladen worden.")).projecten;
}

export async function haalProject(id: string): Promise<Project> {
  return (await lees<{ project: Project }>(await fetch(`/api/admin/video/projecten/${encodeURIComponent(id)}`, { cache: "no-store" }), "Dit project kon niet geladen worden.")).project;
}

export async function bewaarProject(p: Project): Promise<Project> {
  const res = await fetch("/api/admin/video/projecten", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
  return (await lees<{ project: Project }>(res, "Opslaan mislukt.")).project;
}

export async function verwijderProject(id: string): Promise<void> {
  await lees(await fetch(`/api/admin/video/projecten/${encodeURIComponent(id)}`, { method: "DELETE" }), "Verwijderen mislukt.");
}

export async function postJson<T>(pad: string, body: unknown, standaard: string): Promise<T> {
  const res = await fetch(pad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return lees<T>(res, standaard);
}

export async function getJson<T>(pad: string, standaard: string): Promise<T> {
  return lees<T>(await fetch(pad, { cache: "no-store" }), standaard);
}

export function tijdTekst(s: number, frames = false): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const basis = `${m}:${String(sec).padStart(2, "0")}`;
  if (!frames) return basis;
  return `${basis}.${String(Math.floor((s % 1) * 10))}`;
}

export interface GratisTaak {
  id: string;
  status: "bezig" | "klaar" | "fout";
  omschrijving: string;
  op: string;
  item?: VideoBestand;
  fout?: string;
}

export interface GratisClipVraag {
  omschrijving: string;
  duur: number;
  formaat: Project["formaat"];
  kwaliteit: "snel" | "scherp";
  fotoBron?: string;
}

/** Start een gratis AI-clip (LTX-2.3) en wacht tot hij klaar is (1 tot 3 minuten). */
export async function maakGratisClip(vraag: GratisClipVraag, onStand?: (seconden: number) => void): Promise<VideoBestand> {
  const { taak } = await postJson<{ taak: GratisTaak }>("/api/admin/video/gratis", vraag, "De gratis clip kon niet gestart worden.");
  const begin = Date.now();
  while (Date.now() - begin < 9 * 60_000) {
    await new Promise((r) => setTimeout(r, 5000));
    onStand?.(Math.round((Date.now() - begin) / 1000));
    const { taak: nu } = await getJson<{ taak: GratisTaak }>(`/api/admin/video/gratis?taak=${encodeURIComponent(taak.id)}`, "De stand van de clip kon niet opgehaald worden.");
    if (nu.status === "klaar" && nu.item) return nu.item;
    if (nu.status === "fout") throw new Error(nu.fout ?? "De gratis clip lukte niet.");
  }
  throw new Error("De clip duurt erg lang. Kijk zo bij Media; hij komt er vaak alsnog bij.");
}

export interface WachtTaak {
  id: string;
  soort: "clip" | "foto" | "video";
  omschrijving: string;
  formaat: Project["formaat"];
  duur: number;
  status: "wacht" | "bezig" | "klaar" | "fout" | "tegoed";
  op: string;
  bijgewerkt: string;
  volgendePoging?: string;
  resultaat?: { soort: "bestand" | "project"; id: string; naam: string };
  melding?: string;
}

export async function haalWachtrij(): Promise<WachtTaak[]> {
  return (await getJson<{ taken: WachtTaak[] }>("/api/admin/video/wachtrij", "De wachtrij kon niet geladen worden.")).taken;
}

export async function zetInWachtrij(taken: { soort: WachtTaak["soort"]; omschrijving: string; formaat: Project["formaat"]; duur: number; fotoBron?: string }[]): Promise<WachtTaak[]> {
  return (await postJson<{ taken: WachtTaak[] }>("/api/admin/video/wachtrij", { taken }, "Klaarzetten lukte niet.")).taken;
}

export async function haalUitWachtrij(id: string): Promise<void> {
  const res = await fetch(`/api/admin/video/wachtrij?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Weghalen lukte niet.");
}
