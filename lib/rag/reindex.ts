import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { RagSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { chunkText } from "@/lib/rag/chunk";
import { embedMany, isRagEnabled } from "@/lib/rag/embed";
import { replaceSource, type UpsertChunkInput } from "@/lib/rag/store";

// ---------------------------------------------------------------------------
// Indexers - everything the sovereign box knows becomes searchable memory:
// the codebase, audit log, Wet DBA knowledge, sales history, live platform
// state and the AI's own interactions.
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const EMBED_BATCH = 24;

interface RawEntry {
  sourceRef: string;
  title: string;
  text: string;
}

/** Chunk, embed (in batches) and replace all chunks for a source type. */
async function indexEntries(
  sourceType: RagSourceType,
  entries: RawEntry[],
): Promise<number> {
  const pending: Array<Omit<UpsertChunkInput, "embedding">> = [];
  for (const e of entries) {
    const chunks = chunkText(e.text);
    chunks.forEach((content, chunkIndex) => {
      pending.push({ sourceType, sourceRef: e.sourceRef, title: e.title, chunkIndex, content });
    });
  }
  if (pending.length === 0) {
    await replaceSource(sourceType, []);
    return 0;
  }

  const withVectors: UpsertChunkInput[] = [];
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const vectors = await embedMany(batch.map((b) => b.content));
    batch.forEach((b, j) => {
      const embedding = vectors[j];
      if (embedding && embedding.length > 0) withVectors.push({ ...b, embedding });
    });
  }

  await replaceSource(sourceType, withVectors);
  return withVectors.length;
}

// --- CODE ---------------------------------------------------------------

const CODE_DIRS = ["lib", "app", "components", "types", "tests"];
const CODE_ROOT_FILES = ["middleware.ts", "README.md", "prisma/schema.prisma"];
const CODE_EXT = [".ts", ".tsx", ".prisma", ".md", ".mjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage"]);
const MAX_FILE_BYTES = 80_000;

async function walk(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(abs, acc);
    } else if (
      CODE_EXT.some((e) => entry.name.endsWith(e)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      acc.push(abs);
    }
  }
}

export async function indexCodebase(): Promise<number> {
  const files: string[] = [];
  for (const d of CODE_DIRS) await walk(join(ROOT, d), files);
  for (const f of CODE_ROOT_FILES) files.push(join(ROOT, f));

  const entries: RawEntry[] = [];
  for (const abs of files) {
    try {
      const info = await stat(abs);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
      const text = await readFile(abs, "utf8");
      if (!text.trim()) continue;
      const rel = relative(ROOT, abs).split(sep).join("/");
      entries.push({ sourceRef: rel, title: rel, text });
    } catch {
      /* skip unreadable file */
    }
  }
  return indexEntries("CODE", entries);
}

// --- AUDIT -------------------------------------------------------------

export async function indexAudit(): Promise<number> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 1500,
    select: {
      id: true,
      category: true,
      action: true,
      severity: true,
      summary: true,
      metadata: true,
      createdAt: true,
    },
  });
  const entries = rows.map((r) => ({
    sourceRef: `auditLog:${r.id}`,
    title: `${r.category} · ${r.action}`,
    text:
      `${r.createdAt.toISOString()} [${r.severity}] ${r.category}/${r.action}\n` +
      `${r.summary}\n` +
      `metadata: ${JSON.stringify(r.metadata).slice(0, 600)}`,
  }));
  return indexEntries("AUDIT", entries);
}

// --- LEGAL ------------------------------------------------------------

export async function indexLegal(): Promise<number> {
  const dir = join(ROOT, "lib", "rag", "knowledge");
  const entries: RawEntry[] = [];
  try {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".md")) continue;
      const text = await readFile(join(dir, name), "utf8");
      entries.push({ sourceRef: `legal:${name}`, title: name.replace(/\.md$/, ""), text });
    }
  } catch {
    /* no knowledge dir */
  }
  return indexEntries("LEGAL", entries);
}

// --- SALES ----------------------------------------------------------

