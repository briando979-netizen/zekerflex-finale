import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import type { Versie } from "@/lib/bouwer/versie";

// ---------------------------------------------------------------------------
// Live zetten met één klik, zonder Claude of een ssh-sessie.
//
// De app bouwt zichzelf niet: dat doet de live-zetter op de VPS
// (deploy/bouwer/zf-live.py, systemd-dienst buiten Docker). Die twee praten via
// vier KV-sleutels in Postgres, zodat er geen poort of gedeelde map nodig is:
//   verzoek   — door de app geschreven, door de server opgepakt en gewist
//   status    — alleen door de server geschreven (stap, uitkomst, migraties)
//   log       — de laatste regels van de lopende uitrol
//   hartslag  — elke 30 s, zodat de app ziet of de live-zetter draait
// Database-wijzigingen past de server alleen toe na expliciet akkoord op precies
// die migraties; bij een ongezonde nieuwe versie zet hij zelf de vorige terug.
// ---------------------------------------------------------------------------

export const K_VERZOEK = "bouwer:live:verzoek";
export const K_STATUS = "bouwer:live:status";
export const K_LOG = "bouwer:live:log";
export const K_HARTSLAG = "bouwer:live:hartslag";

export const GITHUB_REPO = process.env.ZF_GITHUB_REPO || "briando979-netizen/zekerflex-finale";

export type LiveActie = "uitrollen" | "terug";

export interface LiveVerzoek {
  id: string;
  actie: LiveActie;
  /** Namen van de migraties waarvoor akkoord is gegeven (moet exact de wachtende set zijn). */
  migraties: string[];
  destructiefAkkoord: boolean;
  /** Ook uitrollen als de live versie niet op GitHub main staat, of al gelijk is. */
  forceer: boolean;
  door: string;
  op: string;
}

export type LiveStaat = "bezig" | "wacht-op-akkoord" | "klaar" | "mislukt" | "teruggezet";

export interface LiveMigratie {
  naam: string;
  destructief: boolean;
  sql: string;
}

export interface LiveStatus {
  id: string;
  actie: LiveActie;
  staat: LiveStaat;
  stap: string;
  bericht: string;
  doel?: string;
  doelOnderwerp?: string;
  door: string;
  begon: string;
  bijgewerkt: string;
  klaar?: string;
  migraties: LiveMigratie[];
  /** De server kan "forceer" aanbieden (live staat niet op main, of is al gelijk). */
  kanForceren?: boolean;
}

export interface LiveLog {
  id: string;
  regels: string[];
}

export interface LiveHartslag {
  op: string;
  host: string;
  versie: number;
  bezig: boolean;
}

export interface Commit {
  sha: string;
  onderwerp: string;
  datum: string;
  auteur: string;
}

export interface GithubOverzicht {
  main: Commit | null;
  /** ahead = main is nieuwer dan live; identical; behind/diverged = live heeft iets dat niet op main staat. */
  vergelijking: "ahead" | "identical" | "behind" | "diverged" | "onbekend";
  nieuw: Commit[];
  aantalNieuw: number;
  /** Migratiemappen die met de nieuwe commits meekomen. */
  nieuweMigraties: string[];
}

/** Een uitrol die al zo lang niets meldt, is vastgelopen en blokkeert niet meer. */
const VASTGELOPEN_MS = 45 * 60_000;
/** De live-zetter schrijft elke 30 s; na 90 s stilte geldt hij als offline. */
const HARTSLAG_MS = 90_000;

export function agentLeeft(h: LiveHartslag | null, now = Date.now()): boolean {
  if (!h) return false;
  const t = Date.parse(h.op);
  return Number.isFinite(t) && now - t < HARTSLAG_MS;
}

export function isBezig(s: LiveStatus | null, now = Date.now()): boolean {
  if (!s || s.staat !== "bezig") return false;
  const t = Date.parse(s.bijgewerkt);
  return Number.isFinite(t) && now - t < VASTGELOPEN_MS;
}

