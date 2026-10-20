import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";
import { feed, proposals, setProposalStatus } from "@/lib/ai-teams";
import { executeProposal } from "@/lib/ai-teams/execute";
import { ownerTodos } from "@/lib/admin/owner-todos";
import { recentAlerts } from "@/lib/ops/alert";
import { liveSnapshot } from "@/lib/analytics/live";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { JARVIS_PERSONA } from "@/lib/jarvis/persona";

// ---------------------------------------------------------------------------
// The owner's desktop Jarvis (deploy/jarvis-desktop) talks to ZekerFlex here.
// Auth: one personal token per platform admin ("zfj_…"), created and revoked
// in Admin → Jarvis; only its SHA-256 is stored. Everything the companion
// does is read-only, except executing an AI-team proposal — and that needs a
// spoken "ja" within two minutes, and is audited under the admin's name.
// Works without a language model (fixed questions); with a model connected it
// also answers free questions.
//   KV "companion:tokens"          → { [sha256]: { userId, email, createdAt, lastUsedAt } }
//   KV "companion:ctx:<userId>"    → { list: proposalIds[], pending?: { id, until } }
// ---------------------------------------------------------------------------

interface TokenRow { userId: string; email: string; createdAt: string; lastUsedAt?: string }
type Tokens = Record<string, TokenRow>;
const TOKENS = "companion:tokens";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createCompanionToken(userId: string, email: string): Promise<string> {
  const token = `zfj_${randomBytes(24).toString("base64url")}`;
  const all = (await kvGet<Tokens>(TOKENS)) ?? {};
  // one token per admin: a new one replaces the old
  for (const [h, row] of Object.entries(all)) if (row.userId === userId) delete all[h];
  all[sha(token)] = { userId, email, createdAt: new Date().toISOString() };
  await kvSet(TOKENS, all);
  await recordAudit({ category: "ADMIN", action: "companion.token_created", actorUserId: userId, actorLabel: "user", summary: `${email} heeft de laptop-Jarvis gekoppeld` });
  return token;
}

export async function revokeCompanionToken(userId: string): Promise<void> {
  const all = (await kvGet<Tokens>(TOKENS)) ?? {};
  for (const [h, row] of Object.entries(all)) if (row.userId === userId) delete all[h];
  await kvSet(TOKENS, all);
}

export async function companionStatus(userId: string): Promise<{ linked: boolean; createdAt?: string; lastUsedAt?: string }> {
  const row = Object.values((await kvGet<Tokens>(TOKENS)) ?? {}).find((r) => r.userId === userId);
  return row ? { linked: true, createdAt: row.createdAt, ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt } : {}) } : { linked: false };
}

/** Bearer zfj_… → the admin it belongs to (still a platform admin, not disabled), or null. */
export async function verifyCompanion(request: Request): Promise<{ userId: string; email: string } | null> {
  const raw = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!raw.startsWith("zfj_")) return null;
  const all = (await kvGet<Tokens>(TOKENS)) ?? {};
  const h = sha(raw);
  const hit = Object.keys(all).find((k) => k.length === h.length && timingSafeEqual(Buffer.from(k), Buffer.from(h)));
  if (!hit) return null;
  const row = all[hit]!;
  const ok = await prisma.membership.findFirst({ where: { userId: row.userId, role: "PLATFORM_ADMIN", user: { disabledAt: null } }, select: { id: true } });
  if (!ok) return null;
  row.lastUsedAt = new Date().toISOString();
  await kvSet(TOKENS, all);
  return { userId: row.userId, email: row.email };
}

// ---- answering --------------------------------------------------------------

const DAY = 86_400_000;
const n = (x: number) => x.toLocaleString("nl-NL");

