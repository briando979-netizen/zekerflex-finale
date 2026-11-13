import { readFile, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";
import { alertOwner, type OpsAlert } from "@/lib/ops/alert";
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
/**
 * De proef-terugzetting telde tot 13 nov alleen of er tabellen waren: een dump met een lege "User"-tabel heette ook in orde.
 * Nu moet hij bijna alle gebruikers van de database bevatten (een paar aanmeldingen tussen dump en telling mogen).
 */
export const GEBRUIKERS_MARGE = 0.9;
/** Een databasebestand dat minder dan de helft is van dat van de vorige nacht valt op (lege tabel, verkeerde database). */
export const KRIMP_FACTOR = 0.5;

export interface BackupStatus {
  at: string;
  ok: boolean;
  file: string;
  bytes: number;
  storageFile: string;
  storageBytes: number;
  /** de eigen Git-server (Forgejo); ontbreekt bij een status van vóór Forgejo */
  forgejoFile?: string;
  forgejoBytes?: number;
  seconds: number;
  restore: { ok: boolean; tables: number; users: number; liveUsers: number };
  kept: number;
  error: string;
  /** er staat een versleutelde kopie (.enc) naast de dump (BACKUP_PASSPHRASE gezet) */
  encrypted: boolean;
  /** de kopie buiten de server (BACKUP_OFFSITE): ingesteld, doel en of hij deze nacht gelukt is */
  offsite: { configured: boolean; target: string; ok: boolean; error: string };
}

/** Eén diepgaande hersteltest (deploy/backup/entrypoint.sh, run_verify → verify.json). */
export interface VerifyStatus {
  at: string;
  ok: boolean;
  file: string;
  seconds: number;
  shaOk: boolean;
  listOk: boolean;
  restoreOk: boolean;
  tables: number;
  /** zoveel tabellen zijn vergeleken met het moment van de back-up */
  compared: number;
  missing: number;
  mismatched: number;
  mismatches: { table: string; expected: number; got: number | null }[];
  storage: { ok: boolean; file: string; files: number };
  /** de eigen Git-server (Forgejo): archief leesbaar, database heel, repositories; ontbreekt bij een test van vóór Forgejo */
  forgejo?: { ok: boolean; file: string; repos: number };
  /** none = geen versleutelde kopie; no-passphrase = kopie er wel, sleutel niet bekend */
  encrypted: "none" | "ok" | "failed" | "no-passphrase";
  /** none = niet ingesteld */
  offsite: "none" | "ok" | "missing" | "size-mismatch" | "no-encrypted-copy";
  error: string;
}

/** de hersteltest is wekelijks; een week overslaan mag niet ongemerkt */
export const VERIFY_MAX_AGE_HOURS = 24 * 8 + 2;

export type VerifyState = "ok" | "failed" | "stale" | "missing";

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
  /** iets opvallends dat de back-up niet onbruikbaar maakt (veel kleiner dan de vorige); null = niets */
  waarschuwing: string | null;
  /** de diepgaande hersteltest (wekelijks en op verzoek) met de geschiedenis, nieuwste eerst */
  verificatie: { state: VerifyState; reasons: string[]; status: VerifyStatus | null; history: VerifyStatus[] };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseBackupStatus(raw: unknown): BackupStatus | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return null;
  const r = (o.restore ?? {}) as Record<string, unknown>;
  const off = (o.offsite ?? {}) as Record<string, unknown>;
  return {
    at: o.at,
    ok: o.ok === true,
    file: str(o.file),
    bytes: num(o.bytes),
    storageFile: str(o.storageFile),
    storageBytes: num(o.storageBytes),
    ...(typeof o.forgejoFile === "string" ? { forgejoFile: o.forgejoFile, forgejoBytes: num(o.forgejoBytes) } : {}),
    seconds: num(o.seconds),
    restore: { ok: r.ok === true, tables: num(r.tables), users: num(r.users), liveUsers: num(r.liveUsers) },
    kept: num(o.kept),
    error: str(o.error),
    encrypted: o.encrypted === true,
    offsite: { configured: off.configured === true, target: str(off.target), ok: off.ok === true, error: str(off.error) },
  };
}

const ENC_STATES = new Set(["none", "ok", "failed", "no-passphrase"]);
const OFF_STATES = new Set(["none", "ok", "missing", "size-mismatch", "no-encrypted-copy"]);

