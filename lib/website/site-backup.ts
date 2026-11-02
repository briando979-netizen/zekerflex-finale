import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import type { Client, ClientChannel } from "ssh2";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { recordCronRun } from "@/lib/metrics";
import { access, connect, getDeployConfig, inspectScript, parseInspect, put, q, run, sftpOf, stamp, swapScript, zfLine } from "@/lib/website/deploy";
import { hostOf } from "@/lib/website/verify";

// ---------------------------------------------------------------------------
// Nachtelijke back-up van de websites die wij beheren (Website-beheer belooft
// "Dagelijkse back-ups"). Via dezelfde verzegelde SSH-toegang als het live
// zetten, alleen lezend: `tar czf -` van de webroot stroomt rechtstreeks naar
// een eigen schijfvolume (/app/site-backups). Bewust NIET onder /app/storage:
// dat gaat elke nacht mee in onze eigen back-up, dan zou elke klantsite 14 keer
// dubbel staan. De nieuwste 7 per site blijven bewaard.
//
// Terugzetten werkt als live zetten: uitpakken in een nieuwe map naast de
// webroot en wisselen; de huidige site blijft compleet bewaard.
// ---------------------------------------------------------------------------

export const SITE_BACKUP_DIR = process.env.SITE_BACKUP_DIR || path.join(process.cwd(), "site-backups");
export const KEEP_BACKUPS = 7;
export const MAX_BACKUP_BYTES = 2 * 1024 ** 3;
/** onder deze vrije ruimte slaan we nachtelijke back-ups over (en melden het) */
const MIN_FREE_BYTES = 10 * 1024 ** 3;
const LOCK_KEY = "site-backup-running";
const STATE_KEY = (siteId: string) => `site-backup:${siteId}`;
const STALE_MS = 2 * 3_600_000;

export interface SiteBackupFile {
  name: string;
  bytes: number;
  at: string;
}

export interface SiteBackupState {
  host: string;
  running: boolean;
  last: { at: string; ok: boolean; bytes: number; seconds: number; file: string | null; error: string | null } | null;
  lastRestore: { at: string; file: string; ok: boolean; oldDir: string | null; error: string | null } | null;
}

/** <host>-<JJJJMMDD-UUMMSS>.tar.gz — alleen deze vorm is te downloaden of terug te zetten. */
export const isBackupName = (name: string) => /^[a-z0-9.-]+-\d{8}-\d{6}\.tar\.gz$/.test(name);
const isSiteId = (id: string) => /^[a-z0-9_]{6,40}$/i.test(id);
export const siteBackupDir = (siteId: string) => {
  if (!isSiteId(siteId)) throw new Error("Ongeldige site.");
  return path.join(SITE_BACKUP_DIR, siteId);
};

/** De opdracht op de server: alleen lezen, het archief gaat naar stdout. */
export const backupCommand = (webroot: string) => `tar czf - -C ${q(webroot)} .`;

/** Uitpakken voor het terugzetten: in een nieuwe map, daarna alleen ons eigen tijdelijke archief weg. */
export const restoreExtractScript = (remoteTar: string, newDir: string) =>
  [`mkdir -p ${q(newDir)}`, `tar xzf ${q(remoteTar)} -C ${q(newDir)} || { echo "ZF|EXTRACTFAIL"; exit 0; }`, `rm -f ${q(remoteTar)}`, `echo "ZF|EXTRACTED"`].join("\n");

/** Welke bestanden weg mogen: alles behalve de nieuwste KEEP_BACKUPS (op naam = op tijd). */
export function backupsToPrune(names: string[], keep = KEEP_BACKUPS): string[] {
  return names.filter(isBackupName).sort().reverse().slice(keep);
}