export async function leesLive() {
  const [status, log, hartslag, verzoek] = await Promise.all([
    kvGet<LiveStatus>(K_STATUS),
    kvGet<LiveLog>(K_LOG),
    kvGet<LiveHartslag>(K_HARTSLAG),
    kvGet<LiveVerzoek>(K_VERZOEK),
  ]);
  return { status, log: log && status && log.id === status.id ? log.regels : [], hartslag, verzoek };
}

export async function plaatsVerzoek(v: Omit<LiveVerzoek, "id" | "op">): Promise<LiveVerzoek> {
  const verzoek: LiveVerzoek = { ...v, id: `live_${Date.now().toString(36)}`, op: new Date().toISOString() };
  await kvSet(K_VERZOEK, verzoek);
  return verzoek;
}

export async function trekVerzoekIn(): Promise<void> {
  await kvDelete(K_VERZOEK);
}

// ---- GitHub (openbare repo, geen sleutel nodig; 60 verzoeken/uur per IP) ----

type GhCommit = { sha: string; commit: { message: string; author?: { name?: string; date?: string } | null } };
type GhCompare = { status: string; ahead_by: number; commits: GhCommit[]; files?: { filename: string; status: string }[] };

function toCommit(c: GhCommit): Commit {
  return {
    sha: c.sha,
    onderwerp: c.commit.message.split("\n")[0] ?? "",
    datum: c.commit.author?.date ?? "",
    auteur: c.commit.author?.name ?? "",
  };
}

/** Migratiemappen uit een lijst gewijzigde bestanden: prisma/migrations/<naam>/migration.sql (toegevoegd). */
export function migratiesUitBestanden(files: { filename: string; status: string }[]): string[] {
  const namen = new Set<string>();
  for (const f of files) {
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(f.filename);
    if (m?.[1] && f.status === "added") namen.add(m[1]);
  }
  return [...namen].sort();
}

/** De commits tussen twee versies, oudste eerst (voor het dagoverzicht). */
export async function commitsTussen(van: string, tot: string): Promise<Commit[]> {
  const c = await gh<GhCompare>(`/compare/${van}...${tot}`);
  return c.commits.map(toCommit);
}

let ghCache: { key: string; at: number; data: GithubOverzicht } | null = null;
const GH_TTL_MS = 60_000;

async function gh<T>(pad: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}${pad}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "zekerflex-live-zetten" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub gaf ${res.status}`);
  return (await res.json()) as T;
}

export async function githubOverzicht(live: Versie | null, vers = false): Promise<GithubOverzicht> {
  const key = live?.sha ?? "-";
  if (!vers && ghCache && ghCache.key === key && Date.now() - ghCache.at < GH_TTL_MS) return ghCache.data;

  let data: GithubOverzicht;
  if (live) {
    const c = await gh<GhCompare>(`/compare/${live.sha}...main`);
    const nieuw = c.commits.map(toCommit).reverse();
    const vergelijking = (["ahead", "identical", "behind", "diverged"] as const).find((s) => s === c.status) ?? "onbekend";
    data = {
      main: nieuw[0] ?? (vergelijking === "identical" ? { sha: live.sha, onderwerp: live.onderwerp, datum: live.datum, auteur: "" } : null),
      vergelijking,
      nieuw: nieuw.slice(0, 40),
      aantalNieuw: c.ahead_by,
      nieuweMigraties: migratiesUitBestanden(c.files ?? []),
    };
    if (!data.main) {
      const [laatste] = await gh<GhCommit[]>(`/commits?sha=main&per_page=1`);
      data.main = laatste ? toCommit(laatste) : null;
    }
  } else {
    const lijst = await gh<GhCommit[]>(`/commits?sha=main&per_page=15`);
    const nieuw = lijst.map(toCommit);
    data = { main: nieuw[0] ?? null, vergelijking: "onbekend", nieuw, aantalNieuw: nieuw.length, nieuweMigraties: [] };
  }
  ghCache = { key, at: Date.now(), data };
  return data;
}
