import { createHash, randomBytes } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Client, type ClientChannel, type SFTPWrapper } from "ssh2";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { alertOwner } from "@/lib/ops/alert";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { resolvePublicHost, HostRejectedError } from "@/lib/security/public-host";
import { fetchPage } from "@/lib/website-check/fetch";
import { unsealWebsiteSecrets } from "@/lib/website/manage";
import { getMirror, latestMirror, mirrorDir } from "@/lib/website/mirror";
import { hostOf } from "@/lib/website/verify";

// ---------------------------------------------------------------------------
// Website-verhuizer, laatste stap: de verbeterde kopie live zetten op de server
// van de klant, via SSH met de verzegelde sleutel uit Website-beheer.
//
// Veiligheid, in volgorde:
//  - alleen na akkoord van de klant (in /werkgever/website) voor precies déze kopie;
//  - de server moet een openbaar internetadres zijn, en we herkennen hem aan zijn
//    vingerafdruk (eerste keer vastgelegd bij "Test verbinding"; wijkt hij later
//    af, dan stoppen we);
//  - we verwijderen nooit iets: de kopie gaat naar een nieuwe map naast de
//    webroot, daarna wisselen twee `mv`'s de mappen om. De oude site blijft
//    compleet staan (…zekerflex-oud-<tijd>) en terugzetten is weer één wissel;
//  - na de wissel moet de site antwoorden, anders zetten we meteen terug;
//  - één live-zetting tegelijk, alles in het auditspoor.
// ---------------------------------------------------------------------------

export interface DeployConfig {
  webroot: string | null;
  /** SHA256-vingerafdruk van de server, vastgelegd bij de eerste geslaagde test */
  hostKey: string | null;
  testedAt: string | null;
  realWebroot: string | null;
  filesNow: number | null;
  sizeKb: number | null;
}

export interface Approval {
  mirrorId: string;
  at: string;
  userId: string;
}

export interface DeployRecord {
  id: string;
  siteId: string;
  mirrorId: string;
  status: "bezig" | "live" | "mislukt" | "teruggezet";
  startedAt: string;
  finishedAt: string | null;
  by: string;
  webroot: string;
  oldDir: string | null;
  files: number;
  bytes: number;
  steps: { at: string; text: string }[];
  error: string | null;
}

const CONFIG_KEY = (siteId: string) => `site-deploy-config:${siteId}`;
const APPROVAL_KEY = (siteId: string) => `site-approval:${siteId}`;
const DEPLOY_KEY = (siteId: string) => `site-deploy:${siteId}`;
const LOCK_KEY = "site-deploy-running";
const STALE_MS = 30 * 60_000;

const emptyConfig = (): DeployConfig => ({ webroot: null, hostKey: null, testedAt: null, realWebroot: null, filesNow: null, sizeKb: null });

export async function getDeployConfig(siteId: string): Promise<DeployConfig> {
  return { ...emptyConfig(), ...((await kvGet<DeployConfig>(CONFIG_KEY(siteId)).catch(() => null)) ?? {}) };
}
export async function getApproval(siteId: string): Promise<Approval | null> {
  return kvGet<Approval>(APPROVAL_KEY(siteId)).catch(() => null);
}
export async function getDeploy(siteId: string): Promise<DeployRecord | null> {
  const rec = await kvGet<DeployRecord>(DEPLOY_KEY(siteId)).catch(() => null);
  if (rec?.status === "bezig" && Date.now() - Date.parse(rec.startedAt) > STALE_MS) {
    return { ...rec, status: "mislukt", error: rec.error ?? "Afgebroken (de server is tussendoor herstart). Controleer de webroot met de hand." };
  }
  return rec;
}

