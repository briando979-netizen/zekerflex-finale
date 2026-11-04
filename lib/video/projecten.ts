import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { projectDuur, schoonProject, type BeeldClip, type Project } from "@/lib/video/model";

// ---------------------------------------------------------------------------
// Opgeslagen videoprojecten (Admin → Video-editor). Eén KV-sleutel per project;
// gedeeld door het hele beheerteam, dus niet per gebruiker (geen AVG-voorvoegsel).
// ---------------------------------------------------------------------------

const PREFIX = "video:project:";
const MAX_BYTES = 900_000;

export interface ProjectKort {
  id: string;
  naam: string;
  formaat: Project["formaat"];
  duur: number;
  clips: number;
  bijgewerkt: string;
  /** Eerste foto of video (voor een voorbeeldplaatje). */
  voorbeeld: string | null;
}

const isProjectId = (id: string) => /^p[\w]{4,40}$/.test(id);

export async function projectLijst(): Promise<ProjectKort[]> {
  const alle = await kvListValues<Project>(PREFIX, 300).catch(() => [] as Project[]);
  return alle
    .filter((p) => p && Array.isArray(p.clips))
    .map((p) => ({
      id: p.id,
      naam: p.naam,
      formaat: p.formaat,
      duur: projectDuur(p),
      clips: p.clips.length,
      bijgewerkt: p.bijgewerkt,
      voorbeeld: p.clips.find((c): c is BeeldClip => c.soort === "foto")?.bron ?? null,
    }))
    .sort((a, b) => b.bijgewerkt.localeCompare(a.bijgewerkt));
}

export async function leesProject(id: string): Promise<Project | null> {
  if (!isProjectId(id)) return null;
  return kvGet<Project>(PREFIX + id);
}

/** Bewaar een project (eerst schoongemaakt). Geeft de opgeslagen stand terug. */
export async function bewaarProject(ruw: unknown): Promise<Project> {
  let p: Project;
  try {
    p = schoonProject(ruw);
  } catch {
    throw AppError.validation("Dit is geen geldig videoproject.");
  }
  if (JSON.stringify(p).length > MAX_BYTES) throw AppError.validation("Dit project is te groot om op te slaan. Haal wat clips weg.");
  await kvSet(PREFIX + p.id, p);
  return p;
}

export async function verwijderProject(id: string): Promise<void> {
  if (!isProjectId(id)) return;
  await kvDelete(PREFIX + id);
}
