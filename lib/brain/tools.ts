import { prisma } from "@/lib/prisma";
import { hasRole, type Principal } from "@/lib/auth";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getMyWork } from "@/lib/dashboard/my-work";
import { getMarketplace } from "@/lib/dashboard/marketplace";
import { getEmployerOverview } from "@/lib/dashboard/employer";
import type { Audience } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// The brain's tools: READ-ONLY views of the asking user's OWN data, scoped by
// the same dashboard queries the screens use. A tool never writes, never
// takes an id from the model (it only knows "me"), so a prompt can't make the
// brain read someone else's data or do anything on the user's behalf.
// Each tool returns a plain-Dutch summary (used as-is when no model is
// connected) plus a link to the screen where the user can act.
// ---------------------------------------------------------------------------

export interface ToolResult {
  text: string;
  href?: string;
}

export interface BrainTool {
  name: string;
  description: string;
  roles: Audience[];
  run: (p: Principal) => Promise<ToolResult>;
}

export function roleOf(p: Principal): Audience {
  if (!p.grants.length) return "public"; // e.g. an API key without a user behind it
  if (hasRole(p, "PLATFORM_ADMIN")) return "admin";
  if (hasRole(p, "FREELANCER")) return "werknemer";
  return "opdrachtgever";
}

const eur = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;
const when = (d: Date) =>
  new Date(d).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