export async function briefing(): Promise<string> {
  const now = new Date();
  const d1 = new Date(now.getTime() - DAY);
  const [open, newUsers, waitingHours, props, todos, alerts, live] = await Promise.all([
    prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now } } }),
    prisma.user.count({ where: { createdAt: { gte: d1 } } }),
    prisma.timesheet.count({ where: { status: "SUBMITTED" } }),
    proposals(),
    ownerTodos().catch(() => []),
    recentAlerts(10).catch(() => []),
    liveSnapshot().catch(() => null),
  ]);
  const openProps = props.filter((p) => p.status === "open").length;
  const todoOpen = todos.filter((t) => !t.done).length;
  const recentAlertCount = alerts.filter((a) => now.getTime() - new Date(a.at).getTime() < DAY).length;
  const parts = [
    `Er staan ${n(open)} klussen open.`,
    `Afgelopen 24 uur kwam${newUsers === 1 ? "" : "en"} er ${n(newUsers)} nieuwe gebruiker${newUsers === 1 ? "" : "s"} bij.`,
    waitingHours ? `${n(waitingHours)} urenbriefjes wachten op goedkeuring.` : "",
    openProps ? `De AI-teams hebben ${n(openProps)} voorstellen klaarstaan.` : "Er staan geen voorstellen van de AI-teams open.",
    recentAlertCount ? `Let op: ${n(recentAlertCount)} storingsmeldingen in de afgelopen 24 uur.` : "Geen storingen.",
    live ? `Nu op de site: ${n(live.active.length)} bezoekers, vandaag ${n(live.today.visitors)} in totaal.` : "",
    todoOpen ? `Op je eigen takenlijst staan nog ${n(todoOpen)} punten.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

type Ctx = { list: string[]; pending?: { id: string; until: number } };
const ctxKey = (userId: string) => `companion:ctx:${userId}`;

export interface CompanionAnswer {
  text: string;
  /** set when the next utterance should be a yes/no */
  awaitingConfirm?: boolean;
}

export async function answer(raw: string, owner: { userId: string; email: string }): Promise<CompanionAnswer> {
  const q = raw.toLowerCase().replace(/^\s*(hey|hoi|hé)?\s*jarvis[,!\s]*/, "").trim();
  const ctx = (await kvGet<Ctx>(ctxKey(owner.userId))) ?? { list: [] };

  // confirmation of a pending proposal
  if (ctx.pending) {
    const pending = ctx.pending;
    delete ctx.pending;
    await kvSet(ctxKey(owner.userId), ctx);
    if (Date.now() < pending.until && /^(ja|jazeker|doe maar|uitvoeren|ja,? uitvoeren|bevestig)/.test(q)) {
      const p = (await proposals()).find((x) => x.id === pending.id && x.status === "open");
      if (!p) return { text: "Dat voorstel is al afgehandeld." };
      const result = p.action ? await executeProposal(p.action, owner.email) : "geen actie nodig";
      await setProposalStatus(p.id, "done", result);
      await recordAudit({ category: "ORCHESTRATION", action: "ai_team.proposal_executed", actorUserId: owner.userId, actorLabel: "companion", summary: `Laptop-Jarvis: ${p.title} — ${result}`, targetType: "ai-proposal", targetId: p.id });
      return { text: `Uitgevoerd: ${p.title}. Resultaat: ${result}.` };
    }
    if (/^(nee|stop|annuleer|laat maar)/.test(q)) return { text: "Oké, ik doe niets." };
  }

  if (!q || /^(help|wat kun je|wat kan je)/.test(q)) {
    return { text: "Je kunt me vragen: geef de briefing, wat hebben de agenten gevonden, welke voorstellen staan er, voer voorstel twee uit, hoeveel klussen staan er open, wie is er op de site, zijn er storingen, en wat moet ik nog doen." };
  }
  if (/briefing|goedemorgen|hoe staat|samenvatting|overzicht/.test(q)) return { text: await briefing() };

  const run = q.match(/(voer|keur)\s+voorstel\s+(\d+|een|één|twee|drie|vier|vijf)\s*(uit|goed)?/);
  if (run) {
    const words: Record<string, number> = { een: 1, "één": 1, twee: 2, drie: 3, vier: 4, vijf: 5 };
    const idx = (Number(run[2]) || words[run[2]!] || 0) - 1;
    const id = ctx.list[idx];
    const p = id ? (await proposals()).find((x) => x.id === id && x.status === "open") : undefined;
    if (!p) return { text: "Ik weet niet welk voorstel je bedoelt. Vraag eerst: welke voorstellen staan er." };
    ctx.pending = { id: p.id, until: Date.now() + 2 * 60_000 };
    await kvSet(ctxKey(owner.userId), ctx);
    return { text: `Voorstel: ${p.title}. ${p.detail} Zal ik dit uitvoeren? Zeg ja of nee.`, awaitingConfirm: true };
  }
  if (/voorstel/.test(q)) {
    const open = (await proposals()).filter((p) => p.status === "open").slice(0, 5);
    if (!open.length) return { text: "Er staan geen voorstellen open." };
    ctx.list = open.map((p) => p.id);
    await kvSet(ctxKey(owner.userId), ctx);
    return { text: `Er staan ${open.length} voorstellen klaar. ${open.map((p, i) => `${i + 1}: ${p.title}.`).join(" ")} Zeg bijvoorbeeld: voer voorstel 1 uit.` };
  }
  if (/agent|team|gevonden|bevinding/.test(q)) {
    const since = Date.now() - DAY;
    const items = (await feed(200)).filter((f) => f.kind === "finding" && new Date(f.at).getTime() >= since).slice(0, 6);
    return { text: items.length ? `De agenten vonden het afgelopen etmaal: ${items.map((f) => f.text).join(" ")}` : "De agenten hebben het afgelopen etmaal niets bijzonders gevonden." };
  }
  if (/storing|alert|melding|fout/.test(q)) {
    const a = (await recentAlerts(5)).filter((x) => Date.now() - new Date(x.at).getTime() < 3 * DAY);
    return { text: a.length ? `Recente storingen: ${a.map((x) => x.title).join("; ")}.` : "Geen storingen in de afgelopen drie dagen." };
  }
  if (/bezoeker|wie is er|op de site|live/.test(q)) {
    const s = await liveSnapshot();
    const top = s.active[0];
    return { text: `Nu op de site: ${s.active.length} bezoekers${top ? `, onder andere op ${top.path}` : ""}. Vandaag ${s.today.visitors} unieke bezoekers, waarvan ${s.today.who.anoniem ?? 0} zonder account.` };
  }
  if (/taak|taken|te doen|moet ik/.test(q)) {
    const t = (await ownerTodos()).filter((x) => !x.done);
    return { text: t.length ? `Nog ${t.length} punten. De eerste drie: ${t.slice(0, 3).map((x) => x.title).join("; ")}.` : "Je takenlijst is leeg. Goed bezig." };
  }
  if (/klus|dienst|shift/.test(q) && /open|hoeveel|staan/.test(q)) {
    const c = await prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: new Date() } } });
    return { text: `Er staan ${n(c)} klussen open.` };
  }
  if (/gebruiker|aanmelding|freelancer|bedrijven/.test(q) && /hoeveel|nieuw/.test(q)) {
    const [u, f, b] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - DAY) } } }),
      prisma.membership.count({ where: { role: "FREELANCER" } }),
      prisma.tenant.count({ where: { type: { not: "PLATFORM" } } }),
    ]);
    return { text: `Vandaag ${n(u)} nieuwe aanmeldingen. In totaal ${n(f)} freelancers en ${n(b)} bedrijven.` };
  }
  if (/uren|urenbrief|timesheet/.test(q)) {
    const c = await prisma.timesheet.count({ where: { status: "SUBMITTED" } });
    return { text: c ? `${n(c)} urenbriefjes wachten op goedkeuring door de opdrachtgever.` : "Er wachten geen uren op goedkeuring." };
  }

  // free question: only with a language model connected
  if (!llmConfigProblem()) {
    try {
      const r = await chat({
        purpose: "companion",
        temperature: 0.4,
        maxTokens: 300,
        retry: false,
        timeoutMs: 45_000,
        messages: [
          { role: "system", content: `${JARVIS_PERSONA}\nJe praat via een spraakassistent met de eigenaar: antwoord in 1-3 korte gesproken zinnen, zonder opmaak.\nActuele status: ${await briefing()}` },
          { role: "user", content: raw },
        ],
      });
      if (r.text.trim()) return { text: r.text.trim() };
    } catch {
      /* fall through */
    }
  }
  return { text: "Dat kan ik nog niet beantwoorden zonder taalmodel. Vraag bijvoorbeeld om de briefing, de voorstellen of wat de agenten gevonden hebben." };
}