/** "~/public_html" of "/var/www/bakkerij"; geen shell-tekens, geen ".." en niet te hoog in de boom. */
export function validateWebroot(raw: string): string | null {
  const w = raw.trim().replace(/\/+$/, "");
  if (!/^(~\/|\/)[A-Za-z0-9._/-]+$/.test(w)) return null;
  const segs = w.replace(/^~\//, "").split("/").filter(Boolean);
  if (segs.length === 0 || segs.some((s) => s === "." || s === "..")) return null;
  if (w.startsWith("/") && segs.length < 2) return null;
  return w;
}

/** Shell-veilig citeren met enkele aanhalingstekens. */
export const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Pad op de server: "~/x" wordt "$HOME/x" (tussen aanhalingstekens werkt ~ niet). */
export const remotePath = (w: string, home: string) => (w.startsWith("~/") ? `${home}/${w.slice(2)}` : w);

/** Het controlescript: bestaat de map, is het niet de home of /, en mogen we in de map erboven schrijven? */
export function inspectScript(webroot: string): string {
  return [
    `W=${q(webroot)}`,
    `[ -d "$W" ] || { echo "ZF|NODIR"; exit 0; }`,
    `R=$(cd "$W" && pwd -P); H=$(cd ~ && pwd -P); P=$(dirname "$R")`,
    `if [ "$R" = "/" ] || [ "$R" = "$H" ]; then echo "ZF|UNSAFE"; exit 0; fi`,
    `case "$H/" in "$R"/*) echo "ZF|UNSAFE"; exit 0;; esac`,
    `[ -w "$P" ] || { echo "ZF|NOWRITE|$P"; exit 0; }`,
    `echo "ZF|OK|$R|$(ls -A "$R" | wc -l | tr -d ' ')|$(du -sk "$R" 2>/dev/null | cut -f1)"`,
  ].join("\n");
}

export type Inspect =
  | { ok: true; real: string; files: number; sizeKb: number }
  | { ok: false; reason: string };

export function parseInspect(out: string): Inspect {
  const line = out.split("\n").find((l) => l.startsWith("ZF|")) ?? "";
  const [, kind, a, b, c] = line.trim().split("|");
  if (kind === "OK" && a) return { ok: true, real: a, files: Number(b) || 0, sizeKb: Number(c) || 0 };
  if (kind === "NODIR") return { ok: false, reason: "Die map bestaat niet op de server." };
  if (kind === "UNSAFE") return { ok: false, reason: "Dat is de thuismap of een map daarboven. Kies de map van de website zelf (bijvoorbeeld public_html)." };
  if (kind === "NOWRITE") return { ok: false, reason: `We mogen niet schrijven in ${a ?? "de map erboven"}, dus kunnen we de oude site niet veilig opzij zetten. Vraag de hostingpartij om schrijfrechten of kies een andere map.` };
  return { ok: false, reason: "De server gaf een onverwacht antwoord." };
}

/** De wissel: oude map opzij, nieuwe map erin. Mislukt de tweede stap, dan gaat de oude terug. */
export function swapScript(real: string, newDir: string, oldDir: string): string {
  return [
    `R=${q(real)}; N=${q(newDir)}; O=${q(oldDir)}`,
    `[ -d "$N" ] || { echo "ZF|NONEW"; exit 0; }`,
    `[ -e "$O" ] && { echo "ZF|OLDEXISTS"; exit 0; }`,
    `mv "$R" "$O" || { echo "ZF|MOVEOLD"; exit 0; }`,
    `if mv "$N" "$R"; then echo "ZF|SWAPPED"; else mv "$O" "$R"; echo "ZF|RESTORED"; fi`,
  ].join("\n");
}

export function rollbackScript(real: string, oldDir: string, asideDir: string): string {
  return [
    `R=${q(real)}; O=${q(oldDir)}; A=${q(asideDir)}`,
    `[ -d "$O" ] || { echo "ZF|NOOLD"; exit 0; }`,
    `mv "$R" "$A" || { echo "ZF|MOVENEW"; exit 0; }`,
    `if mv "$O" "$R"; then echo "ZF|ROLLEDBACK"; else mv "$A" "$R"; echo "ZF|KEPT"; fi`,
  ].join("\n");
}

export const zfLine = (out: string) => out.split("\n").find((l) => l.startsWith("ZF|"))?.trim() ?? "";

/* ------------------------------- SSH-laag -------------------------------- */

export interface Access {
  ip: string;
  host: string;
  port: number;
  user: string;
  privateKey: string;
}

/** Servertoegang van een klant (verzegeld, geaudit). actor null = het systeem zelf (nachtelijke back-up). */
export async function access(siteId: string, actor: string | null, reason: string): Promise<Access> {
  const s = await unsealWebsiteSecrets(siteId, actor, reason);
  if (!s?.sshHost || !s.sshUser || !s.sshPrivateKey) throw new Error("De klant heeft nog geen SSH-host, gebruiker en sleutel ingevuld.");
  const port = s.sshPort ? Number(s.sshPort) : 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("De SSH-poort klopt niet.");
  let ip: string;
  try {
    ip = await resolvePublicHost(s.sshHost);
  } catch (err) {
    throw new Error(err instanceof HostRejectedError ? err.message : "De SSH-server is niet te vinden.");
  }
  return { ip, host: s.sshHost, port, user: s.sshUser, privateKey: s.sshPrivateKey };
}

export const fingerprintOf = (key: Buffer) => `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;

function sshMessage(err: Error & { level?: string; code?: string }): string {
  const m = err.message || "";
  if (/authentication methods failed/i.test(m) || err.level === "client-authentication") return "Inloggen op de server lukt niet met deze gebruiker en sleutel.";
  if (/host key|hostverif|Host denied/i.test(m)) return "De server heeft een andere vingerafdruk dan eerder. Voor de zekerheid gestopt: controleer of dit nog dezelfde server is.";
  if (err.code === "ECONNREFUSED") return "De server weigert de verbinding op deze poort.";
  if (/timed out|timeout/i.test(m) || err.code === "ETIMEDOUT") return "De server reageert niet.";
  if (/privateKey|Cannot parse/i.test(m)) return "De opgeslagen sleutel is geen geldige SSH-privésleutel (of er staat een wachtwoord op).";
  return "Verbinden met de server is mislukt.";
}

export function connect(a: Access, expectedKey: string | null): Promise<{ conn: Client; fingerprint: string }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let fingerprint = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error("De server reageert niet."));
    }, 25_000);
    conn
      .on("ready", () => {
        clearTimeout(timer);
        resolve({ conn, fingerprint });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(sshMessage(err)));
      })
      .connect({
        host: a.ip,
        port: a.port,
        username: a.user,
        privateKey: a.privateKey,
        readyTimeout: 20_000,
        hostVerifier: (key: Buffer) => {
          fingerprint = fingerprintOf(key);
          return !expectedKey || expectedKey === fingerprint;
        },
      });
  });
}

export function run(conn: Client, script: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(`sh -c ${q(script)}`, (err: Error | undefined, stream: ClientChannel) => {
      if (err) return reject(err);
      let out = "";
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error("Een opdracht op de server duurde te lang."));
      }, timeoutMs);
      stream.on("data", (d: Buffer) => (out += d.toString("utf8")));
      stream.stderr.on("data", () => undefined);
      stream.on("close", () => {
        clearTimeout(timer);
        resolve(out);
      });
    });
  });
}

export function sftpOf(conn: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp))));
}

export const put = (sftp: SFTPWrapper, local: string, remote: string) =>
  new Promise<void>((resolve, reject) => sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve())));

async function listFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(root, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/* ------------------------------ acties ------------------------------------ */

export async function setWebroot(siteId: string, raw: string, actor: string): Promise<DeployConfig> {
  const webroot = validateWebroot(raw);
  if (!webroot) throw new Error("Geef de map als volledig pad, bijvoorbeeld ~/public_html of /var/www/bakkerij.");
  const cfg = await getDeployConfig(siteId);
  // Andere map: opnieuw testen voordat er live gezet kan worden.
  const next: DeployConfig = { ...cfg, webroot, ...(cfg.webroot !== webroot ? { testedAt: null, realWebroot: null, filesNow: null, sizeKb: null } : {}) };
  await kvSet(CONFIG_KEY(siteId), next);
  await recordAudit({ category: "ADMIN", action: "website.deploy.webroot", actorUserId: actor, summary: `Webroot ingesteld: ${webroot}`, targetType: "managed-website", targetId: siteId });
  return next;
}

/** Alleen kijken: verbinden, vingerafdruk vastleggen (eerste keer), map controleren. Verandert niets. */
export async function testConnection(siteId: string, actor: string): Promise<DeployConfig & { result: Inspect }> {
  const cfg = await getDeployConfig(siteId);
  if (!cfg.webroot) throw new Error("Stel eerst de map van de website in.");
  const a = await access(siteId, actor, "verbinding testen (alleen lezen)");
  const { conn, fingerprint } = await connect(a, cfg.hostKey);
  try {
    const home = (await run(conn, 'printf %s "$HOME"', 15_000)).trim();
    const result = parseInspect(await run(conn, inspectScript(remotePath(cfg.webroot, home))));
    const next: DeployConfig = {
      ...cfg,
      hostKey: cfg.hostKey ?? fingerprint,
      ...(result.ok ? { testedAt: new Date().toISOString(), realWebroot: result.real, filesNow: result.files, sizeKb: result.sizeKb } : { testedAt: null }),
    };
    await kvSet(CONFIG_KEY(siteId), next);
    return { ...next, result };
  } finally {
    conn.end();
  }
}

/** De klant geeft akkoord voor precies deze kopie (vanuit /werkgever/website). */
export async function approveMirror(siteId: string, mirrorId: string, userId: string): Promise<Approval> {
  const m = await getMirror(mirrorId);
  if (!m || m.siteId !== siteId || m.status !== "klaar") throw new Error("Deze versie bestaat niet (meer). Vernieuw de pagina.");
  const latest = await latestMirror(siteId);
  if (latest?.id !== mirrorId) throw new Error("Er is inmiddels een nieuwere versie. Vernieuw de pagina en bekijk die eerst.");
  const approval: Approval = { mirrorId, at: new Date().toISOString(), userId };
  await kvSet(APPROVAL_KEY(siteId), approval);
  await recordAudit({ category: "COMPANY", action: "website.renewal.approved", actorUserId: userId, summary: `Klant gaf akkoord om de vernieuwde website live te zetten (${mirrorId})`, targetType: "managed-website", targetId: siteId });
  const site = await prisma.managedWebsite.findUnique({ where: { id: siteId }, select: { domain: true, tenant: { select: { name: true } } } });
  await alertOwner({
    key: `site-approved:${siteId}:${mirrorId}`,
    title: `Akkoord om live te zetten: ${site?.domain ?? siteId}`,
    detail: `${site?.tenant.name ?? "De klant"} gaf akkoord voor de vernieuwde website. Zet hem live in Admin, Website-beheer.`,
    severity: "warning",
    url: "/admin/website-beheer",
  });
  return approval;
}

/** Start het live zetten op de achtergrond. Controleert eerst alle voorwaarden. */
export async function startDeploy(siteId: string, actor: string): Promise<DeployRecord> {
  const [cfg, approval, mirror, current] = await Promise.all([getDeployConfig(siteId), getApproval(siteId), latestMirror(siteId), getDeploy(siteId)]);
  if (!mirror || mirror.status !== "klaar") throw new Error("Er is geen afgeronde kopie om live te zetten.");
  if (!approval || approval.mirrorId !== mirror.id) throw new Error("De klant heeft nog geen akkoord gegeven voor deze versie.");
  if (!cfg.webroot || !cfg.realWebroot || !cfg.hostKey || !cfg.testedAt) throw new Error("Test eerst de verbinding met de map van de website.");
  if (Date.now() - Date.parse(cfg.testedAt) > 24 * 3_600_000) throw new Error("De laatste test is ouder dan een dag. Test de verbinding opnieuw.");
  if (current?.status === "bezig") throw new Error("Er loopt al een live-zetting voor deze site.");
  const lock = await kvGet<{ id: string; at: string }>(LOCK_KEY).catch(() => null);
  if (lock && Date.now() - Date.parse(lock.at) < STALE_MS) throw new Error("Er loopt al een live-zetting. Wacht tot die klaar is.");

  const rec: DeployRecord = {
    id: randomBytes(8).toString("hex"),
    siteId,
    mirrorId: mirror.id,
    status: "bezig",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    by: actor,
    webroot: cfg.realWebroot,
    oldDir: null,
    files: 0,
    bytes: 0,
    steps: [],
    error: null,
  };
  await kvSet(DEPLOY_KEY(siteId), rec);
  await kvSet(LOCK_KEY, { id: rec.id, at: rec.startedAt });
  await recordAudit({ category: "ADMIN", action: "website.deploy.started", actorUserId: actor, summary: `Live zetten gestart van kopie ${mirror.id} naar ${cfg.realWebroot}`, targetType: "managed-website", targetId: siteId });
  void runDeploy(rec, cfg).catch(async (err) => {
    logger.error("site deploy crashed", { siteId, error: (err as Error).message });
    await kvSet(DEPLOY_KEY(siteId), { ...rec, status: "mislukt", finishedAt: new Date().toISOString(), error: "Onverwachte fout. Controleer de webroot met de hand." });
  });
  return rec;
}

async function siteAnswers(domain: string | null): Promise<boolean> {
  const host = hostOf(domain);
  if (!host) return true;
  for (let i = 0; i < 3; i++) {
    const res = await fetchPage(`https://${host}/`, { headersOnly: true, timeoutMs: 10_000 }).catch(() => null);
    if (res && res.status < 400) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function runDeploy(rec: DeployRecord, cfg: DeployConfig): Promise<void> {
  const step = async (text: string) => {
    rec.steps.push({ at: new Date().toISOString(), text });
    await kvSet(DEPLOY_KEY(rec.siteId), rec).catch(() => undefined);
  };
  const site = await prisma.managedWebsite.findUnique({ where: { id: rec.siteId }, select: { domain: true, requestedById: true } });
  let conn: Client | null = null;
  try {
    await step("Verbinden met de server");
    const a = await access(rec.siteId, rec.by, "vernieuwde website live zetten");
    ({ conn } = await connect(a, cfg.hostKey));
    const real = rec.webroot;
    const parent = path.posix.dirname(real);
    const ts = stamp();
    const newDir = `${parent}/.zekerflex-nieuw-${ts}`;
    const oldDir = `${real}.zekerflex-oud-${ts}`;

    const check = parseInspect(await run(conn, inspectScript(real)));
    if (!check.ok) throw new Error(check.reason);

    const root = mirrorDir(rec.mirrorId);
    const files = await listFiles(root);
    await step(`${files.length} bestanden uploaden naar een nieuwe map naast de site`);
    const dirs = [...new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== "."))];
    await run(conn, `mkdir -p ${q(newDir)}`);
    for (let i = 0; i < dirs.length; i += 100) {
      await run(conn, `cd ${q(newDir)} && mkdir -p ${dirs.slice(i, i + 100).map(q).join(" ")}`);
    }
    const sftp = await sftpOf(conn);
    const queue = [...files];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        await put(sftp, path.join(root, f), `${newDir}/${f}`);
        rec.files += 1;
        rec.bytes += (await stat(path.join(root, f))).size;
        if (rec.files % 25 === 0) await kvSet(DEPLOY_KEY(rec.siteId), rec).catch(() => undefined);
      }
    }));
    sftp.end();
    await run(conn, `chmod -R u=rwX,go=rX ${q(newDir)}`);

    await step("Oude site opzij zetten en de nieuwe erin wisselen");
    const swapped = zfLine(await run(conn, swapScript(real, newDir, oldDir)));
    if (swapped !== "ZF|SWAPPED") throw new Error(swapped === "ZF|RESTORED" ? "Wisselen lukte niet; de oude site staat er weer." : "Wisselen lukte niet; er is niets veranderd.");
    rec.oldDir = oldDir;

    await step("Controleren of de site antwoordt");
    if (!(await siteAnswers(site?.domain ?? null))) {
      const back = zfLine(await run(conn, rollbackScript(real, oldDir, `${parent}/.zekerflex-mislukt-${ts}`)));
      rec.status = back === "ZF|ROLLEDBACK" ? "teruggezet" : "mislukt";
      rec.error = back === "ZF|ROLLEDBACK"
        ? "De site antwoordde niet na de wissel. De oude site staat er automatisch weer."
        : "De site antwoordde niet en terugzetten lukte niet. Direct handmatig controleren!";
      rec.finishedAt = new Date().toISOString();
      await step(rec.error);
      await alertOwner({ key: `site-deploy-fail:${rec.siteId}`, title: `Live zetten mislukt: ${site?.domain ?? rec.siteId}`, detail: rec.error, severity: "critical", url: "/admin/website-beheer" });
      return;
    }

    rec.status = "live";
    rec.finishedAt = new Date().toISOString();
    await step(`Live. De oude site staat bewaard in ${oldDir}`);
    await recordAudit({ category: "ADMIN", action: "website.deploy.live", actorUserId: rec.by, summary: `Vernieuwde website live; oude site bewaard in ${oldDir}`, targetType: "managed-website", targetId: rec.siteId });
    await notifyLive(site?.requestedById ?? null, hostOf(site?.domain ?? null));
  } catch (err) {
    rec.status = "mislukt";
    rec.finishedAt = new Date().toISOString();
    rec.error = (err as Error).message || "Live zetten is mislukt.";
    await step(`Gestopt: ${rec.error}`);
    logger.warn("site deploy failed", { siteId: rec.siteId, error: rec.error });
  } finally {
    conn?.end();
    await kvSet(DEPLOY_KEY(rec.siteId), rec).catch(() => undefined);
    const lock = await kvGet<{ id: string }>(LOCK_KEY).catch(() => null);
    if (lock?.id === rec.id) await kvSet(LOCK_KEY, { id: rec.id, at: new Date(0).toISOString() }).catch(() => undefined);
  }
}