const time = (d: Date) => new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export const TOOLS: BrainTool[] = [
  // ── werknemer ──
  {
    name: "mijn_planning",
    description: "je komende ingeplande klussen (datum, tijd, plaats, tarief)",
    roles: ["werknemer"],
    run: async (p) => {
      const o = await getFreelancerOverview(p.userId);
      if (!o.upcoming.length) return { text: "Je hebt op dit moment geen klussen ingepland.", href: "/dashboard/klussen" };
      const lines = o.upcoming.slice(0, 5).map((s) => `• ${when(s.startsAt)}–${time(s.endsAt)}: ${s.title} bij ${s.branch}, ${s.city} (${eur(s.hourlyRateCents)}/uur)`);
      return { text: `Je volgende ${lines.length === 1 ? "klus" : `${lines.length} klussen`}:\n${lines.join("\n")}`, href: "/dashboard/diensten" };
    },
  },
  {
    name: "mijn_reacties",
    description: "klussen waarop je hebt gereageerd en nog wacht op antwoord",
    roles: ["werknemer"],
    run: async (p) => {
      const w = await getMyWork(p.userId);
      if (!w.pending.length) return { text: "Je wacht nergens op antwoord — er staan geen open reacties.", href: "/dashboard/klussen" };
      const lines = w.pending.slice(0, 5).map((i) => `• ${i.shift.title} bij ${i.clientName ?? i.shift.branch} op ${when(i.shift.startsAt)}${i.offerStatusLabel ? ` — ${i.offerStatusLabel}` : ""}`);
      return { text: `Je wacht nog op antwoord bij ${w.pending.length} klus(sen):\n${lines.join("\n")}`, href: "/dashboard/diensten" };
    },
  },
  {
    name: "mijn_uren",
    description: "uren die je nog moet invullen of die op goedkeuring wachten",
    roles: ["werknemer"],
    run: async (p) => {
      const w = await getMyWork(p.userId);
      const all = [...w.active, ...w.history];
      const now = Date.now();
      const todo = all.filter((i) => new Date(i.shift.endsAt).getTime() < now && i.status !== "cancelled" && i.status !== "rejected" && (!i.timesheetStatus || i.timesheetStatus === "DRAFT"));
      const waiting = all.filter((i) => i.timesheetStatus === "SUBMITTED");
      const disputed = all.filter((i) => i.timesheetStatus === "DISPUTED");
      const parts: string[] = [];
      if (todo.length) parts.push(`Nog in te vullen (${todo.length}):\n${todo.slice(0, 5).map((i) => `• ${i.shift.title} op ${when(i.shift.startsAt)}`).join("\n")}`);
      if (waiting.length) parts.push(`Ingediend, wacht op goedkeuring: ${waiting.length}.`);
      if (disputed.length) parts.push(`Met een correctievoorstel van de opdrachtgever: ${disputed.length} — bekijk en reageer onder Uren.`);
      return { text: parts.length ? parts.join("\n\n") : "Al je uren zijn ingevuld en afgehandeld. 👍", href: "/dashboard/uren" };
    },
  },
  {
    name: "mijn_geld",
    description: "wat je deze maand verdiend hebt, wat nog uitbetaald wordt en je laatste uitbetalingen",
    roles: ["werknemer"],
    run: async (p) => {
      const o = await getFreelancerOverview(p.userId);
      const last = o.payouts.slice(0, 3).map((x) => `• ${x.number}: ${eur(x.totalCents)} — ${x.settledAt ? `betaald ${new Date(x.settledAt).toLocaleDateString("nl-NL")}` : x.status.toLowerCase()}`);
      return {
        text: `Verdiend deze maand: ${eur(o.kpis.earnedThisMonthCents)}. Nog uit te betalen: ${eur(o.kpis.pendingPayoutCents)}.${last.length ? `\nLaatste uitbetalingen:\n${last.join("\n")}` : ""}`,
        href: "/dashboard/uitbetalingen",
      };
    },
  },
  {
    name: "mijn_account_status",
    description: "wat er nog moet gebeuren aan je account (verificatie, gegevens, documenten) en je betrouwbaarheid",
    roles: ["werknemer"],
    run: async (p) => {
      const [o, user] = await Promise.all([getFreelancerOverview(p.userId), prisma.user.findUnique({ where: { id: p.userId }, select: { kycStatus: true } })]);
      const open = o.onboarding.filter((s) => !s.done).map((s) => `• ${s.label}`);
      const kyc = user?.kycStatus === "VERIFIED" ? "Je identiteit is geverifieerd." : user?.kycStatus === "PENDING" ? "Je verificatie wordt nog gecontroleerd." : "Je identiteit is nog niet geverifieerd.";
      return {
        text: `${kyc}${open.length ? `\nNog te doen:\n${open.join("\n")}` : "\nJe account is compleet."}\nBetrouwbaarheid: ${Math.round(o.reliabilityScore * 100)}% · ${o.shiftsCompleted} klussen gedaan.`,
        href: open.length ? "/dashboard/verificatie" : "/dashboard/profiel",
      };
    },
  },
  {
    name: "klussen_voor_mij",
    description: "open klussen die nu het best bij je passen",
    roles: ["werknemer"],
    run: async (p) => {
      const m = await getMarketplace(p.userId);
      const open = m.shifts.filter((s) => s.taken < s.positions && !s.myOffer).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0)).slice(0, 5);
      if (!open.length) return { text: "Er staan nu geen open klussen voor je klaar. Zet je beschikbaarheid aan, dan krijg je een melding bij nieuwe klussen.", href: "/dashboard/beschikbaarheid" };
      const lines = open.map((s) => `• ${s.title} — ${s.city}, ${when(s.startsAt)}, ${eur(s.hourlyRateCents)}/uur${s.travel ? `, ±${Math.round(s.match?.travelMinutes ?? 0)} min reizen` : ""}`);
      return { text: `${m.canApply ? "" : `Let op: ${m.blockReason ?? "je kunt nog niet reageren"}.\n`}Passende open klussen:\n${lines.join("\n")}`, href: "/dashboard/klussen" };
    },
  },
  // ── opdrachtgever ──
  {
    name: "bedrijf_overzicht",
    description: "open klussen, uren om goed te keuren, uitgaven deze maand en actieve werknemers",
    roles: ["opdrachtgever"],
    run: async (p) => {
      const o = await getEmployerOverview(p);
      return {
        text: `Open klussen: ${o.kpis.openShifts} · Uren goed te keuren: ${o.kpis.toApprove} · Uitgegeven deze maand: ${eur(o.kpis.spentThisMonthCents)} · Actieve werknemers: ${o.kpis.activeFreelancers}.`,
        href: "/werkgever",
      };
    },
  },
  {
    name: "onbezette_klussen",
    description: "komende klussen waar nog plekken open zijn",
    roles: ["opdrachtgever"],
    run: async (p) => {
      const o = await getEmployerOverview(p);
      const now = Date.now();
      const gaps = o.shifts.filter((s) => s.filled < s.positions && new Date(s.startsAt).getTime() > now).slice(0, 6);
      if (!gaps.length) return { text: "Al je komende klussen zijn bezet.", href: "/werkgever/diensten" };
      return {
        text: `Nog niet (helemaal) bezet:\n${gaps.map((s) => `• ${s.title} (${s.branch}) ${when(s.startsAt)} — ${s.filled}/${s.positions} bezet`).join("\n")}\nOpen een klus om reacties te bekijken en iemand in te plannen.`,
        href: "/werkgever/diensten",
      };
    },
  },
  {
    name: "uren_goedkeuren",
    description: "ingediende uren die op jouw goedkeuring wachten",
    roles: ["opdrachtgever"],
    run: async (p) => {
      const o = await getEmployerOverview(p);
      if (!o.approvals.length) return { text: "Er wachten geen uren op goedkeuring.", href: "/werkgever/uren" };
      return {
        text: `${o.approvals.length} uren wachten op je goedkeuring:\n${o.approvals.slice(0, 6).map((a) => `• ${a.freelancer} — ${a.branch}, ${when(a.scheduledStart)}, ${(a.billableMinutes / 60).toFixed(1).replace(".", ",")} uur`).join("\n")}`,
        href: "/werkgever/uren",
      };
    },
  },
  {
    name: "facturen",
    description: "je recente en openstaande facturen",
    roles: ["opdrachtgever"],
    run: async (p) => {
      const o = await getEmployerOverview(p);
      const open = o.invoices.filter((i) => i.status === "ISSUED");
      return {
        text: o.invoices.length
          ? `${open.length} openstaand van je laatste ${o.invoices.length} facturen:\n${o.invoices.slice(0, 5).map((i) => `• ${i.number}: ${eur(i.totalCents)} — ${i.status.toLowerCase()}`).join("\n")}`
          : "Je hebt nog geen facturen.",
        href: "/werkgever/facturen",
      };
    },
  },
  // ── admin ──
  {
    name: "platform_cijfers",
    description: "kerncijfers van het platform: gebruikers, open klussen, verificaties in de wacht",
    roles: ["admin"],
    run: async () => {
      const now = new Date();
      const [users, open, kyc] = await Promise.all([
        prisma.user.count({ where: { disabledAt: null } }),
        prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now } } }),
        prisma.user.count({ where: { kycStatus: "PENDING" } }),
      ]);
      return { text: `Actieve gebruikers: ${users} · Open komende klussen: ${open} · Verificaties te beoordelen: ${kyc}.`, href: "/admin" };
    },
  },
];

export function toolsFor(role: Audience): BrainTool[] {
  return TOOLS.filter((t) => t.roles.includes(role));
}

/** Run tools by name, but only those this role may use; failures become a short note instead of an error. */
export async function runTools(p: Principal, names: string[]): Promise<{ name: string; result: ToolResult }[]> {
  const allowed = toolsFor(roleOf(p));
  const picked = [...new Set(names)].map((n) => allowed.find((t) => t.name === n)).filter((t): t is BrainTool => Boolean(t)).slice(0, 3);
  return Promise.all(
    picked.map(async (t) => {
      try {
        return { name: t.name, result: await t.run(p) };
      } catch {
        return { name: t.name, result: { text: "Deze gegevens kon ik nu even niet ophalen." } };
      }
    }),
  );
}