export async function indexSales(): Promise<number> {
  const leads = await prisma.salesLead.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { outreach: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  const entries = leads.map((l) => ({
    sourceRef: `salesLead:${l.id}`,
    title: `Sales lead: ${l.companyName}`,
    text:
      `${l.companyName} (${l.city ?? "?"}) — sector ${l.sector ?? "?"}, status ${l.status}, score ${l.score ?? "n.v.t."}.\n` +
      `${l.scoreRationale ?? ""}\n${l.notes ?? ""}\n` +
      l.outreach
        .map((o) => `Outreach [${o.status}]: ${o.subject}\n${o.body.slice(0, 400)}`)
        .join("\n"),
  }));
  return indexEntries("SALES", entries);
}

// --- DATABASE (live platform state) --------------------------------

export async function indexPlatform(): Promise<number> {
  const [branches, shifts, freelancers, dba] = await Promise.all([
    prisma.branch.findMany({
      include: { tenant: { select: { name: true } }, _count: { select: { shifts: true } } },
    }),
    prisma.shift.findMany({
      where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED", "FILLED"] } },
      include: { branch: { select: { name: true, city: true } } },
      take: 200,
      orderBy: { startsAt: "asc" },
    }),
    prisma.freelancerProfile.findMany({
      take: 300,
      include: {
        user: { select: { fullName: true, kycStatus: true } },
        skills: { include: { skill: { select: { name: true } } } },
      },
    }),
    prisma.dbaComplianceRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        freelancer: { include: { user: { select: { fullName: true } } } },
        branch: { select: { name: true } },
      },
    }),
  ]);

  const entries: RawEntry[] = [];
  entries.push({
    sourceRef: "platform:branches",
    title: "Vestigingen",
    text: branches
      .map(
        (b) =>
          `${b.name} (${b.city}) — organisatie ${b.tenant.name}, geofence ${b.geofenceRadiusMeters}m, ${b._count.shifts} shifts.`,
      )
      .join("\n"),
  });
  entries.push({
    sourceRef: "platform:shifts",
    title: "Actieve shifts",
    text: shifts
      .map(
        (s) =>
          `${s.title} @ ${s.branch.name}, ${s.branch.city} — ${s.startsAt.toISOString()}, ${s.positions} plek(ken), status ${s.status}, €${(s.hourlyRateCents / 100).toFixed(2)}/u.`,
      )
      .join("\n"),
  });
  for (const f of freelancers) {
    entries.push({
      sourceRef: `freelancer:${f.id}`,
      title: `Flexwerker: ${f.user.fullName}`,
      text:
        `${f.user.fullName} — badge ${f.badgeLevel}, KYC ${f.user.kycStatus}, ` +
        `betrouwbaarheid ${f.reliabilityScore}, acceptatie ${f.acceptanceScore}, ` +
        `${f.shiftsCompleted} shifts afgerond, regio ${f.homePostalCode}. ` +
        `Skills: ${f.skills.map((s) => `${s.skill.name} (${s.rating})`).join(", ")}. ` +
        `${f.isBlacklisted ? "OP ZWARTE LIJST. " : ""}` +
        `${f.matchingBlockedUntil ? `Matching geblokkeerd tot ${f.matchingBlockedUntil.toISOString().slice(0, 10)}.` : ""}`,
    });
  }
  entries.push({
    sourceRef: "platform:dba",
    title: "Wet DBA compliance-historie",
    text: dba
      .map(
        (d) =>
          `${d.createdAt.toISOString().slice(0, 10)} ${d.freelancer.user.fullName} @ ${d.branch.name}: ${d.riskLevel}/${d.action} — ${d.rationale}`,
      )
      .join("\n"),
  });
  return indexEntries("DATABASE", entries);
}

// --- INTERACTION (the AI's own history) --------------------------

export async function indexInteractions(): Promise<number> {
  const findings = await prisma.orchestrationFinding.findMany({
    orderBy: { createdAt: "desc" },
    take: 400,
    include: { run: { select: { startedAt: true, summary: true } } },
  });
  const entries = findings.map((f) => ({
    sourceRef: `finding:${f.id}`,
    title: `Bevinding: ${f.title}`,
    text:
      `${f.run.startedAt.toISOString()} [${f.severity}] ${f.category} — ${f.title}\n` +
      `${f.detail}\n(status ${f.status}, actie ${f.actionKind})\n` +
      `cyclus-samenvatting: ${f.run.summary ?? ""}`,
  }));
  return indexEntries("INTERACTION", entries);
}

export interface ReindexResult {
  code: number;
  audit: number;
  legal: number;
  sales: number;
  database: number;
  interaction: number;
}

async function safely(
  name: string,
  fn: () => Promise<number>,
): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    logger.error("rag indexer failed", { indexer: name, error: (err as Error).message });
    return 0;
  }
}

export async function reindexAll(): Promise<ReindexResult> {
  if (!isRagEnabled()) {
    throw new Error("RAG is not enabled (RAG_ENABLED + LLM_EMBED_MODEL)");
  }
  const started = Date.now();
  const result = {
    code: await safely("code", indexCodebase),
    audit: await safely("audit", indexAudit),
    legal: await safely("legal", indexLegal),
    sales: await safely("sales", indexSales),
    database: await safely("database", indexPlatform),
    interaction: await safely("interaction", indexInteractions),
  };
  const total = Object.values(result).reduce((a, b) => a + b, 0);

  logger.info("rag reindex complete", { ...result, ms: Date.now() - started });
  await recordAudit({
    category: "ORCHESTRATION",
    action: "rag.reindex",
    actorLabel: "system",
    summary: `RAG-index herbouwd: ${total} chunks`,
    metadata: result,
  });
  return result;
}
