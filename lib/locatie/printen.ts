import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";
import { knipRegel, type LabelInhoud, type LabelSoort, type PrintOpdracht, type PrintStatus } from "@/lib/locatie/modules";
import { locatieStand } from "@/lib/locatie/store";

// ---------------------------------------------------------------------------
// Badges en labels. Elke print is een opdracht in de wachtrij van het bedrijf;
// die wordt afgewerkt door (1) de browser (afdrukpagina op labelformaat of
// Bluetooth naar een bonprinter) of (2) de printagent op een computer op locatie
// (deploy/printen) die de wachtrij ophaalt en via CUPS print. In de KV:
//   print-wachtrij:<tenantId>     de opdrachten (laatste 400)
//   print-instellingen:<tenantId> badge bij inchecken aan/uit en welk sjabloon
//   print-agent:<tenantId>        de hash van het agenttoken, naam, laatst gezien
//   print-agent-token:<hash>      welk bedrijf bij een agenttoken hoort
// ---------------------------------------------------------------------------

const WACHTRIJ = (t: string) => `print-wachtrij:${t}`;
const INSTELLINGEN = (t: string) => `print-instellingen:${t}`;
const AGENT = (t: string) => `print-agent:${t}`;
const AGENT_TOKEN = (h: string) => `print-agent-token:${h}`;
const MAX_WACHTRIJ = 400;

const hashToken = (token: string) => createHash("sha256").update(`zf-printagent:${token}`).digest("hex");

export interface PrintInstellingen {
  /** bij elke check-in op locatie een label in de wachtrij */
  badgeBijInchecken: boolean;
  badgeSoort: LabelSoort;
  /** alleen op deze vestigingen; leeg = overal */
  branchIds: string[];
  /** onderaan elke badge, bijv. "Melden bij de receptie" */
  voet: string;
}

export interface PrintAgent {
  tokenHash: string;
  naam: string;
  sinds: string;
  laatstGezien?: string;
  printer?: string;
}

const STANDAARD: PrintInstellingen = { badgeBijInchecken: false, badgeSoort: "badge", branchIds: [], voet: "" };

export async function printInstellingen(tenantId: string): Promise<PrintInstellingen> {
  const s = await kvGet<Partial<PrintInstellingen>>(INSTELLINGEN(tenantId));
  return { ...STANDAARD, ...(s ?? {}), branchIds: Array.isArray(s?.branchIds) ? s.branchIds : [] };
}

export async function zetPrintInstellingen(tenantId: string, patch: { [K in keyof PrintInstellingen]?: PrintInstellingen[K] | undefined }): Promise<PrintInstellingen> {
  const huidig = await printInstellingen(tenantId);
  const nieuw: PrintInstellingen = {
    badgeBijInchecken: patch.badgeBijInchecken ?? huidig.badgeBijInchecken,
    badgeSoort: patch.badgeSoort ?? huidig.badgeSoort,
    branchIds: patch.branchIds ?? huidig.branchIds,
    voet: (patch.voet ?? huidig.voet).trim().slice(0, 60),
  };
  await kvSet(INSTELLINGEN(tenantId), nieuw);
  return nieuw;
}

/* ─────────────── de wachtrij ─────────────── */

async function lees(tenantId: string): Promise<PrintOpdracht[]> {
  return (await kvGet<PrintOpdracht[]>(WACHTRIJ(tenantId))) ?? [];
}

export async function wachtrij(tenantId: string, limit = 100, branchIds: string[] | null = null): Promise<PrintOpdracht[]> {
  const alles = await lees(tenantId);
  const gefilterd = branchIds ? alles.filter((o) => !o.branchId || branchIds.includes(o.branchId)) : alles;
  return gefilterd.slice(-limit).reverse();
}

export async function voegOpdrachtToe(
  tenantId: string,
  inhoud: LabelInhoud,
  info: { branchId?: string | undefined; door: string; doorNaam: string; bron: string },
): Promise<PrintOpdracht> {
  if (!inhoud.kop.trim()) throw AppError.validation("Het label heeft geen tekst.");
  const opdracht: PrintOpdracht = {
    id: randomBytes(6).toString("hex"),
    tenantId,
    inhoud: { ...inhoud, kop: knipRegel(inhoud.kop, 60), regels: inhoud.regels.map((r) => knipRegel(r, 80)).filter(Boolean).slice(0, 8) },
    status: "wacht",
    aangemaakt: new Date().toISOString(),
    door: info.door,
    doorNaam: info.doorNaam,
    bron: info.bron,
    ...(info.branchId ? { branchId: info.branchId } : {}),
  };
  const alles = await lees(tenantId);
  alles.push(opdracht);
  await kvSet(WACHTRIJ(tenantId), alles.length > MAX_WACHTRIJ ? alles.slice(alles.length - MAX_WACHTRIJ) : alles);
  return opdracht;
}

export async function zetOpdrachtStatus(tenantId: string, id: string, status: PrintStatus, extra: { printer?: string | undefined; fout?: string | undefined } = {}): Promise<PrintOpdracht> {
  const alles = await lees(tenantId);
  const i = alles.findIndex((o) => o.id === id);
  const huidig = alles[i];
  if (i < 0 || !huidig) throw AppError.notFound("Printopdracht niet gevonden.");
  const nieuw: PrintOpdracht = {
    ...huidig,
    status,
    ...(status === "geprint" ? { geprintOp: new Date().toISOString() } : {}),
    ...(extra.printer ? { printer: extra.printer.slice(0, 80) } : {}),
    ...(extra.fout ? { fout: extra.fout.slice(0, 300) } : {}),
  };
  alles[i] = nieuw;
  await kvSet(WACHTRIJ(tenantId), alles);
  return nieuw;
}

