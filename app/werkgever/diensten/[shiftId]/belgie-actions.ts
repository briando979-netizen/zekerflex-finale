"use server";

import { revalidatePath } from "next/cache";
import { hasRole, requirePrincipal, requireRole, type Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recordAudit } from "@/lib/audit";
import { getDict } from "@/lib/i18n/server";
import { nl as nlDict, type Dict } from "@/lib/i18n/dictionaries";
import {
  DIMONA_TYPE,
  isBekendVinkje,
  isBelgischContract,
  isBelgischeKlus,
  leesDimonaNummer,
  metSoort,
  metVinkje,
  type BelgieActieUitslag,
} from "@/lib/belgie/klus-kern";
import { bewaarBelgieKlus, leesBelgieKlusVoor, zetDimonaNummer } from "@/lib/belgie/klus";

// ---------------------------------------------------------------------------
// De acties van het paneel "Klus in België" op de kluspagina van het bedrijf (components/werkgever/BelgieKlusPaneel.tsx, 28 nov
// 2026): het soort contract, de bevestiging dat het bedrijf de werkgever is en de Dimona doet, de vinkjes van de checklist en
// (niet verplicht) het Dimona-nummer per gekozen werker. Elke actie controleert zelf of de klus van dit bedrijf is en in België
// ligt, en geeft de stand van de server terug. Nooit een rijksregisternummer (lib/belgie/klus-kern.ts → leesDimonaNummer).
// ---------------------------------------------------------------------------

type Rol = "LOCAL_MANAGER" | "HQ_ADMIN" | "PLATFORM_ADMIN";

async function teksten(): Promise<Dict["belgie"]> {
  return (await getDict().catch(() => nlDict)).belgie;
}

/** De klus van dit bedrijf, alleen als hij in België ligt; anders een melding. */
async function eigenBelgischeKlus(
  shiftId: string,
  rollen: Rol[],
): Promise<{ principal: Principal; shift: { id: string; title: string; tenantId: string; werkers: string[] } } | { fout: string }> {
  const b = await teksten();
  const principal = await requirePrincipal();
  requireRole(principal, ...rollen);
  const scope = await resolveEmployerScope(principal);
  const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const shift = await prisma.shift.findFirst({
    where: { AND: [{ id: shiftId }, { branch: scopeWhere }] },
    select: {
      id: true,
      title: true,
      branch: { select: { postalCode: true, tenantId: true } },
      assignments: { where: { cancelledAt: null }, select: { freelancer: { select: { userId: true } } } },
    },
  });
  if (!shift) return { fout: b.nietGevonden };
  if (!isBelgischeKlus(shift.branch.postalCode)) return { fout: b.nietBelgisch };
  return {
    principal,
    shift: { id: shift.id, title: shift.title, tenantId: shift.branch.tenantId, werkers: shift.assignments.map((a) => a.freelancer.userId) },
  };
}

function fout(err: unknown, b: Dict["belgie"]): BelgieActieUitslag {
  return { ok: false, message: err instanceof AppError ? err.message : b.mislukt };
}

/** Het soort contract kiezen of wijzigen; vast zodra er iemand gekozen is (dan hoort de Dimona al bij die soort). */
export async function zetBelgieSoortAction(shiftId: string, soort: string, horeca: boolean): Promise<BelgieActieUitslag> {
  const b = await teksten();
  try {
    const r = await eigenBelgischeKlus(shiftId, ["LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN"]);
    if ("fout" in r) return { ok: false, message: r.fout };
    if (!isBelgischContract(soort)) return { ok: false, message: b.kiesSoort };
    const oud = await leesBelgieKlusVoor(shiftId);
    if (r.shift.werkers.length > 0 && oud.soort && oud.soort !== soort) return { ok: false, message: b.soortVast, klus: oud };
    const klus = metSoort(oud, soort, horeca);
    await bewaarBelgieKlus(shiftId, klus);
    await recordAudit({
      category: "MATCHING",
      action: "belgie.soort",
      actorUserId: r.principal.userId,
      actorLabel: "user",
      summary: `Klus in België "${r.shift.title}": soort contract ${soort}${klus.horeca ? " (horeca)" : ""}`,
      targetType: "shift",
      targetId: shiftId,
      metadata: { tenantId: r.shift.tenantId, soort, horeca: klus.horeca },
    });
    revalidatePath(`/werkgever/diensten/${shiftId}`);
    return { ok: true, message: "", klus };
  } catch (err) {
    return fout(err, b);
  }
}

