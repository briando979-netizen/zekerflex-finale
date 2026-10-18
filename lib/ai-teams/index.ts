import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvAppend, kvGet, kvSet } from "@/lib/storage/kv";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { shiftCategory } from "@/lib/shifts/category";

// ---------------------------------------------------------------------------
// ZekerFlex AI-teams. Each team runs on its own every day, works from real
// platform data and writes everything it does to a live report. Work inside
// ZekerFlex that's harmless is just done (analyses, reports, findings);
// anything that reaches outside (a mail to a client, re-sending a webhook)
// is prepared as a proposal and executed with one click by a human.
// Teams that need to think in language (strategy, proposals, teacher) run
// once the language model is connected.
//   key "ai-teams-feed"        → FeedItem[] (latest 500)
//   key "ai-teams-proposals"   → Proposal[]
//   key "ai-teams-lastrun"     → ISO time
// ---------------------------------------------------------------------------

export interface FeedItem {
  id: string;
  team: string;
  at: string;
  text: string;
  kind: "done" | "finding" | "proposal" | "idea" | "error";
}

export type ProposalAction =
  | { type: "timesheet-reminder"; timesheetId: string; tenantId: string }
  | { type: "reactivation-mail"; tenantId: string }
  | { type: "resend-webhook"; deliveryId: string };

export interface Proposal {
  id: string;
  team: string;
  at: string;
  title: string;
  detail: string;
  action: ProposalAction | null;
  status: "open" | "done" | "dismissed";
  result?: string;
}

export interface Team {
  id: string;
  name: string;
  emoji: string;
  mission: string;
  members: string[];
  needsModel: boolean;
}

export const TEAMS: Team[] = [
  { id: "groei", name: "Groei & winst", emoji: "📈", mission: "Meer omzet: welke branches tekort hebben, welke klanten stilvallen, waar de prijs omhoog kan.", members: ["Prijsanalist", "Reactivatie-bot", "Omzetwachter"], needsModel: false },
  { id: "oplossingen", name: "Oplossingen", emoji: "🛠️", mission: "Vindt wat misgaat (mislukte webhooks, betalingen, vaste opdrachten) en zet de oplossing klaar.", members: ["Storingzoeker", "Hersteller"], needsModel: false },
  { id: "automatisering", name: "Automatisering", emoji: "⚙️", mission: "Ziet waar werk blijft liggen (uren die niet worden goedgekeurd) en zet herinneringen klaar.", members: ["Opvolger", "Herinneraar"], needsModel: false },
  { id: "stijl", name: "Stijl & ontwerp", emoji: "🎨", mission: "Bewaakt de uitstraling: producten zonder foto of goede tekst, onvolledige profielen.", members: ["Art director", "Tekstcontroleur"], needsModel: false },
  { id: "updates", name: "Updates & rapportage", emoji: "📰", mission: "Dagelijks een verslag van de cijfers en wat er veranderde.", members: ["Verslaggever"], needsModel: false },
  { id: "denken", name: "Denken & strategie", emoji: "🧠", mission: "Denkt na over de koers op basis van de cijfers en signalen van de andere teams.", members: ["Strateeg"], needsModel: true },
  { id: "voorstellen", name: "Voorstellen & ideeën", emoji: "💡", mission: "Bedenkt nieuwe producten, functies en campagnes.", members: ["Bedenker", "Productmanager"], needsModel: true },
  { id: "leraar", name: "Leraar", emoji: "🎓", mission: "Leert van wat werkte en wat niet, en schrijft lessen voor de andere teams.", members: ["Mentor"], needsModel: true },
];

const DAY = 86_400_000;
const feedId = () => randomUUID().slice(0, 10);

async function log(team: string, text: string, kind: FeedItem["kind"] = "done") {
  await kvAppend<FeedItem>("ai-teams-feed", { id: feedId(), team, at: new Date().toISOString(), text: text.slice(0, 600), kind }, 500);
}

async function propose(p: Omit<Proposal, "id" | "at" | "status">) {
  const list = (await kvGet<Proposal[]>("ai-teams-proposals")) ?? [];
  // One open proposal per action target.
  const sig = JSON.stringify(p.action);
  if (p.action && list.some((x) => x.status === "open" && JSON.stringify(x.action) === sig)) return;
  list.unshift({ ...p, id: randomUUID().slice(0, 10), at: new Date().toISOString(), status: "open" });
  await kvSet("ai-teams-proposals", list.slice(0, 300));
  await log(p.team, `Voorstel: ${p.title}`, "proposal");
}

