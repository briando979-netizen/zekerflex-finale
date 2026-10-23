import { prisma } from "@/lib/prisma";
import { principalForUser } from "@/lib/auth";
import { sendUserPush } from "@/lib/notifications/push";
import { runMatchingForShift } from "@/lib/matching/engine";
import { approveTimesheet } from "@/lib/timesheets/approve";
import { fraudForTimesheet } from "@/lib/fraud/timesheet";
import { chat, llmConfigProblem } from "@/lib/ai/client";
import { knowledgePack } from "@/lib/rag/cag";
import { alreadyDone, getTenantAutopilot, markDone, optedInTenants } from "@/lib/autopilot/store";

// ---------------------------------------------------------------------------
// What the autopilot does by itself. Two kinds:
//
//   auto     reversible work inside ZekerFlex — reminders, re-matching,
//            warnings, maintenance, reports. Runs without asking.
//   consent  moves money or decides for someone else (approving hours →
//            invoice + payout). Runs ONLY for organisations whose employer
//            switched it on themselves, with that employer's own rights and
//            strict rules; everything that doesn't fit the rules is left for
//            a human.
//
// Each action is idempotent per target (ledger in lib/autopilot/store.ts) and
// capped per run, so a bug can never flood people.
// ---------------------------------------------------------------------------

export type Tier = "auto" | "consent";

export interface ActionResult {
  count: number;
  summary: string;
  details?: string[];
}

export interface AutopilotAction {
  key: string;
  label: string;
  description: string;
  tier: Tier;
  cap: number;
  run: (now: Date) => Promise<ActionResult>;
}

const H = 3_600_000;
const timeFmt = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

async function employerUsers(tenantId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { tenantId, role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] }, user: { disabledAt: null } }, select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

