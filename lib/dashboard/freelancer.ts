import { prisma } from "@/lib/prisma";
import { getFiscal, isComplete as isFiscalComplete, invoiceModeFor } from "@/lib/fiscal/store";
import { activeUitzendContract } from "@/lib/agreements/uitzend-contract";
import { amsterdamStartOfMonth } from "@/lib/time/amsterdam";
import { werkerStappen, berekenVoortgang, type Stap, type Voortgang, type WerkerStapSleutel } from "@/lib/onboarding/voortgang";

export interface FreelancerOverview {
  hasProfile: boolean;
  profileComplete: boolean;
  onboarding: { id: "account" | "fiscaal" | "contract" | "kvk" | "kyc" | "thuisbasis"; label: string; done: boolean }[];
  /** dezelfde stappen als sleutels (voor de "maak je profiel af"-kaart, vertaald door de pagina) */
  stappen: Stap<WerkerStapSleutel>[];
  voortgang: Voortgang<WerkerStapSleutel>;
  badgeLevel: string;
  reliabilityScore: number;
  shiftsCompleted: number;
  kpis: {
    upcoming: number;
    actionNeeded: number;
    earnedThisMonthCents: number;
    pendingPayoutCents: number;
  };
  upcoming: {
    id: string;
    title: string;
    branch: string;
    city: string;
    startsAt: Date;
    endsAt: Date;
    hourlyRateCents: number;
  }[];
  payouts: {
    id: string;
    number: string;
    totalCents: number;
    status: string;
    settledAt: Date | null;
    createdAt: Date;
  }[];
  agreements: { id: string; reference: string; clientLegalName: string; status: string }[];
}