// ---- data-driven teams ----------------------------------------------------

async function groei(now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const shifts = await prisma.shift.findMany({ where: { startsAt: { gte: since, lte: now } }, select: { title: true, positions: true, hourlyRateCents: true, _count: { select: { assignments: true } } }, take: 20_000 });
  const byCat = new Map<string, { pos: number; filled: number; rates: number[] }>();
  for (const s of shifts) {
    const k = shiftCategory(s.title, null).label;
    const c = byCat.get(k) ?? { pos: 0, filled: 0, rates: [] };
    c.pos += s.positions;
    c.filled += Math.min(s.positions, s._count.assignments);
    c.rates.push(s.hourlyRateCents);
    byCat.set(k, c);
  }
  for (const [cat, c] of byCat) {
    if (c.pos < 10) continue;
    const fill = c.filled / c.pos;
    if (fill < 0.6) await log("groei", `${cat}: maar ${Math.round(fill * 100)}% van ${c.pos} plekken bezet in 30 dagen. Advies: richttarief ~5–10% omhoog of eerder plaatsen.`, "finding");
  }
  await log("groei", `Bezetting per branche geanalyseerd (${shifts.length} klussen, ${byCat.size} branches).`);

  // Clients that went quiet: posted before, nothing in the last 45 days.
  const recent = new Set((await prisma.shift.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 45 * DAY) } }, select: { branch: { select: { tenantId: true } } }, take: 20_000 })).map((s) => s.branch.tenantId));
  const before = await prisma.shift.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 180 * DAY), lt: new Date(now.getTime() - 45 * DAY) } }, select: { branch: { select: { tenantId: true, tenant: { select: { name: true } } } } }, take: 20_000 });
  const quiet = new Map<string, string>();
  for (const s of before) if (!recent.has(s.branch.tenantId)) quiet.set(s.branch.tenantId, s.branch.tenant.name);
  for (const [tenantId, name] of [...quiet].slice(0, 10)) {
    await propose({ team: "groei", title: `${name} plaatst al 45 dagen niets meer`, detail: "Stuur een persoonlijke mail met de staffelkorting en snelle uitbetaling om ze terug te halen.", action: { type: "reactivation-mail", tenantId } });
  }
}

async function oplossingen(now: Date) {
  const since = new Date(now.getTime() - DAY);
  const failed = await prisma.webhookDelivery.findMany({ where: { createdAt: { gte: since }, deliveredAt: null, nextAttemptAt: null }, select: { id: true, eventType: true, lastError: true, subscription: { select: { url: true } } }, take: 50 });
  for (const d of failed.slice(0, 10)) {
    await propose({ team: "oplossingen", title: `Webhook ${d.eventType} kwam niet aan`, detail: `${d.subscription.url} — ${d.lastError ?? "onbekende fout"}. Opnieuw versturen?`, action: { type: "resend-webhook", deliveryId: d.id } });
  }
  const payments = await prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
  if (payments) await log("oplossingen", `${payments} mislukte uitbetaling(en) in 7 dagen — staan in de wachtrij voor een nieuwe poging.`, "finding");
  await log("oplossingen", `Storingen gecontroleerd: ${failed.length} mislukte webhook(s), ${payments} mislukte uitbetaling(en).`);
}

async function automatisering(now: Date) {
  const stale = await prisma.timesheet.findMany({
    where: { status: "SUBMITTED", updatedAt: { lte: new Date(now.getTime() - 3 * DAY) } },
    select: { id: true, branch: { select: { tenantId: true, name: true, tenant: { select: { name: true } } } }, freelancer: { select: { user: { select: { fullName: true } } } } },
    take: 30,
  });
  for (const t of stale) {
    await propose({ team: "automatisering", title: `Uren van ${t.freelancer.user.fullName} wachten >3 dagen`, detail: `${t.branch.tenant.name} (${t.branch.name}) heeft de ingediende uren nog niet goedgekeurd. Herinnering sturen?`, action: { type: "timesheet-reminder", timesheetId: t.id, tenantId: t.branch.tenantId } });
  }
  await log("automatisering", `${stale.length} urenbriefje(s) die al langer dan 3 dagen op goedkeuring wachten.`);
}

