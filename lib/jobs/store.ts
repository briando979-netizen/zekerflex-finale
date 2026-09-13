import { randomUUID } from "node:crypto";
import { storeUpload } from "@/lib/storage/local";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Open job applications ("Werken bij ons"). Postgres-backed (KeyValueStore,
// key "job-application:<id>") for the metadata; attached files (motivatiebrief,
// cv) go through the shared Upload store. Was local disk, unreliable on
// Vercel's serverless functions.
// ---------------------------------------------------------------------------

export interface JobApplication {
  id: string;
  at: string;
  name: string;
  email: string;
  phone?: string;
  skills: string[];
  motivationText?: string;
  files: { kind: "motivatiebrief" | "cv"; filename: string; uploadId?: string }[];
}

export interface StoredFile {
  kind: "motivatiebrief" | "cv";
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

const key = (id: string) => `job-application:${id}`;

export async function saveApplication(
  input: Omit<JobApplication, "id" | "at" | "files">,
  files: StoredFile[],
): Promise<JobApplication> {
  const id = randomUUID().slice(0, 12);
  const at = new Date().toISOString();

  const written: JobApplication["files"] = [];
  for (const f of files) {
    const stored = await storeUpload({ filename: f.filename, mimeType: f.mimeType, bytes: f.bytes });
    written.push({ kind: f.kind, filename: stored.filename, uploadId: stored.id });
  }

  const rec: JobApplication = { id, at, ...input, files: written };
  await kvSet(key(id), rec);
  return rec;
}

export async function listApplications(limit = 200): Promise<JobApplication[]> {
  const rows = await kvListValues<JobApplication>("job-application:", 2000);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

export async function getApplication(id: string): Promise<JobApplication | null> {
  if (!/^[a-f0-9-]{6,20}$/.test(id)) return null;
  return kvGet<JobApplication>(key(id));
}