async function platformAdmins(): Promise<string[]> {
  const rows = await prisma.membership.findMany({ where: { role: "PLATFORM_ADMIN", user: { disabledAt: null } }, select: { userId: true } });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Short AI line when a model is connected; the rule text otherwise. */
async function aiLine(purposeText: string, fallback: string): Promise<string> {
  if (llmConfigProblem()) return fallback;
  try {
    const r = await chat({
      purpose: "autopilot",
      temperature: 0.4,
      maxTokens: 90,
      retry: false,
      timeoutMs: 15_000,
      messages: [
        { role: "system", content: "Je schrijft één korte, vriendelijke, concrete zin (max 25 woorden, Nederlands) voor een melding op het flexwerkplatform ZekerFlex. Verzin geen bedragen of feiten." },
        { role: "user", content: purposeText },
      ],
    });
    const t = r.text.trim().replace(/^"|"$/g, "");
    return t && t.length < 220 ? t : fallback;
  } catch {
    return fallback;
  }
}

export const ACTIONS: AutopilotAction[] = [
  {
    key: "collusie-signalen",
    label: "Collusie-/witwassignalen",
    description: "Zoekt opdrachtgever↔werknemer-paren die samen geld kunnen rondpompen (nepdiensten, direct goedkeuren, uitbetalen) en waarschuwt de beheerders per nieuw hoog-risicopaar.",
    tier: "auto",
    cap: 20,
    run: async () => {
      const { analyseCollusion } = await import("@/lib/fraud/collusion");
      const { alertOwner } = await import("@/lib/ops/alert");
      const pairs = (await analyseCollusion({ sinceDays: 90, minScore: 60 })).slice(0, 20);
      const ids = pairs.map((p) => `${p.tenantId}:${p.freelancerId}`);
      const done = await alreadyDone("collusie-signalen", ids);
      const fresh = pairs.filter((p) => !done.has(`${p.tenantId}:${p.freelancerId}`));
      for (const p of fresh) {
        await alertOwner({
          key: `collusie:${p.tenantId}:${p.freelancerId}`,
          title: `Mogelijk collusie: ${p.bedrijf} ↔ ${p.werknemer}`,
          detail: `Risicoscore ${p.score}. ${p.signalen.map((s) => s.label).join("; ")}. Bekijk in Admin → Fraude.`,
          severity: "warning",
          url: "/admin/fraude",
        }).catch(() => undefined);
      }
      await markDone("collusie-signalen", fresh.map((p) => `${p.tenantId}:${p.freelancerId}`));
      return { count: fresh.length, summary: `${pairs.length} verdacht(e) paar/paren, ${fresh.length} nieuw gemeld`, details: pairs.slice(0, 10).map((p) => `${p.bedrijf} ↔ ${p.werknemer} (score ${p.score})`) };
    },
  },
  {
    key: "uren-invullen",
    label: "Werknemers herinneren aan uren invullen",
    description: "Klus 6–72 uur geleden afgelopen en nog geen uren ingediend → pushmelding aan de werknemer (één keer per klus).",
    tier: "auto",
    cap: 300,
    run: async (now) => {
      const rows = await prisma.shiftAssignment.findMany({
        where: {
          cancelledAt: null,
          shift: { endsAt: { gte: new Date(now.getTime() - 72 * H), lte: new Date(now.getTime() - 6 * H) } },
          OR: [{ timesheet: null }, { timesheet: { status: "DRAFT" } }],
        },
        select: { id: true, freelancer: { select: { userId: true } }, shift: { select: { id: true, title: true, startsAt: true, branch: { select: { name: true } } } } },
        take: 600,
      });
      const done = await alreadyDone("uren-invullen", rows.map((r) => r.id));
      const todo = rows.filter((r) => !done.has(r.id)).slice(0, 300);
      for (const r of todo) {
        await sendUserPush([r.freelancer.userId], {
          title: "🕒 Vul je uren in",
          body: `${r.shift.title} bij ${r.shift.branch.name} (${timeFmt.format(r.shift.startsAt)}) — dien je uren in, dan kan de uitbetaling starten.`,
          data: { type: "TIMESHEET", url: "/dashboard/uren", tag: `uren-${r.id}` },
          ttlSeconds: 86_400,
        }).catch(() => 0);
      }
      await markDone("uren-invullen", todo.map((r) => r.id));
      return { count: todo.length, summary: `${todo.length} werknemer(s) herinnerd aan uren invullen` };
    },
  },
  {
    key: "uren-goedkeuren-herinnering",
    label: "Opdrachtgevers herinneren aan uren goedkeuren",
    description: "Uren langer dan 24 uur ingediend → één melding per organisatie per dag aan de beheerders.",
    tier: "auto",
    cap: 200,
    run: async (now) => {
      const rows = await prisma.timesheet.findMany({
        where: { status: "SUBMITTED", submittedAt: { lte: new Date(now.getTime() - 24 * H) } },
        select: { id: true, branch: { select: { tenantId: true } } },
        take: 2000,
      });
      const byTenant = new Map<string, number>();
      for (const r of rows) byTenant.set(r.branch.tenantId, (byTenant.get(r.branch.tenantId) ?? 0) + 1);
      const day = now.toISOString().slice(0, 10);
      const keys = [...byTenant.keys()].map((t) => `${t}:${day}`);
      const done = await alreadyDone("uren-goedkeuren-herinnering", keys);
      let sent = 0;
      for (const [tenantId, n] of byTenant) {
        if (done.has(`${tenantId}:${day}`) || sent >= 200) continue;
        await sendUserPush(await employerUsers(tenantId), {
          title: "⏳ Uren wachten op je goedkeuring",
          body: `${n} ingediende uren wachten al langer dan een dag. Keur ze goed zodat je werknemers betaald worden.`,
          data: { type: "TIMESHEET", url: "/werkgever/uren", tag: `approve-${day}` },
          ttlSeconds: 43_200,
        }).catch(() => 0);
        sent++;
      }
      await markDone("uren-goedkeuren-herinnering", keys.filter((k) => !done.has(k)));
      return { count: sent, summary: `${sent} organisatie(s) herinnerd aan ${rows.length} openstaande uren` };
    },
  },
  {
    key: "onbezette-klussen",
    label: "Onbezette klussen redden",
    description: "Klus binnen 48 uur met open plekken → matching opnieuw draaien (nieuwe kandidaten krijgen een aanbod) en de opdrachtgever één keer waarschuwen met een tip.",
    tier: "auto",
    cap: 60,
    run: async (now) => {
      const shifts = await prisma.shift.findMany({
        where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now, lte: new Date(now.getTime() + 48 * H) } },
        select: { id: true, title: true, positions: true, startsAt: true, hourlyRateCents: true, visibility: true, branch: { select: { tenantId: true, name: true } }, assignments: { where: { cancelledAt: null }, select: { id: true } } },
        orderBy: { startsAt: "asc" },
        take: 200,
      });
      const open = shifts.filter((s) => s.assignments.length < s.positions).slice(0, 60);
      const done = await alreadyDone("onbezette-klussen", open.map((s) => s.id));
      const details: string[] = [];
      let rematched = 0;
      for (const s of open) {
        try {
          const r = await runMatchingForShift(s.id);
          rematched++;
          details.push(`${s.title}: ${r.eligible} geschikt, ${r.notified} nieuw benaderd, ${r.autoAssigned} direct ingepland`);
        } catch {
          /* already running / not matchable — fine */
        }
        if (done.has(s.id)) continue;
        const left = s.positions - s.assignments.length;
        const tip = await aiLine(
          `Klus "${s.title}" bij ${s.branch.name} start ${timeFmt.format(s.startsAt)} en heeft nog ${left} open plek(ken). Uurtarief €${(s.hourlyRateCents / 100).toFixed(2)}. ${s.visibility === "POOL_ONLY" ? "Staat alleen open voor de eigen pool." : ""} Geef één tip om de klus sneller vol te krijgen.`,
          s.visibility === "POOL_ONLY" ? "Tip: open de klus voor alle werknemers, dan reageren er meer mensen." : "Tip: een iets hoger uurtarief of een duidelijke omschrijving helpt om de klus snel vol te krijgen.",
        );
        await sendUserPush(await employerUsers(s.branch.tenantId), {
          title: `⚠️ Nog ${left} plek(ken) open`,
          body: `${s.title} — ${timeFmt.format(s.startsAt)}. ${tip}`,
          data: { type: "SHIFT", url: `/werkgever/diensten/${s.id}`, tag: `unfilled-${s.id}` },
          ttlSeconds: 43_200,
        }).catch(() => 0);
      }
      await markDone("onbezette-klussen", open.filter((s) => !done.has(s.id)).map((s) => s.id));
      return { count: open.length, summary: `${open.length} onbezette klus(sen) binnen 48 uur, ${rematched} opnieuw gematcht`, details: details.slice(0, 20) };
    },
  },
  {
    key: "uren-auto-goedkeuren",
    label: "Uren automatisch goedkeuren (alleen met toestemming)",
    description:
      "Alleen bij organisaties die dit zelf aanzetten (Werkgever → Uren). Na 24 uur, als werktijd binnen 15 min van de planning ligt, niet meer uren dan gepland, geen fraudesignalen en geldige GPS-check-in → goedkeuren met de rechten van de beheerder die het aanzette. Al het andere blijft voor een mens.",
    tier: "consent",
    cap: 100,
    run: async (now) => {
      const tenants = await optedInTenants();
      let approved = 0;
      let skipped = 0;
      const details: string[] = [];
      for (const tenantId of tenants) {
        const cfg = await getTenantAutopilot(tenantId);
        if (!cfg.autoApproveHours || !cfg.byUserId) continue;
        const principal = await principalForUser(cfg.byUserId);
        if (!principal || !principal.grants.some((g) => g.organizationId === tenantId && (g.role === "HQ_ADMIN" || g.role === "LOCAL_MANAGER"))) {
          details.push(`${tenantId}: beheerder heeft geen rechten meer — overgeslagen`);
          continue;
        }
        const rows = await prisma.timesheet.findMany({
          where: { status: "SUBMITTED", branch: { tenantId }, submittedAt: { lte: new Date(now.getTime() - 24 * H) } },
          select: { id: true, scheduledStart: true, scheduledEnd: true, actualStart: true, actualEnd: true, breakMinutes: true, billableMinutes: true },
          take: 100,
        });
        for (const t of rows) {
          if (approved >= 100) break;
          const tol = 15 * 60_000;
          const plannedMin = Math.round((t.scheduledEnd.getTime() - t.scheduledStart.getTime()) / 60_000);
          const fits =
            t.actualStart &&
            t.actualEnd &&
            Math.abs(t.actualStart.getTime() - t.scheduledStart.getTime()) <= tol &&
            Math.abs(t.actualEnd.getTime() - t.scheduledEnd.getTime()) <= tol &&
            t.billableMinutes <= plannedMin;
          if (!fits) {
            skipped++;
            continue;
          }
          const flags = await fraudForTimesheet(t.id).catch(() => [{ severity: "critical" as const, code: "x", message: "check mislukt" }]);
          if (flags.some((f) => f.severity !== "info")) {
            skipped++;
            continue;
          }
          try {
            await approveTimesheet({ timesheetId: t.id, principal }); // no GPS override: a missing check-in stays for a human
            approved++;
          } catch (err) {
            skipped++;
            details.push(`${t.id}: ${(err as Error).message.slice(0, 80)}`);
          }
        }
      }
      return { count: approved, summary: `${approved} uren automatisch goedgekeurd bij ${tenants.length} organisatie(s) met toestemming, ${skipped} overgelaten aan een mens`, details: details.slice(0, 20) };
    },
  },
  {
    key: "kennis-onderhoud",
    label: "Brein-onderhoud",
    description: "Kennispakketten (CAG) per rol voorbereiden zodat het eerste antwoord van de dag snel is.",
    tier: "auto",
    cap: 1,
    run: async () => {
      const roles = ["public", "werknemer", "opdrachtgever", "admin"] as const;
      const sizes = roles.map((r) => `${r}: ${knowledgePack(r).passages}`);
      return { count: roles.length, summary: `Kennispakketten klaar (${sizes.join(", ")})` };
    },
  },
  {
    key: "admin-dagrapport",
    label: "Dagrapport voor admin",
    description: "Wat vraagt aandacht: verificaties in de wacht, onbezette klussen, uren die blijven liggen, mislukte betalingen. Push naar platformbeheerders als er iets is.",
    tier: "auto",
    cap: 1,
    run: async (now) => {
      const [kyc, unfilled, stale, failed] = await Promise.all([
        prisma.user.count({ where: { kycStatus: "PENDING", disabledAt: null } }),
        prisma.shift.count({ where: { status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] }, startsAt: { gt: now, lte: new Date(now.getTime() + 48 * H) } } }),
        prisma.timesheet.count({ where: { status: "SUBMITTED", submittedAt: { lte: new Date(now.getTime() - 72 * H) } } }),
        prisma.payment.count({ where: { status: "FAILED", createdAt: { gte: new Date(now.getTime() - 7 * 24 * H) } } }).catch(() => 0),
      ]);
      const items = [
        kyc ? `${kyc} verificatie(s) te beoordelen` : "",
        unfilled ? `${unfilled} klus(sen) binnen 48u niet vol` : "",
        stale ? `${stale} uren >3 dagen niet goedgekeurd` : "",
        failed ? `${failed} mislukte betaling(en) deze week` : "",
      ].filter(Boolean);
      const day = now.toISOString().slice(0, 10);
      const done = await alreadyDone("admin-dagrapport", [day]);
      if (items.length && !done.has(day)) {
        const line = await aiLine(`Vat voor de platformbeheerder samen wat vandaag aandacht vraagt: ${items.join("; ")}.`, items.join(" · "));
        await sendUserPush(await platformAdmins(), {
          title: "📋 ZekerFlex-dagrapport",
          body: line,
          data: { type: "ADMIN", url: kyc ? "/admin/gebruikers" : "/admin", tag: `dagrapport-${day}` },
          ttlSeconds: 43_200,
        }).catch(() => 0);
        await markDone("admin-dagrapport", [day]);
      }
      return { count: items.length, summary: items.length ? items.join(" · ") : "Niets dat aandacht vraagt", details: items };
    },
  },
];