async function stijl() {
  const products = await prisma.shopProduct.findMany({ where: { active: true }, select: { name: true, imageUrl: true, description: true } });
  const noImage = products.filter((p) => !p.imageUrl);
  const thin = products.filter((p) => p.description.trim().length < 80);
  if (noImage.length) await log("stijl", `${noImage.length} product(en) zonder foto: ${noImage.slice(0, 5).map((p) => p.name).join(", ")}${noImage.length > 5 ? " …" : ""}.`, "finding");
  if (thin.length) await log("stijl", `${thin.length} product(en) met een te korte omschrijving (<80 tekens).`, "finding");
  await log("stijl", `Webshop-uitstraling gecontroleerd (${products.length} actieve producten).`);
}

async function updates(now: Date) {
  const d1 = new Date(now.getTime() - DAY);
  const [users, shifts, approved, orders] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: d1 } } }),
    prisma.shift.count({ where: { createdAt: { gte: d1 } } }),
    prisma.timesheet.count({ where: { approvedAt: { gte: d1 } } }),
    prisma.shopOrder.count({ where: { createdAt: { gte: d1 }, status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] } } }),
  ]);
  await log("updates", `Afgelopen 24 uur: ${users} nieuwe gebruiker(s), ${shifts} nieuwe klus(sen), ${approved} goedgekeurde urenbriefje(s), ${orders} betaalde webshopbestelling(en).`);
}

// ---- language teams (need the model) --------------------------------------

async function languageTeam(team: Team) {
  const feed = ((await kvGet<FeedItem[]>("ai-teams-feed")) ?? []).slice(-40).map((f) => `[${f.team}] ${f.text}`).join("\n");
  const task =
    team.id === "denken"
      ? "Schrijf 3 strategische inzichten voor deze week, met de cijfers als onderbouwing."
      : team.id === "voorstellen"
        ? "Bedenk 3 concrete nieuwe ideeën (product, functie of campagne) met verwachte impact en eerste stap."
        : "Schrijf 3 lessen uit wat werkte en wat niet, als advies voor de andere teams.";
  const res = await chat({
    purpose: `ai-team-${team.id}`,
    temperature: 0.6,
    maxTokens: 700,
    retry: false,
    timeoutMs: 60_000,
    messages: [
      { role: "system", content: `Je bent het team "${team.name}" van ZekerFlex (flexwerk-platform met bank, webshop en uitzendbureau). Missie: ${team.mission} Nederlands, concreet, kort. Verzin geen cijfers.` },
      { role: "user", content: `Wat de andere teams vonden:\n${feed || "(nog niets)"}\n\nOpdracht: ${task}` },
    ],
  });
  for (const line of res.text.split("\n").map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()).filter((l) => l.length > 20).slice(0, 3)) {
    await log(team.id, line, "idea");
  }
}

/** One full round: every team does its work and reports. Daily by cron, or on demand. */
export async function runTeams(now = new Date()): Promise<{ teams: number; skipped: string[] }> {
  const skipped: string[] = [];
  const work: Record<string, () => Promise<void>> = {
    groei: () => groei(now),
    oplossingen: () => oplossingen(now),
    automatisering: () => automatisering(now),
    stijl: () => stijl(),
    updates: () => updates(now),
  };
  for (const team of TEAMS) {
    try {
      if (team.needsModel) {
        if (llmConfigProblem()) {
          skipped.push(team.id);
          continue;
        }
        await languageTeam(team);
      } else await work[team.id]!();
    } catch (err) {
      await log(team.id, `Fout tijdens het werk: ${(err as Error).message}`, "error");
    }
  }
  await kvSet("ai-teams-lastrun", now.toISOString());
  return { teams: TEAMS.length - skipped.length, skipped };
}

export async function feed(limit = 200): Promise<FeedItem[]> {
  return ((await kvGet<FeedItem[]>("ai-teams-feed")) ?? []).slice(-limit).reverse();
}

export async function proposals(): Promise<Proposal[]> {
  return (await kvGet<Proposal[]>("ai-teams-proposals")) ?? [];
}

export async function setProposalStatus(id: string, status: Proposal["status"], result?: string): Promise<Proposal | null> {
  const list = await proposals();
  const p = list.find((x) => x.id === id);
  if (!p) return null;
  p.status = status;
  if (result) p.result = result;
  await kvSet("ai-teams-proposals", list);
  await log(p.team, `${status === "done" ? "Uitgevoerd" : "Afgewezen"}: ${p.title}${result ? ` — ${result}` : ""}`);
  return p;
}
