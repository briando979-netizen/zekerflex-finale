import { eisOnboardingVoorReageren } from "@/lib/onboarding/werker-poort-server";
import { isTenantVerified } from "@/lib/company/verified";
import { MatchStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { haversineMeters } from "@/lib/geo/geofencing";
import { recordOfferResponse } from "@/lib/notifications/dispatcher";
import { isBlockedByAny } from "@/lib/employer/relations";
import { eisProefklusInSlot, payoutEligibility } from "@/lib/fiscal/eligibility";
import { werkerNietKlaarFout } from "@/lib/fiscal/werker-niet-klaar";
import { isInvitedToPoolOnlyShift } from "@/lib/pools/store";
import { findOverlappingShift, overlapMessageSelf, overlapParams } from "@/lib/shifts/worker-overlap";
import { isTestklus } from "@/lib/shifts/testklus";
import { isEigenTestKlus } from "@/lib/admin/eigen-test-kern";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { klusToegang } from "@/lib/admin/eigen-test-zicht";
import { isTestwerker } from "@/lib/testwerker/adres";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { dienstUren, pastBinnenMaxUren, urenBijBedrijf } from "@/lib/werkgever/max-uren";
import { isUitzendPartnerTenant } from "@/lib/uitzend/partners";
import { leggReactieVast, sluitEigenReactie } from "@/lib/matching/reactie";
import { belgieKiesReden, isBelgischeKlus } from "@/lib/belgie/klus-kern";
import { leesBelgieKlusVoor } from "@/lib/belgie/klus";

// ---------------------------------------------------------------------------
// Marketplace self-apply: a verified freelancer browses OPEN shifts and takes
// one directly. We synthesise the ShiftMatch the dispatcher would normally
// create, then reuse recordOfferResponse so the full downstream flow runs
// (assignment, timesheet, Wet DBA model agreement, shift status).
// ---------------------------------------------------------------------------

const OPEN_STATUSES = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;

/** How long after a shift's real start time a late direct acceptance is still allowed (e.g. a no-show backfill). Mirrors app/dashboard/klussen/actions.ts's counter-offer path. */
const LATE_ACCEPT_GRACE_MS = 2 * 60 * 60 * 1000;

export interface ApplyResult {
  status: MatchStatus;
  shiftFilled: boolean;
  /** the company isn't verified yet: the reaction is noted, nobody is scheduled */
  pendingCompanyVerification?: boolean;
}

export async function applyToShift(
  userId: string,
  shiftId: string,
  /**
   * doorBedrijf: het bedrijf koos deze werker zelf (respondToOfferAction). Bij een klus in België (lib/belgie/klus-kern.ts) de
   * enige weg naar een plek: daar kiest het bedrijf als werkgever, nooit de werker zelf of een automatische regel. In Nederland
   * verandert de optie niets.
   */
  opties: { doorBedrijf?: boolean } = {},
): Promise<ApplyResult> {
  // eerst de onboarding (12 nov, eigenaar: alles zien, alleen reageren wacht op de onboarding)
  await eisOnboardingVoorReageren(userId);
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      kvkValid: true,
      isBlacklisted: true,
      matchingBlockedUntil: true,
      homeLatitude: true,
      homeLongitude: true,
      user: { select: { kycStatus: true, email: true } },
    },
  });
  if (!profile) throw AppError.forbidden("Rond eerst je verificatie af.").metSleutel("apply.verificatie");
  if (profile.user.kycStatus !== "VERIFIED") {
    throw AppError.precondition("Je kunt pas diensten aannemen als je identiteit is geverifieerd.").metSleutel("apply.identiteit");
  }
  // De eisen van ZekerFlex als werkgever of uitbetaler (KVK/btw/IBAN, of BSN en de ZekerFlex-uitzendovereenkomst). Bij een
  // klus van een uitzendpartner gelden ze niet: daar is het bureau de werkgever (lib/uitzend/partners-kern.ts). Dat weten
  // we pas als de klus geladen is; de fout volgt daarom hieronder.
  const eligible = await payoutEligibility(userId);
  const nietKlaar = (): AppError => {
    // een eigen reden zonder sleutel (bv. het recht om te werken) blijft Nederlands; de algemene melding krijgt de sleutel.
    // Gemerkt (lib/fiscal/werker-niet-klaar.ts): accepteert een werkgever de reactie, dan leest hij een eigen zin, niet deze.
    return werkerNietKlaarFout(eligible.reason ?? "Je kunt nog geen diensten aannemen.", eligible.reason ? eligible.sleutel : "apply.nietKlaar");
  };
  if (profile.isBlacklisted) throw AppError.forbidden("Je account kan momenteel geen diensten aannemen.").metSleutel("apply.geblokkeerd");
  if (profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now()) {
    throw AppError.precondition("Matching is tijdelijk beperkt vanwege Wet DBA-signalen.").metSleutel("apply.dba");
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      positions: true,
      viaUitzendbureau: true,
      visibility: true,
      title: true,
      createdAt: true,
      branch: { select: { tenantId: true, postalCode: true, latitude: true, longitude: true, geofenceRadiusMeters: true, tenant: { select: { name: true } } } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!shift) throw AppError.notFound("Deze dienst bestaat niet meer.").metSleutel("apply.bestaatNiet");
  // Een klus in België: het bedrijf is de werkgever en kiest zelf, na zijn bevestiging (components/werkgever/BelgieKlusPaneel.tsx).
  // De werker reageert gewoon; zelf een plek nemen (of een automatische regel: vaste schil, spoedoproep) kan daar niet.
  const belgieKlus = isBelgischeKlus(shift.branch.postalCode);
  if (belgieKlus && !opties.doorBedrijf) {
    throw AppError.precondition("Bij een klus in België kiest het bedrijf zelf wie er werkt. Reageer op de klus; het bedrijf laat je weten of je bent gekozen.").metSleutel("apply.belgieBedrijfKiest");
  }
  if (belgieKlus && belgieKiesReden(await leesBelgieKlusVoor(shiftId))) {
    throw AppError.precondition("Het bedrijf moet eerst bevestigen dat het de werkgever is en de Dimona doet.").metSleutel("apply.belgieBevestiging");
  }
  // Bij een uitzendpartner en bij een klus in België is het bedrijf of bureau de werkgever: dan gelden de eisen van ZekerFlex als
  // werkgever of uitbetaler niet (KVK/btw/IBAN, BSN en de uitzendovereenkomst); de ID-controle en de aanmelding wel.
  const partnerKlus = (await isUitzendPartnerTenant(shift.branch.tenantId)) || belgieKlus;
  if (!partnerKlus && !eligible.ok) throw nietKlaar();
  // het testwerkeraccount van de eigenaar (lib/testwerker/adres.ts) reageert alleen op testklussen, nooit op echt werk
  const eigenTest = await leesEigenTest();
  const eigenTestKlus = isEigenTestKlus(eigenTest, { tenantId: shift.branch.tenantId, createdAt: shift.createdAt });
  if (isTestwerker(profile.user.email) && !isTestklus({ title: shift.title, bedrijf: shift.branch.tenant.name, eigenTest: eigenTestKlus })) {
    throw AppError.forbidden("Met het testaccount kun je alleen op testklussen reageren.").metSleutel("apply.alleenTestklus");
  }
  // privé-accounts van de eigenaar (lib/admin/eigen-test-regel.ts): een klus van een eigen-testbedrijf bestaat niet voor wie hem
  // niet mag zien, en een eigen-test-werker reageert niet op een klus van een echt bedrijf
  const toegang = await klusToegang(userId, shift.branch.tenantId, eigenTest);
  if (!toegang.zien) throw AppError.notFound("Deze dienst bestaat niet meer.").metSleutel("apply.bestaatNiet");
  if (!toegang.reageren) throw AppError.precondition("Deze dienst is nog niet open voor aanmeldingen.").metSleutel("apply.nietOpen");
  // een gewone uitzendklus is alleen voor uitzendkrachten van ZekerFlex; bij een uitzendpartner mag iedereen een contract aanvragen
  if (shift.viaUitzendbureau && !partnerKlus && eligible.track !== "payroll") {
    throw AppError.forbidden("Deze klus loopt via een uitzendbureau; reageren kan alleen als uitzendkracht.").metSleutel("apply.uitzendOnly");
  }
  if (await isBlockedByAny([shift.branch.tenantId], userId)) {
    throw AppError.forbidden("Deze opdrachtgever neemt op dit moment geen aanmeldingen van je aan.").metSleutel("apply.opdrachtgeverWeigert");
  }
  // maximum uren per werker bij dit bedrijf (lib/werkgever/max-uren.ts): gewerkt + ingepland in 12 maanden
  const max = (await getOrgProfileExtra(shift.branch.tenantId).catch(() => ({}) as { maxUrenPerWerker?: number })).maxUrenPerWerker;
  if (max && max > 0) {
    const al = await urenBijBedrijf(shift.branch.tenantId, profile.id);
    if (!pastBinnenMaxUren(al, dienstUren({ startsAt: shift.startsAt, endsAt: shift.endsAt, breakMinutes: shift.breakMinutes }), max)) {
      throw AppError.precondition(`Je zit aan het maximum van ${max} uur per jaar bij dit bedrijf.`).metSleutel("apply.maxUren", { max });
    }
  }
  if (shift.visibility === "POOL_ONLY" && !(await isInvitedToPoolOnlyShift(shiftId, userId))) {
    throw AppError.forbidden("Deze dienst is nog niet open voor aanmeldingen.").metSleutel("apply.nietOpen");
  }
  if (!OPEN_STATUSES.includes(shift.status as (typeof OPEN_STATUSES)[number])) {
    throw AppError.conflict("Deze dienst neemt geen aanmeldingen meer aan.").metSleutel("apply.geenAanmeldingen");
  }
  if (shift.startsAt.getTime() + LATE_ACCEPT_GRACE_MS < Date.now()) {
    throw AppError.conflict("Deze dienst is al meer dan 2 uur geleden begonnen — aanmelden kan niet meer.").metSleutel("apply.begonnen");
  }
  if (shift._count.assignments >= shift.positions) throw AppError.conflict("Deze dienst is al vol.").metSleutel("apply.vol");

  const already = await prisma.shiftAssignment.findUnique({
    where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
    select: { id: true, cancelledAt: true },
  });
  if (already && !already.cancelledAt) throw AppError.conflict("Je hebt deze dienst al aangenomen.").metSleutel("apply.alAangenomen");
  // Eerst hier (vóór de reactie wordt vastgelegd); recordOfferResponse controleert nog eens binnen de transactie.
  const overlap = await findOverlappingShift(prisma, profile.id, { shiftId, startsAt: shift.startsAt, endsAt: shift.endsAt });
  if (overlap) throw AppError.conflict(overlapMessageSelf(overlap)).metSleutel("apply.overlap", overlapParams(overlap));

  const distanceMeters = Math.round(
    haversineMeters(
      { latitude: profile.homeLatitude, longitude: profile.homeLongitude },
      { latitude: shift.branch.latitude, longitude: shift.branch.longitude },
    ),
  );
  // Rough door-to-door estimate: ~22 km/h average incl. stops.
  const travelMinutes = Math.max(1, Math.round((distanceMeters / 1000 / 22) * 60));
  const withinGeofence = distanceMeters <= shift.branch.geofenceRadiusMeters;

  const breakdown = {
    source: "marketplace-self-apply",
    travelMinutes,
    distanceMeters,
  } satisfies Prisma.InputJsonValue;

  await prisma.shiftMatch.upsert({
    where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
    create: {
      shiftId,
      freelancerId: profile.id,
      score: 0.75,
      scoreBreakdown: breakdown,
      travelMode: "TRANSIT",
      travelMinutes,
      distanceMeters,
      withinGeofence,
      status: MatchStatus.NOTIFIED,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      status: MatchStatus.NOTIFIED,
      notifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  if (!(await isTenantVerified(shift.branch.tenantId))) {
    // A company that is not verified yet: keep the reaction (VIEWED = interested, no expiry) and lay it down as a normal reaction
    // at the company (lib/matching/reactie.ts), so the company sees it and can accept it once it is verified; schedule nobody.
    await prisma.shiftMatch.update({
      where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
      data: { status: MatchStatus.VIEWED, expiresAt: null },
    });
    await leggReactieVast(userId, shiftId);
    return { status: MatchStatus.VIEWED, shiftFilled: false, pendingCompanyVerification: true };
  }

  // Leunt de werker op een proefklus (KVK/btw/KOR of IBAN ontbreekt nog), dan in de transactie een slot per werker en
  // opnieuw tellen vlak vóór het aanmaken: twee acceptaties tegelijk mogen samen nooit meer dan 2 proefklussen geven.
  // Wie alle gegevens heeft (of een klus van een uitzendpartner) gaat zonder slot, zoals altijd.
  const uitkomst =
    !partnerKlus && eligible.proef
      ? await recordOfferResponse(shiftId, profile.id, "ACCEPTED", { voorAanmaken: (tx) => eisProefklusInSlot(tx, userId) })
      : await recordOfferResponse(shiftId, profile.id, "ACCEPTED");
  // ingepland: een reactie van deze werker die nog openstond is daarmee afgehandeld
  if (!uitkomst?.pendingCompanyVerification) await sluitEigenReactie(userId, shiftId);
  return uitkomst;
}
