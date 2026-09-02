import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Open job applications ("Werken bij ons"). Filesystem-only, isolated from the
// Prisma Upload table:
//   storage/jobs/<ts>-<id>/application.json
//   storage/jobs/<ts>-<id>/<safe-filename>       (motivatiebrief, cv)
// No database, no Redis.
// ---------------------------------------------------------------------------

function root(): string {
  return join(process.cwd(), "storage", "jobs");
}

export interface JobApplication {
  id: string;
  at: string;
  name: string;
  email: string;
  phone?: string;
  skills: string[];
  motivationText?: string;
  files: { kind: "motivatiebrief" | "cv"; filename: string }[];
}

export interface StoredFile {
  kind: "motivatiebrief" | "cv";
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

function safeName(name: string): string {
  return (
    name
      .replace(/[^\w.\- ]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 120) || "bestand"
  );
}

export async function saveApplication(
  input: Omit<JobApplication, "id" | "at" | "files">,
  files: StoredFile[],
): Promise<JobApplication> {
  const id = randomUUID().slice(0, 12);
  const at = new Date().toISOString();
  const dir = join(root(), `${at.replace(/[:.]/g, "-")}-${id}`);
  await mkdir(dir, { recursive: true });

  const written: JobApplication["files"] = [];
  for (const f of files) {
    const filename = `${f.kind}-${safeName(f.filename)}`;
    await writeFile(join(dir, filename), f.bytes, { flag: "wx" });
    written.push({ kind: f.kind, filename });
  }

  const rec: JobApplication = { id, at, ...input, files: written };
  await writeFile(join(dir, "application.json"), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function listApplications(limit = 200): Promise<JobApplication[]> {
  if (!existsSync(root())) return [];
  const dirs = (await readdir(root(), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse()
    .slice(0, limit);
  const out: JobApplication[] = [];
  for (const d of dirs) {
    try {
      out.push(JSON.parse(await readFile(join(root(), d, "application.json"), "utf8")) as JobApplication);
    } catch {
      /* skip */
    }
  }
  return out;
}