export async function getFreelancerOverview(userId: string): Promise<FreelancerOverview> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      kvkValid: true,
      vatValid: true,
      payoutIban: true,
      badgeLevel: true,
      reliabilityScore: true,
      shiftsCompleted: true,
      homePostalCode: true,
    },
  });

  const [user, fiscal, pushAantal] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { kycStatus: true, emailVerifiedAt: true } }),
    getFiscal(userId),
    prisma.webPushSubscription.count({ where: { userId, disabledAt: null } }).catch(() => 0),
  ]);
  const fiscalDone = isFiscalComplete(fiscal);
  const isUitzend = invoiceModeFor(fiscal) === "payroll";
  const uitzendContractSigned = isUitzend ? Boolean(await activeUitzendContract(userId)) : true;

  const stappen = werkerStappen({
    emailBevestigd: Boolean(user?.emailVerifiedAt),
    fiscaalKlaar: fiscalDone,
    uitzend: isUitzend,
    kvkOfBtw: Boolean(profile?.kvkValid || fiscal.vatValid || fiscal.korApplies),
    contractGetekend: uitzendContractSigned,
    identiteitGeverifieerd: user?.kycStatus === "VERIFIED",
    bankEnThuis: Boolean(profile && (profile.payoutIban || fiscal.iban) && profile.homePostalCode),
    heeftPush: pushAantal > 0,
  });
  const voortgang = berekenVoortgang(stappen);

  if (!profile) {
    return {
      hasProfile: false,
      profileComplete: false,
      onboarding: [
        { id: "account", label: "Account aangemaakt", done: true },
        { id: "fiscaal", label: "Werkvorm & fiscale gegevens", done: fiscalDone },
        // een uitzendkracht heeft geen KVK of btw nodig: dezelfde stap als met profiel (hieronder)
        isUitzend
          ? { id: "contract", label: "Uitzendovereenkomst ondertekend", done: uitzendContractSigned }
          : { id: "kvk", label: "KVK/btw gekoppeld en gevalideerd", done: false },
        { id: "kyc", label: "Identiteit geverifieerd (KYC)", done: user?.kycStatus === "VERIFIED" },
        { id: "thuisbasis", label: "Thuisbasis en rekeningnummer ingesteld", done: false },
      ],
      stappen,
      voortgang,
      badgeLevel: "BRONZE",
      reliabilityScore: 1.0,
      shiftsCompleted: 0,
      kpis: { upcoming: 0, actionNeeded: 0, earnedThisMonthCents: 0, pendingPayoutCents: 0 },
      upcoming: [],
      payouts: [],
      agreements: [],
    };
  }

  const now = new Date();
  const monthStart = amsterdamStartOfMonth(now); // de server draait in UTC

  const [assignments, actionTimesheets, invoices, agreements] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: {
        freelancerId: profile.id,
        cancelledAt: null,
        shift: { startsAt: { gte: now }, status: { notIn: ["CANCELLED"] } },
      },
      select: {
        id: true,
        shift: {
          select: {
            title: true,
            startsAt: true,
            endsAt: true,
            hourlyRateCents: true,
            branch: { select: { name: true, city: true } },
          },
        },
      },
      orderBy: { shift: { startsAt: "asc" } },
      take: 8,
    }),
    prisma.timesheet.count({
      where: { freelancerId: profile.id, status: { in: ["SUBMITTED", "DISPUTED"] } },
    }),
    prisma.invoice.findMany({
      where: { type: "SELF_BILL_FREELANCER", issuerFreelancerId: profile.id },
      select: {
        id: true,
        number: true,
        totalCents: true,
        status: true,
        createdAt: true,
        payment: { select: { status: true, settledAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.modelAgreement.findMany({
      where: { freelancerId: profile.id },
      select: { id: true, reference: true, clientLegalName: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const earnedThisMonthCents = invoices
    .filter((i) => i.payment?.status === "SETTLED" && i.payment.settledAt && i.payment.settledAt >= monthStart)
    .reduce((s, i) => s + i.totalCents, 0);

  const pendingPayoutCents = invoices
    .filter((i) => i.payment?.status !== "SETTLED" && i.status !== "CANCELLED")
    .reduce((s, i) => s + i.totalCents, 0);

  return {
    hasProfile: true,
    profileComplete:
      fiscalDone && (profile.kvkValid || fiscal.vatValid || fiscal.korApplies || fiscal.workerKind === "uitzendkracht") &&
      Boolean(profile.payoutIban || fiscal.iban) &&
      user?.kycStatus === "VERIFIED" &&
      uitzendContractSigned,
    onboarding: [
      { id: "account", label: "Account aangemaakt", done: true },
      { id: "fiscaal", label: "Werkvorm & fiscale gegevens", done: fiscalDone },
      isUitzend
        ? { id: "contract", label: "Uitzendovereenkomst ondertekend", done: uitzendContractSigned }
        : { id: "kvk", label: "KVK/btw gekoppeld en gevalideerd", done: profile.kvkValid || fiscal.vatValid || fiscal.korApplies },
      { id: "kyc", label: "Identiteit geverifieerd (KYC)", done: user?.kycStatus === "VERIFIED" },
      { id: "thuisbasis", label: "Thuisbasis en rekeningnummer ingesteld", done: Boolean((profile.payoutIban || fiscal.iban) && profile.homePostalCode) },
    ],
    stappen,
    voortgang,
    badgeLevel: profile.badgeLevel,
    reliabilityScore: profile.reliabilityScore,
    shiftsCompleted: profile.shiftsCompleted,
    kpis: {
      upcoming: assignments.length,
      actionNeeded: actionTimesheets,
      earnedThisMonthCents,
      pendingPayoutCents,
    },
    upcoming: assignments.map((a) => ({
      id: a.id,
      title: a.shift.title,
      branch: a.shift.branch.name,
      city: a.shift.branch.city,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
      hourlyRateCents: a.shift.hourlyRateCents,
    })),
    payouts: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      totalCents: i.totalCents,
      status: i.payment?.status ?? i.status,
      settledAt: i.payment?.settledAt ?? null,
      createdAt: i.createdAt,
    })),
    agreements,
  };
}