export async function listSiteBackups(siteId: string): Promise<SiteBackupFile[]> {
  const dir = siteBackupDir(siteId);
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: SiteBackupFile[] = [];
  for (const name of names.filter(isBackupName)) {
    const s = await stat(path.join(dir, name)).catch(() => null);
    if (s?.isFile()) out.push({ name, bytes: s.size, at: s.mtime.toISOString() });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function getBackupState(siteId: string): Promise<SiteBackupState | null> {
  const s = await kvGet<SiteBackupState>(STATE_KEY(siteId)).catch(() => null);
  if (s?.running && s.last?.at && Date.now() - Date.parse(s.last.at) > STALE_MS) return { ...s, running: false };
  return s;
}

async function setState(siteId: string, patch: Partial<SiteBackupState> & { host: string }): Promise<void> {
  const prev = (await getBackupState(siteId)) ?? { host: patch.host, running: false, last: null, lastRestore: null };
  await kvSet(STATE_KEY(siteId), { ...prev, ...patch });
}

function streamTar(conn: Client, webroot: string, file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    conn.exec(backupCommand(webroot), (err: Error | undefined, stream: ClientChannel) => {
      if (err) return reject(err);
      const out = createWriteStream(file, { mode: 0o600 });
      let bytes = 0;
      let tooBig = false;
      let code: number | null = null;
      let errText = "";
      let pending = 2; // het bestand moet dicht én de verbinding klaar
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error("De back-up duurde langer dan 30 minuten."));
      }, 30 * 60_000);
      const done = () => {
        if (--pending > 0) return;
        clearTimeout(timer);
        if (tooBig) return reject(new Error(`De website is groter dan ${MAX_BACKUP_BYTES / 1024 ** 3} GB; te groot voor de nachtelijke back-up.`));
        // tar-code 1 = "een bestand veranderde tijdens het lezen": de back-up is bruikbaar.
        if (code !== null && code > 1) return reject(new Error(`Inpakken op de server mislukte (code ${code}): ${errText.slice(0, 200).trim()}`));
        resolve(bytes);
      };
      stream.on("data", (d: Buffer) => {
        bytes += d.length;
        if (bytes > MAX_BACKUP_BYTES && !tooBig) {
          tooBig = true;
          stream.close();
        }
      });
      stream.stderr.on("data", (d: Buffer) => {
        if (errText.length < 1000) errText += d.toString("utf8");
      });
      stream.on("exit", (c: number | null) => (code = c));
      stream.on("close", done);
      out.on("finish", done);
      out.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      stream.pipe(out);
    });
  });
}

async function isGzip(file: string): Promise<boolean> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(2);
    await fh.read(buf, 0, 2, 0);
    return buf[0] === 0x1f && buf[1] === 0x8b;
  } finally {
    await fh.close();
  }
}

/** Eén back-up maken. actor null = de nachtelijke taak. Gooit met een Nederlandse foutmelding. */
export async function backupSite(siteId: string, actor: string | null): Promise<SiteBackupFile> {
  const site = await prisma.managedWebsite.findUnique({ where: { id: siteId }, select: { domain: true } });
  const host = hostOf(site?.domain ?? null);
  if (!host) throw new Error("Deze site heeft geen geldig domein.");
  const cfg = await getDeployConfig(siteId);
  if (!cfg.realWebroot || !cfg.hostKey) throw new Error("Nog geen geteste servertoegang: stel de map in en test de verbinding.");

  const dir = siteBackupDir(siteId);
  await mkdir(dir, { recursive: true });
  const fs = await statfs(dir).catch(() => null);
  if (fs && fs.bavail * fs.bsize < MIN_FREE_BYTES) throw new Error("Te weinig vrije schijfruimte op onze server voor nog een back-up.");

  const started = Date.now();
  await setState(siteId, { host, running: true });
  const name = `${host}-${stamp()}.tar.gz`;
  const partial = path.join(dir, `${name}.part`);
  try {
    const a = await access(siteId, actor, actor ? "back-up van de website maken (alleen lezen)" : "nachtelijke back-up van de website (alleen lezen)");
    const { conn } = await connect(a, cfg.hostKey);
    try {
      const exists = zfLine(await run(conn, `[ -d ${q(cfg.realWebroot)} ] && echo "ZF|OK" || echo "ZF|NODIR"`, 30_000));
      if (exists !== "ZF|OK") throw new Error("De map van de website bestaat niet meer op de server.");
      const bytes = await streamTar(conn, cfg.realWebroot, partial);
      if (bytes < 20 || !(await isGzip(partial))) throw new Error("Het archief van de server is leeg of onleesbaar.");
      await rename(partial, path.join(dir, name));
      for (const old of backupsToPrune(await readdir(dir))) await rm(path.join(dir, old), { force: true });
      const seconds = Math.round((Date.now() - started) / 1000);
      await setState(siteId, { host, running: false, last: { at: new Date().toISOString(), ok: true, bytes, seconds, file: name, error: null } });
      logger.info("site backup done", { siteId, bytes, seconds });
      return { name, bytes, at: new Date().toISOString() };
    } finally {
      conn.end();
    }
  } catch (err) {
    await rm(partial, { force: true }).catch(() => undefined);
    const error = (err as Error).message || "De back-up is mislukt.";
    await setState(siteId, { host, running: false, last: { at: new Date().toISOString(), ok: false, bytes: 0, seconds: Math.round((Date.now() - started) / 1000), file: null, error } });
    throw new Error(error);
  }
}