export async function opdracht(tenantId: string, id: string): Promise<PrintOpdracht | null> {
  return (await lees(tenantId)).find((o) => o.id === id) ?? null;
}

/** Wat de printagent moet afdrukken. */
export async function openOpdrachten(tenantId: string): Promise<PrintOpdracht[]> {
  return (await lees(tenantId)).filter((o) => o.status === "wacht");
}

/* ─────────────── de printagent ─────────────── */

export async function printAgent(tenantId: string): Promise<PrintAgent | null> {
  return kvGet<PrintAgent>(AGENT(tenantId));
}

/** Een (nieuw) token voor de printagent; het oude werkt daarna niet meer. Het token zie je één keer. */
export async function maakAgentToken(tenantId: string, naam: string): Promise<{ token: string; agent: PrintAgent }> {
  const oud = await printAgent(tenantId);
  if (oud?.tokenHash) await kvDelete(AGENT_TOKEN(oud.tokenHash));
  const token = `zfp_${randomBytes(24).toString("base64url")}`;
  const agent: PrintAgent = { tokenHash: hashToken(token), naam: naam.trim().slice(0, 60) || "Printer op locatie", sinds: new Date().toISOString() };
  await kvSet(AGENT(tenantId), agent);
  await kvSet(AGENT_TOKEN(agent.tokenHash), { tenantId });
  return { token, agent };
}

export async function verwijderAgent(tenantId: string): Promise<void> {
  const oud = await printAgent(tenantId);
  if (oud?.tokenHash) await kvDelete(AGENT_TOKEN(oud.tokenHash));
  await kvDelete(AGENT(tenantId));
}

/** Welk bedrijf hoort bij dit agenttoken? Noteert ook dat de agent leeft. */
export async function tenantVanAgentToken(token: string | null | undefined, printer?: string | null): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 120) return null;
  const hit = await kvGet<{ tenantId: string }>(AGENT_TOKEN(hashToken(token)));
  if (!hit) return null;
  const agent = await printAgent(hit.tenantId);
  if (!agent || agent.tokenHash !== hashToken(token)) return null;
  const nu = new Date().toISOString();
  if (!agent.laatstGezien || Date.parse(nu) - Date.parse(agent.laatstGezien) > 60_000 || (printer && agent.printer !== printer)) {
    await kvSet(AGENT(hit.tenantId), { ...agent, laatstGezien: nu, ...(printer ? { printer: printer.slice(0, 80) } : {}) });
  }
  return hit.tenantId;
}

export function agentStatus(a: PrintAgent | null, nu = Date.now()): "geen" | "nooit-gezien" | "online" | "offline" {
  if (!a) return "geen";
  if (!a.laatstGezien) return "nooit-gezien";
  return nu - Date.parse(a.laatstGezien) < 3 * 60_000 ? "online" : "offline";
}

/* ─────────────── badge bij het inchecken ─────────────── */

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "5 nov 2026, 09:05" in Nederlandse tijd. */
export function tijdTekst(d: Date | string): string {
  const p = amsterdamParts(new Date(d));
  return `${p.day} ${MAANDEN[p.month - 1] ?? ""} ${p.year}, ${amsterdamClock(d)}`;
}

/** De inhoud van een badge, naamsticker of incheckbon voor één persoon op één klus. */
export function badgeInhoud(input: { soort: LabelSoort; naam: string; bedrijf: string; vestiging: string; klus: string; tijd: Date | string; voet?: string | undefined; qr?: string | undefined }): LabelInhoud {
  const regels = input.soort === "naamsticker" ? [input.bedrijf] : [input.klus, `${input.bedrijf} · ${input.vestiging}`];
  return {
    soort: input.soort,
    kop: input.naam,
    regels: regels.filter(Boolean),
    tijd: tijdTekst(input.tijd),
    ...(input.voet ? { voet: input.voet } : {}),
    ...(input.qr ? { qr: input.qr } : {}),
  };
}

/**
 * Aangeroepen vanuit lib/timesheets/checkin.ts bij een CHECK_IN: staat de module
 * aan en wil het bedrijf een badge bij het inchecken, dan komt er een opdracht
 * in de wachtrij. Faalt stil (het inchecken zelf mag hier nooit op stuklopen).
 */
export async function badgeNaInchecken(ctx: { tenantId: string; branchId: string; timesheetId: string; userId: string }): Promise<void> {
  try {
    const stand = await locatieStand(ctx.tenantId);
    if (!stand.modules.printen?.aan) return;
    const instel = await printInstellingen(ctx.tenantId);
    if (!instel.badgeBijInchecken) return;
    if (instel.branchIds.length && !instel.branchIds.includes(ctx.branchId)) return;
    const ts = await prisma.timesheet.findUnique({
      where: { id: ctx.timesheetId },
      select: {
        branch: { select: { name: true, tenant: { select: { name: true } } } },
        assignment: { select: { shift: { select: { title: true } } } },
        freelancer: { select: { user: { select: { fullName: true } } } },
      },
    });
    if (!ts) return;
    const inhoud = badgeInhoud({
      soort: instel.badgeSoort,
      naam: ts.freelancer.user.fullName,
      bedrijf: ts.branch.tenant.name,
      vestiging: ts.branch.name,
      klus: ts.assignment.shift.title,
      tijd: new Date(),
      voet: instel.voet || undefined,
      qr: `ZF-INCHECK:${ctx.timesheetId}`,
    });
    await voegOpdrachtToe(ctx.tenantId, inhoud, { branchId: ctx.branchId, door: ctx.userId, doorNaam: ts.freelancer.user.fullName, bron: "inchecken" });
  } catch (e) {
    logger.warn("printen: badge bij inchecken mislukt", { message: e instanceof Error ? e.message : String(e) });
  }
}