async function notifyLive(userId: string | null, host: string | null): Promise<void> {
  if (!userId || !host) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null);
  if (!user?.email) return;
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  await sendMail({
    to: user.email,
    kind: "website-live",
    subject: `Je vernieuwde website ${host} staat live`,
    text: `Je vernieuwde website ${host} staat live. Je oude site hebben we bewaard: wil je terug, laat het ons weten via de chat, dan staat hij er binnen een minuut weer.\n\n${base}/werkgever/website`,
    html: mailShell("Je vernieuwde website staat live", `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3C4A42">Je vernieuwde website <strong>${host}</strong> staat live. Je oude site hebben we bewaard: wil je terug, laat het ons weten via de chat, dan staat hij er binnen een minuut weer.</p><p style="margin:0">${mailButton(`https://${host}/`, "Bekijk je website")}</p>`),
  }).catch(() => undefined);
}

/** Terug naar de oude site: weer één wissel, er wordt niets verwijderd. */
export async function rollbackDeploy(siteId: string, actor: string): Promise<DeployRecord> {
  const [rec, cfg] = await Promise.all([getDeploy(siteId), getDeployConfig(siteId)]);
  if (!rec || rec.status !== "live" || !rec.oldDir) throw new Error("Er is geen live-zetting om terug te draaien.");
  const a = await access(siteId, actor, "terugzetten naar de oude website");
  const { conn } = await connect(a, cfg.hostKey);
  try {
    const aside = `${path.posix.dirname(rec.webroot)}/.zekerflex-teruggedraaid-${stamp()}`;
    const out = zfLine(await run(conn, rollbackScript(rec.webroot, rec.oldDir, aside)));
    if (out !== "ZF|ROLLEDBACK") throw new Error(out === "ZF|NOOLD" ? "De bewaarde oude site staat niet meer op de server." : "Terugzetten lukte niet; de nieuwe site staat er nog.");
    const next: DeployRecord = { ...rec, status: "teruggezet", finishedAt: new Date().toISOString(), steps: [...rec.steps, { at: new Date().toISOString(), text: `Teruggezet naar de oude site; de nieuwe staat opzij in ${aside}` }] };
    await kvSet(DEPLOY_KEY(siteId), next);
    await recordAudit({ category: "ADMIN", action: "website.deploy.rolledback", actorUserId: actor, summary: `Teruggezet naar de oude website (${rec.oldDir})`, targetType: "managed-website", targetId: siteId });
    return next;
  } finally {
    conn.end();
  }
}