export function parseVerifyStatus(raw: unknown): VerifyStatus | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return null;
  const st = (o.storage ?? {}) as Record<string, unknown>;
  const fj = o.forgejo && typeof o.forgejo === "object" ? (o.forgejo as Record<string, unknown>) : null;
  const mismatches = Array.isArray(o.mismatches)
    ? o.mismatches.flatMap((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return typeof x.table === "string" ? [{ table: x.table, expected: num(x.expected), got: typeof x.got === "number" ? x.got : null }] : [];
      })
    : [];
  return {
    at: o.at,
    ok: o.ok === true,
    file: str(o.file),
    seconds: num(o.seconds),
    shaOk: o.shaOk === true,
    listOk: o.listOk === true,
    restoreOk: o.restoreOk === true,
    tables: num(o.tables),
    compared: num(o.compared),
    missing: num(o.missing),
    mismatched: num(o.mismatched),
    mismatches: mismatches.slice(0, 50),
    storage: { ok: st.ok === true, file: str(st.file), files: num(st.files) },
    ...(fj ? { forgejo: { ok: fj.ok === true, file: str(fj.file), repos: num(fj.repos) } } : {}),
    encrypted: ENC_STATES.has(str(o.encrypted)) ? (str(o.encrypted) as VerifyStatus["encrypted"]) : "none",
    offsite: OFF_STATES.has(str(o.offsite)) ? (str(o.offsite) as VerifyStatus["offsite"]) : "none",
    error: str(o.error),
  };
}

/** Beoordeelt de laatste diepgaande hersteltest: geslaagd, mislukt (met waarom), te lang geleden of nog nooit gedaan. */
export function evaluateVerification(status: VerifyStatus | null, now = Date.now()): { state: VerifyState; reasons: string[] } {
  if (!status) return { state: "missing", reasons: ["Er is nog geen hersteltest gedaan."] };
  const reasons: string[] = [];
  if (!status.restoreOk) reasons.push(status.error ? `Terugzetten mislukte: ${status.error}` : "De back-up kon niet worden teruggezet.");
  else {
    if (!status.shaOk) reasons.push("De vingerafdruk van het back-upbestand klopt niet meer: het bestand is veranderd of beschadigd.");
    if (status.missing > 0) reasons.push(`${status.missing} ${status.missing === 1 ? "tabel ontbreekt" : "tabellen ontbreken"} na het terugzetten.`);
    if (status.mismatched - status.missing > 0) reasons.push(`${status.mismatched - status.missing} ${status.mismatched - status.missing === 1 ? "tabel heeft" : "tabellen hebben"} na het terugzetten een ander aantal rijen dan bij de back-up.`);
    if (!status.storage.ok) reasons.push("Het archief met uploads is niet compleet te lezen.");
    if (status.forgejo && !status.forgejo.ok) reasons.push("Het archief van de eigen Git-server (Forgejo) is niet in orde: de database of de repositories ontbreken of zijn beschadigd.");
    if (status.encrypted === "failed") reasons.push("De versleutelde kopie is niet te ontcijferen met de huidige wachtwoordzin.");
    if (status.offsite === "missing") reasons.push("De kopie buiten de server ontbreekt.");
    if (status.offsite === "size-mismatch") reasons.push("De kopie buiten de server is niet even groot als het origineel.");
    if (reasons.length === 0 && !status.ok) reasons.push(status.error || "De hersteltest meldde een probleem.");
  }
  if (reasons.length > 0) return { state: "failed", reasons };
  const ageHours = (now - Date.parse(status.at)) / 3_600_000;
  if (ageHours > VERIFY_MAX_AGE_HOURS) return { state: "stale", reasons: [`De laatste hersteltest is ${Math.floor(ageHours / 24)} dagen geleden; hij hoort elke week te draaien.`] };
  return { state: "ok", reasons: [] };
}

/** Beoordeelt de laatste back-up. `fileFound` = het genoemde dumpbestand staat echt op schijf. */
export function evaluateBackup(status: BackupStatus | null, fileFound: boolean, now = Date.now()): { state: BackupState; reasons: string[] } {
  if (!status) return { state: "missing", reasons: ["Er is nog geen back-up gemaakt."] };
  const reasons: string[] = [];
  if (!status.ok) reasons.push(status.error ? `De laatste back-up is mislukt: ${status.error}` : "De laatste back-up is mislukt.");
  if (!status.file || status.bytes < 1024) reasons.push("Het databasebestand ontbreekt of is leeg.");
  else if (!fileFound) reasons.push(`Het bestand ${status.file} staat niet meer op de server.`);
  if (status.file && !status.restore.ok) reasons.push("De proef-terugzetting is niet gelukt.");
  // een status van vóór de telling (liveUsers 0) slaat dit over
  const { users, liveUsers } = status.restore;
  if (status.file && status.restore.ok && liveUsers > 0 && users < Math.floor(liveUsers * GEBRUIKERS_MARGE)) {
    reasons.push(`In de proef-terugzetting staan maar ${users} van de ${liveUsers} gebruikers: de back-up is niet compleet.`);
  }
  if (reasons.length > 0) return { state: "failed", reasons };
  const ageHours = (now - Date.parse(status.at)) / 3_600_000;
  if (ageHours > BACKUP_MAX_AGE_HOURS) {
    return { state: "stale", reasons: [`Er is al ${Math.floor(ageHours)} uur geen nieuwe back-up gemaakt.`] };
  }
  return { state: "ok", reasons: [] };
}

const mbTekst = (bytes: number): string => `${(bytes / 1_048_576).toFixed(bytes >= 10 * 1_048_576 ? 0 : 1).replace(".", ",")} MB`;