/**
 * De eigen stap vóór het kiezen: het bedrijf bevestigt dat het de werkgever is van elke werker die het voor deze klus kiest en
 * dat het de Dimona (STU of FLX) doet. Alleen het bedrijf zelf, niet het beheer van ZekerFlex. Met een regel in het auditspoor.
 */
export async function bevestigBelgieWerkgeverAction(shiftId: string): Promise<BelgieActieUitslag> {
  const b = await teksten();
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN")) return { ok: false, message: b.alleenBedrijf };
    const r = await eigenBelgischeKlus(shiftId, ["LOCAL_MANAGER", "HQ_ADMIN"]);
    if ("fout" in r) return { ok: false, message: r.fout };
    const oud = await leesBelgieKlusVoor(shiftId);
    if (!oud.soort) return { ok: false, message: b.eerstSoort, klus: oud };
    if (oud.bevestiging) return { ok: true, message: "", klus: oud };
    const dimona = DIMONA_TYPE[oud.soort];
    const klus = { ...oud, bevestiging: { door: r.principal.userId, op: new Date().toISOString(), dimona } };
    await bewaarBelgieKlus(shiftId, klus);
    await recordAudit({
      category: "MATCHING",
      action: "belgie.werkgever-bevestigd",
      actorUserId: r.principal.userId,
      actorLabel: "user",
      summary: `Klus in België "${r.shift.title}": het bedrijf bevestigt dat het de werkgever is en de Dimona ${dimona} doet`,
      targetType: "shift",
      targetId: shiftId,
      metadata: { tenantId: r.shift.tenantId, soort: oud.soort, dimona },
    });
    revalidatePath(`/werkgever/diensten/${shiftId}`);
    return { ok: true, message: "", klus };
  } catch (err) {
    return fout(err, b);
  }
}

/** Een stap van de checklist aan- of uitvinken (alleen voor het bedrijf zelf; ZekerFlex controleert niets). */
export async function zetBelgieVinkjeAction(shiftId: string, vinkje: string, aan: boolean): Promise<BelgieActieUitslag> {
  const b = await teksten();
  try {
    const r = await eigenBelgischeKlus(shiftId, ["LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN"]);
    if ("fout" in r) return { ok: false, message: r.fout };
    const oud = await leesBelgieKlusVoor(shiftId);
    if (!isBekendVinkje(vinkje) || !oud.soort) return { ok: false, message: b.mislukt, klus: oud };
    const klus = metVinkje(oud, vinkje, aan);
    await bewaarBelgieKlus(shiftId, klus);
    revalidatePath(`/werkgever/diensten/${shiftId}`);
    return { ok: true, message: "", klus };
  } catch (err) {
    return fout(err, b);
  }
}

/**
 * Het Dimona-bevestigingsnummer van een gekozen werker bewaren (leeg = wissen). Niet verplicht. Een invoer die op een
 * rijksregisternummer lijkt, wordt geweigerd en nergens bewaard of gelogd; het nummer zelf komt ook niet in het auditspoor.
 */
export async function zetBelgieDimonaAction(shiftId: string, werkerUserId: string, invoer: string): Promise<BelgieActieUitslag> {
  const b = await teksten();
  try {
    const r = await eigenBelgischeKlus(shiftId, ["LOCAL_MANAGER", "HQ_ADMIN"]);
    if ("fout" in r) return { ok: false, message: r.fout };
    if (!r.shift.werkers.includes(werkerUserId)) return { ok: false, message: b.nietGevonden };
    if (!invoer.trim()) {
      await zetDimonaNummer(shiftId, werkerUserId, null, r.principal.userId);
      revalidatePath(`/werkgever/diensten/${shiftId}`);
      return { ok: true, message: "", dimona: null };
    }
    const gelezen = leesDimonaNummer(invoer.slice(0, 60));
    if (!gelezen.ok) {
      return { ok: false, message: gelezen.reden === "rijksregister" ? b.dimonaRijksregister : gelezen.reden === "leeg" ? b.dimonaLeeg : b.dimonaVorm };
    }
    await zetDimonaNummer(shiftId, werkerUserId, gelezen.nummer, r.principal.userId);
    await recordAudit({
      category: "MATCHING",
      action: "belgie.dimona",
      actorUserId: r.principal.userId,
      actorLabel: "user",
      summary: `Klus in België "${r.shift.title}": Dimona-nummer ingevuld voor een werker`,
      targetType: "shift",
      targetId: shiftId,
      metadata: { tenantId: r.shift.tenantId, werkerUserId },
    });
    revalidatePath(`/werkgever/diensten/${shiftId}`);
    return { ok: true, message: b.dimonaOpgeslagen, dimona: gelezen.nummer };
  } catch (err) {
    return fout(err, b);
  }
}
