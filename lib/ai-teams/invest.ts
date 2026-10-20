import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { shiftCategory } from "@/lib/shifts/category";
import { addCustom } from "@/lib/admin/owner-todos";
import type { TeamTools } from "@/lib/ai-teams/extra-teams";

// ---------------------------------------------------------------------------
// Investeringen — the team that thinks about where money earns the most.
// It reads the real numbers (fee revenue, fill rate per branche, visitors who
// don't sign up, cancellations) and proposes concrete investments with a
// budget, an expected return and a first step — freely with a language model,
// rule-based on the same numbers without one.
//
// It never spends anything itself. An approved proposal becomes a task on the
// owner's list and counts against a monthly budget the owner sets; proposals
// that don't fit the remaining budget are not made.
//   KV "ai-invest:budget" → { monthlyCents, month: "YYYY-MM", committedCents }
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const KEY = "ai-invest:budget";
const eur = (c: number) => `€ ${Math.round(c / 100).toLocaleString("nl-NL")}`;
const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);

export interface InvestBudget {
  monthlyCents: number;
  month: string;
  committedCents: number;
}

export async function getBudget(): Promise<InvestBudget> {
  const b = (await kvGet<InvestBudget>(KEY)) ?? { monthlyCents: 0, month: monthOf(), committedCents: 0 };
  return b.month === monthOf() ? b : { ...b, month: monthOf(), committedCents: 0 };
}

export async function setMonthlyBudget(monthlyCents: number): Promise<InvestBudget> {
  const b = { ...(await getBudget()), monthlyCents: Math.max(0, Math.min(Math.round(monthlyCents), 10_000_000)) };
  await kvSet(KEY, b);
  return b;
}

/** Called when the owner approves an investment proposal: it becomes a task and is booked against the budget. */
export async function commitInvestment(title: string, budgetCents: number, firstStep: string): Promise<string> {
  const b = await getBudget();
  if (b.committedCents + budgetCents > b.monthlyCents) {
    return `past niet meer in het budget van deze maand (nog ${eur(Math.max(0, b.monthlyCents - b.committedCents))} over) — verhoog het budget of wacht tot volgende maand`;
  }
  await kvSet(KEY, { ...b, committedCents: b.committedCents + budgetCents });
  await addCustom(`💶 Investering goedgekeurd: ${title} — budget ${eur(budgetCents)}. Eerste stap: ${firstStep}`);
  return `staat op je takenlijst; ${eur(budgetCents)} gereserveerd (nog ${eur(b.monthlyCents - b.committedCents - budgetCents)} over deze maand)`;
}

interface Idea {
  title: string;
  why: string;
  budgetCents: number;
  expected: string;
  firstStep: string;
}