/**
 * Het nieuwste databasebestand tegen dat van de vorige back-up (`files` nieuwste eerst). Na een grote opruiming klopt een
 * kleiner bestand; anders ontbreekt er iets, en dan moet het opvallen zolang de oudere back-ups er nog staan.
 */
export function krimpWaarschuwing(files: BackupFile[], nieuwste: string): string | null {
  const i = files.findIndex((f) => f.name === nieuwste);
  const nu = files[i];
  const vorige = i >= 0 ? files[i + 1] : undefined;
  if (!nu || !vorige || vorige.bytes < 1_048_576 || nu.bytes >= vorige.bytes * KRIMP_FACTOR) return null;
  return `Het nieuwste databasebestand (${mbTekst(nu.bytes)}) is minder dan de helft van het vorige (${mbTekst(vorige.bytes)}). Na een grote opruiming klopt dat; anders ontbreken er gegevens. Kijk het na zolang de oudere back-ups er nog staan.`;
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
  const empty: BackupReport = { available: false, state: "missing", reasons: [], status: null, files: [], disk: null, waarschuwing: null, verificatie: { state: "missing", reasons: [], status: null, history: [] } };
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

  // de diepgaande hersteltest: de laatste (verify.json) en de geschiedenis (één regel per test)
  let verify: VerifyStatus | null = null;
  try {
    verify = parseVerifyStatus(JSON.parse(await readFile(path.join(dir, "verify.json"), "utf8")));
  } catch {
    /* nog nooit getest */
  }
  let history: VerifyStatus[] = [];
  try {
    history = (await readFile(path.join(dir, "verificaties.jsonl"), "utf8"))
      .split("\n")
      .filter((l) => l.trim())
      .flatMap((l) => {
        try {
          const v = parseVerifyStatus(JSON.parse(l));
          return v ? [v] : [];
        } catch {
          return [];
        }
      })
      .reverse()
      .slice(0, 30);
  } catch {
    /* geen geschiedenis */
  }
  const v = evaluateVerification(verify, now);
  const waarschuwing = status?.file && fileFound ? krimpWaarschuwing(files, status.file) : null;
  return { available: true, state, reasons, status, files, disk, waarschuwing, verificatie: { state: v.state, reasons: v.reasons, status: verify, history } };
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

  // de wekelijkse hersteltest: hartslag als de laatste geslaagd en vers is, anders waarschuwen
  // (nog nooit gedaan = de dienst draait de eerste vanzelf bij het opstarten; dan nog geen alarm)
  if (report.verificatie.state === "ok") {
    recordCronRun("db-backup-verify", true);
  } else if (report.verificatie.state !== "missing") {
    await alertOwner({
      key: "backup:verify",
      title: report.verificatie.state === "stale" ? "Hersteltest van de back-up blijft uit" : "Hersteltest van de back-up mislukt",
      detail: `${report.verificatie.reasons.join(" ")} Een back-up die niet terug te zetten is, is geen back-up. Start de test opnieuw via Admin → Systeem → Back-ups.`,
      severity: "critical",
      url: "/admin/systeem#backups",
    });
  }

  // veel kleiner dan de vorige: de back-up zelf is gelukt (hartslag blijft), maar het moet opvallen
  if (report.waarschuwing) {
    await alertOwner({
      key: "backup:krimp",
      title: "Back-up opvallend kleiner dan de vorige",
      detail: report.waarschuwing,
      severity: "warning",
      url: "/admin/systeem#backups",
    });
  }

  const alert = diskAlert(report.disk);
  if (alert) await alertOwner(alert);

  logger.info("backup check", { state: report.state, verify: report.verificatie.state, diskUsed: report.disk?.usedPercent ?? null });
  return report;
}

/** The owner alert for a filling disk, or null below DISK_WARN_PERCENT. */
export function diskAlert(disk: DiskUsage | null): OpsAlert | null {
  if (!disk || disk.usedPercent < DISK_WARN_PERCENT) return null;
  return {
    key: "disk:server",
    title: `Serverschijf ${disk.usedPercent}% vol`,
    // 3 Nov 2026: a plain `builder prune -f` freed 0 B (BuildKit marks the per-build cache shared); -a freed 54 GB
    detail: `Er is nog ${Math.round(disk.freeBytes / 1024 ** 3)} GB vrij. Bij een volle schijf kan de database niets meer opslaan. Meestal is het de bouwcache van de uitrollen: vraag Claude de server op te ruimen (docker builder prune -af --filter until=2h).`,
    severity: disk.usedPercent >= DISK_CRIT_PERCENT ? "critical" : "warning",
    url: "/admin/systeem#backups",
  };
}

/** Elk uur (cron): alleen de schijf. Uitrollen vullen hem overdag, de back-upcontrole draait maar één keer per nacht. */
export async function checkDisk(dir = BACKUP_DIR): Promise<DiskUsage | null> {
  let disk: DiskUsage;
  try {
    const s = await statfs(dir);
    disk = diskUsage(s.blocks, s.bfree, s.bavail, s.bsize);
  } catch {
    return null; // no backup mount here (dev): nothing to measure
  }
  const alert = diskAlert(disk);
  if (alert) await alertOwner(alert);
  return disk;
}
