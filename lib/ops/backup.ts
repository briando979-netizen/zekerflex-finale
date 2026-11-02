import { readFile, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { alertOwner } from "@/lib/ops/alert";
import { recordCronRun } from "@/lib/metrics";

// ---------------------------------------------------------------------------
// Nachtelijke back-up (self-host). De backup-dienst in docker-compose.vps.yml
// (deploy/backup/entrypoint.sh) maakt elke nacht een pg_dump + uploads-tar, zet
// de dump proef-terug in een wegwerp-database en schrijft de uitkomst naar
// status.json. De app ziet die map alleen-lezen en beoordeelt hier of de laatste
// back-up vers, compleet en terug te zetten is. De map staat op de schijf van de
// server, dus hier lezen we ook af hoe vol die schijf is.
// ---------------------------------------------------------------------------

export const BACKUP_DIR = process.env.BACKUP_DIR || "/backups";
/** één nacht mag uitlopen, een gemiste nacht niet */
export const BACKUP_MAX_AGE_HOURS = 26;
/** vanaf dit percentage waarschuwen we; vanaf DISK_CRIT_PERCENT is het kritiek */
export const DISK_WARN_PERCENT = 85;
export const DISK_CRIT_PERCENT = 95;

export interface BackupStatus {
  at: string;
  ok: boolean;
  file: string;
  bytes: number;
  storageFile: string;
  storageBytes: number;
  seconds: number;
  restore: { ok: boolean; tables: number; users: number; liveUsers: number };
  kept: number;
  error: string;
}

export interface BackupFile {
  name: string;
  bytes: number;
  at: string;
}

export interface DiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export type BackupState = "ok" | "failed" | "stale" | "missing";

export interface BackupReport {
  /** false = deze omgeving heeft geen back-upmap (lokaal, of de dienst draait niet) */
  available: boolean;
  state: BackupState;
  reasons: string[];
  status: BackupStatus | null;
  files: BackupFile[];
  disk: DiskUsage | null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseBackupStatus(raw: unknown): BackupStatus | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return null;
  const r = (o.restore ?? {}) as Record<string, unknown>;
  return {
    at: o.at,
    ok: o.ok === true,
    file: str(o.file),
    bytes: num(o.bytes),
    storageFile: str(o.storageFile),
    storageBytes: num(o.storageBytes),
    seconds: num(o.seconds),
    restore: { ok: r.ok === true, tables: num(r.tables), users: num(r.users), liveUsers: num(r.liveUsers) },
    kept: num(o.kept),
    error: str(o.error),
  };
}

/** Beoordeelt de laatste back-up. `fileFound` = het genoemde dumpbestand staat echt op schijf. */
export function evaluateBackup(status: BackupStatus | null, fileFound: boolean, now = Date.now()): { state: BackupState; reasons: string[] } {
  if (!status) return { state: "missing", reasons: ["Er is nog geen back-up gemaakt."] };
  const reasons: string[] = [];
  if (!status.ok) reasons.push(status.error ? `De laatste back-up is mislukt: ${status.error}` : "De laatste back-up is mislukt.");
  if (!status.file || status.bytes < 1024) reasons.push("Het databasebestand ontbreekt of is leeg.");
  else if (!fileFound) reasons.push(`Het bestand ${status.file} staat niet meer op de server.`);
  if (status.file && !status.restore.ok) reasons.push("De proef-terugzetting is niet gelukt.");
  if (reasons.length > 0) return { state: "failed", reasons };
  const ageHours = (now - Date.parse(status.at)) / 3_600_000;
  if (ageHours > BACKUP_MAX_AGE_HOURS) {
    return { state: "stale", reasons: [`Er is al ${Math.floor(ageHours)} uur geen nieuwe back-up gemaakt.`] };
  }
  return { state: "ok", reasons: [] };
}

/** Zelfde getal als `df`: gebruikt / (gebruikt + beschikbaar). */
export function diskUsage(blocks: number, bfree: number, bavail: number, bsize: number): DiskUsage {
  const used = Math.max(0, blocks - bfree);
  const usable = used + bavail;
  return {
    totalBytes: blocks * bsize,
    freeBytes: bavail * bsize,
    usedPercent: usable > 0 ? Math.round((used / usable) * 100) : 0,
  };
}

export async function readBackupReport(dir = BACKUP_DIR, now = Date.now()): Promise<BackupReport> {
  const empty: BackupReport = { available: false, state: "missing", reasons: [], status: null, files: [], disk: null };
  try {
    if (!(await stat(dir)).isDirectory()) return empty;
  } catch {
    return empty;
  }

  let disk: DiskUsage | null = null;
  try {
    const s = await statfs(dir);
    disk = diskUsage(s.blocks, s.bfree, s.bavail, s.bsize);
  } catch {
    /* geen schijfinfo: de rest werkt nog */
  }

  let status: BackupStatus | null = null;
  try {
    status = parseBackupStatus(JSON.parse(await readFile(path.join(dir, "status.json"), "utf8")));
  } catch {
    /* nog geen status: missing */
  }

  const files: BackupFile[] = [];
  try {
    for (const name of await readdir(path.join(dir, "db"))) {
      if (!name.endsWith(".dump")) continue;
      const s = await stat(path.join(dir, "db", name));
      files.push({ name, bytes: s.size, at: s.mtime.toISOString() });
    }
  } catch {
    /* map ontbreekt nog */
  }
  files.sort((a, b) => b.at.localeCompare(a.at));

  const fileFound = Boolean(status?.file && files.some((f) => f.name === status?.file));
  const { state, reasons } = evaluateBackup(status, fileFound, now);
  return { available: true, state, reasons, status, files, disk };
}

/** Dagelijks na de back-up (cron): hartslag bij succes, anders de eigenaar waarschuwen. */
export async function checkBackup(now = Date.now(), dir = BACKUP_DIR): Promise<BackupReport> {
  const report = await readBackupReport(dir, now);
  if (!report.available) return report;

  if (report.state === "ok") {
    recordCronRun("db-backup", true);
  } else {
    await alertOwner({
      key: "backup:db",
      title: "Database-back-up niet in orde",
      detail: report.reasons.join(" "),
      severity: "critical",
      url: "/admin/systeem#backups",
    });
  }

  const disk = report.disk;
  if (disk && disk.usedPercent >= DISK_WARN_PERCENT) {
    await alertOwner({
      key: "disk:server",
      title: `Serverschijf ${disk.usedPercent}% vol`,
      detail: `Er is nog ${Math.round(disk.freeBytes / 1024 ** 3)} GB vrij. Bij een volle schijf kan de database niets meer opslaan. Ruim oude images op: docker image prune -f && docker builder prune -f --filter until=72h.`,
      severity: disk.usedPercent >= DISK_CRIT_PERCENT ? "critical" : "warning",
      url: "/admin/systeem#backups",
    });
  }

  logger.info("backup check", { state: report.state, diskUsed: disk?.usedPercent ?? null });
  return report;
}