async function numbers(now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [fees, shifts, signups, freelancers, companies, cancels] = await Promise.all([
    prisma.invoice.aggregate({ where: { type: { in: ["PLATFORM_FEE", "UITZEND_FEE"] }, status: { in: ["ISSUED", "PAID"] }, issuedAt: { gte: since } }, _sum: { totalCents: true }, _count: true }),
    prisma.shift.findMany({ where: { startsAt: { gte: since, lte: now } }, select: { title: true, positions: true, branch: { select: { city: true } }, _count: { select: { assignments: { where: { cancelledAt: null } } } } }, take: 20_000 }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.membership.count({ where: { role: "FREELANCER", createdAt: { gte: since } } }),
    prisma.tenant.count({ where: { type: { not: "PLATFORM" }, createdAt: { gte: since } } }),
    prisma.shiftAssignment.count({ where: { cancelledAt: { gte: since } } }),
  ]);
  const byCat = new Map<string, { pos: number; filled: number; cities: Map<string, number> }>();
  for (const s of shifts) {
    const k = shiftCategory(s.title, null).label;
    const c = byCat.get(k) ?? { pos: 0, filled: 0, cities: new Map() };
    c.pos += s.positions;
    c.filled += Math.min(s.positions, s._count.assignments);
    c.cities.set(s.branch.city, (c.cities.get(s.branch.city) ?? 0) + s.positions - Math.min(s.positions, s._count.assignments));
    byCat.set(k, c);
  }
  const gaps = [...byCat.entries()]
    .filter(([, c]) => c.pos >= 5)
    .map(([cat, c]) => ({ cat, fill: c.filled / c.pos, open: c.pos - c.filled, city: [...c.cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "" }))
    .sort((a, b) => b.open - a.open);
  return { feeCents: fees._sum.totalCents ?? 0, invoices: fees._count, shiftCount: shifts.length, signups, freelancers, companies, cancels, gaps };
}

function ruleIdeas(n: Awaited<ReturnType<typeof numbers>>): Idea[] {
  const ideas: Idea[] = [];
  const gap = n.gaps[0];
  if (gap && gap.fill < 0.75) {
    ideas.push({
      title: `Flexkrachten werven voor ${gap.cat.toLowerCase()}${gap.city ? ` in ${gap.city}` : ""}`,
      why: `${gap.open} plekken bleven de afgelopen 30 dagen leeg (bezetting ${Math.round(gap.fill * 100)}%). Elke gevulde plek levert ongeveer € 3,50 per uur op.`,
      budgetCents: 25_000,
      expected: `bij ±40 extra aanmeldingen en 30% die gaat werken: ±${Math.round(gap.open * 0.3)} extra diensten per maand`,
      firstStep: `zet een gerichte Meta/TikTok-advertentie (18–35 jaar, 25 km rond ${gap.city || "de regio"}) naar /freelance-werk${gap.city ? `/${gap.city.toLowerCase().replace(/[^a-z]/g, "-")}` : ""}`,
    });
  }
  if (n.companies < 5) {
    ideas.push({
      title: "Meer bedrijven binnenhalen via de buitendienst",
      why: `Er kwamen deze maand maar ${n.companies} nieuwe bedrijven bij — zonder bedrijven geen klussen.`,
      budgetCents: 30_000,
      expected: "1 extra vaste klant met 20 uur per week ≈ € 280 platformfee per maand",
      firstStep: "laat de sales-autopilot 50 horeca- en logistiekbedrijven in 2 steden benaderen en boek 5 demo's",
    });
  }
  ideas.push({
    title: "Gesponsorde vacatures op Indeed voor de best betalende klussen",
    why: "De vacaturefeed geeft gratis bereik; een klein sponsorbudget zet de klussen bovenaan bij zoekers in de buurt.",
    budgetCents: 15_000,
    expected: "±€ 0,30–0,60 per klik; 300 klikken → ±30 aanmeldingen",
    firstStep: "meld /vacatures.xml aan bij Indeed en zet € 5 per dag op de 10 hoogst betaalde klussen",
  });
  if (n.cancels > 10) {
    ideas.push({
      title: "Bonus voor betrouwbare flexkrachten",
      why: `${n.cancels} afzeggingen in 30 dagen kosten bedrijven vertrouwen.`,
      budgetCents: 20_000,
      expected: "minder afzeggingen → hogere herboekingen bij dezelfde klanten",
      firstStep: "geef € 10 bonus na 5 klussen zonder afzegging (via de bestaande beloningen)",
    });
  }
  return ideas;
}

async function modelIdeas(n: Awaited<ReturnType<typeof numbers>>, budgetLeft: number): Promise<Idea[]> {
  const facts = [
    `Platformomzet (fees) laatste 30 dagen: ${eur(n.feeCents)} over ${n.invoices} facturen.`,
    `${n.shiftCount} klussen, ${n.signups} nieuwe accounts (${n.freelancers} freelancers, ${n.companies} bedrijven), ${n.cancels} afzeggingen.`,
    `Grootste tekorten: ${n.gaps.slice(0, 4).map((g) => `${g.cat} (${Math.round(g.fill * 100)}% bezet, ${g.open} lege plekken, vooral ${g.city})`).join("; ") || "geen data"}.`,
    `Budget dat deze maand nog vrij is: ${eur(budgetLeft)}.`,
  ].join("\n");
  const r = await chat({
    purpose: "ai-team-investeren",
    temperature: 0.5,
    maxTokens: 900,
    retry: false,
    timeoutMs: 90_000,
    messages: [
      {
        role: "system",
        content:
          "Je bent het investeringsteam van ZekerFlex (Nederlands flexwerkplatform; omzet = € 3,50 per gewerkt uur + uitzendmarge). Bedenk 3 concrete investeringen die binnen het vrije budget passen en aantoonbaar omzet of groei opleveren. Verzin geen cijfers buiten de gegeven feiten; maak aannames expliciet. Antwoord ALLEEN met JSON: [{\"title\":\"\",\"why\":\"\",\"budgetEur\":0,\"expected\":\"\",\"firstStep\":\"\"}]",
      },
      { role: "user", content: facts },
    ],
  });
  const json = r.text.slice(r.text.indexOf("["), r.text.lastIndexOf("]") + 1);
  const parsed = JSON.parse(json) as { title: string; why: string; budgetEur: number; expected: string; firstStep: string }[];
  return parsed
    .filter((x) => x.title && x.firstStep && Number.isFinite(x.budgetEur))
    .slice(0, 3)
    .map((x) => ({ title: x.title.slice(0, 120), why: x.why.slice(0, 400), budgetCents: Math.round(x.budgetEur * 100), expected: x.expected.slice(0, 200), firstStep: x.firstStep.slice(0, 300) }));
}

export async function investeren(now: Date, t: TeamTools) {
  const n = await numbers(now);
  const budget = await getBudget();
  const left = Math.max(0, budget.monthlyCents - budget.committedCents);
  await t.log("investeren", `Cijfers bekeken: ${eur(n.feeCents)} platformomzet in 30 dagen, ${n.signups} nieuwe accounts, grootste tekort: ${n.gaps[0] ? `${n.gaps[0].cat} (${n.gaps[0].open} lege plekken)` : "geen"}. Budget vrij deze maand: ${eur(left)}.`);
  if (budget.monthlyCents === 0) {
    await t.log("investeren", "Er is nog geen investeringsbudget ingesteld (Admin → AI-teams → budget). Ik doe voorstellen pas als er budget is.", "finding");
    return;
  }
  let ideas: Idea[] = [];
  if (!llmConfigProblem()) {
    ideas = await modelIdeas(n, left).catch(async (err) => {
      await t.log("investeren", `Taalmodel gaf geen bruikbaar antwoord (${(err as Error).message}); ik gebruik de vaste regels.`, "error");
      return [];
    });
  }
  if (!ideas.length) ideas = ruleIdeas(n);
  let made = 0;
  for (const idea of ideas) {
    if (idea.budgetCents <= 0 || idea.budgetCents > left) continue;
    await t.propose({
      team: "investeren",
      title: `${idea.title} — ${eur(idea.budgetCents)}`,
      detail: `${idea.why} Verwacht: ${idea.expected}. Eerste stap: ${idea.firstStep}.`,
      action: { type: "investment", title: idea.title, budgetCents: idea.budgetCents, firstStep: idea.firstStep },
    });
    made++;
  }
  await t.log("investeren", made ? `${made} investeringsvoorstel(len) klaargezet binnen het budget.` : "Geen voorstel past binnen het vrije budget.");
}