/** Elke nacht (cron): alle actief beheerde sites met geteste toegang, één voor één. */
export async function runSiteBackups(): Promise<{ done: number; failed: number; skipped: number }> {
  const lock = await kvGet<{ at: string }>(LOCK_KEY).catch(() => null);
  if (lock && Date.now() - Date.parse(lock.at) < STALE_MS) return { done: 0, failed: 0, skipped: 0 };
  await kvSet(LOCK_KEY, { at: new Date().toISOString() });
  let done = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const sites = await prisma.managedWebsite.findMany({ where: { status: "ACTIVE", domain: { not: null } }, select: { id: true, domain: true, tenant: { select: { name: true } } } });
    for (const s of sites) {
      const cfg = await getDeployConfig(s.id);
      if (!cfg.realWebroot || !cfg.hostKey) {
        skipped += 1;
        continue;
      }
      try {
        await backupSite(s.id, null);
        done += 1;
      } catch (err) {
        failed += 1;
        await alertOwner({
          key: `site-backup:${s.id}`,
          title: `Back-up van ${hostOf(s.domain) ?? s.id} mislukt`,
          detail: `${s.tenant.name}: ${(err as Error).message}`,
          severity: "warning",
          url: "/admin/website-beheer",
        });
      }
    }
  } finally {
    await kvSet(LOCK_KEY, { at: new Date(0).toISOString() }).catch(() => undefined);
  }
  recordCronRun("site-backups", failed === 0);
  logger.info("site backups run", { done, failed, skipped });
  return { done, failed, skipped };
}

/** Een back-up terugzetten: uitpakken naast de webroot en wisselen. De huidige site blijft bewaard. */
export async function restoreSiteBackup(siteId: string, file: string, actor: string): Promise<{ oldDir: string }> {
  if (!isBackupName(file)) throw new Error("Onbekende back-up.");
  const local = path.join(siteBackupDir(siteId), file);
  if (!(await stat(local).catch(() => null))?.isFile()) throw new Error("Deze back-up staat niet (meer) op onze server.");
  const cfg = await getDeployConfig(siteId);
  if (!cfg.realWebroot || !cfg.hostKey) throw new Error("Nog geen geteste servertoegang: stel de map in en test de verbinding.");
  const site = await prisma.managedWebsite.findUnique({ where: { id: siteId }, select: { domain: true } });
  const host = hostOf(site?.domain ?? null) ?? siteId;

  const a = await access(siteId, actor, `back-up ${file} terugzetten`);
  const { conn } = await connect(a, cfg.hostKey);
  const real = cfg.realWebroot;
  const parent = path.posix.dirname(real);
  const ts = stamp();
  const remoteTar = `${parent}/.zekerflex-terugzet-${ts}.tar.gz`;
  const newDir = `${parent}/.zekerflex-nieuw-${ts}`;
  const oldDir = `${real}.zekerflex-voor-terugzetten-${ts}`;
  try {
    const check = parseInspect(await run(conn, inspectScript(real)));
    if (!check.ok) throw new Error(check.reason);
    const sftp = await sftpOf(conn);
    await put(sftp, local, remoteTar);
    sftp.end();
    if (zfLine(await run(conn, restoreExtractScript(remoteTar, newDir), 30 * 60_000)) !== "ZF|EXTRACTED") throw new Error("Uitpakken op de server mislukte; er is niets veranderd.");
    const swapped = zfLine(await run(conn, swapScript(real, newDir, oldDir)));
    if (swapped !== "ZF|SWAPPED") throw new Error("Wisselen lukte niet; de huidige site staat er nog.");
    await setState(siteId, { host, lastRestore: { at: new Date().toISOString(), file, ok: true, oldDir, error: null } });
    await recordAudit({ category: "ADMIN", action: "website.backup.restored", actorUserId: actor, severity: "warning", summary: `Back-up ${file} teruggezet; de site van daarvoor staat in ${oldDir}`, targetType: "managed-website", targetId: siteId });
    return { oldDir };
  } catch (err) {
    await setState(siteId, { host, lastRestore: { at: new Date().toISOString(), file, ok: false, oldDir: null, error: (err as Error).message } });
    throw err;
  } finally {
    conn.end();
  }
}

/** Voor de download in beheer: een leesstroom van een bewaarde back-up. */
export async function openSiteBackup(siteId: string, file: string): Promise<{ stream: ReturnType<typeof createReadStream>; bytes: number } | null> {
  if (!isBackupName(file)) return null;
  const full = path.join(siteBackupDir(siteId), file);
  const s = await stat(full).catch(() => null);
  if (!s?.isFile()) return null;
  return { stream: createReadStream(full), bytes: s.size };
}
