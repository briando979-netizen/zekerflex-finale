import { prisma } from "@/lib/prisma";
import { listReviews, reviewSummary, type Review, type ReviewSummary } from "@/lib/reviews/store";
import { listCertificates, CERT_TYPES } from "@/lib/certificates/store";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { telOpkomst } from "@/lib/employer/opkomst-kern";
import { gebiedVan } from "@/lib/geo/thuisland";
import { naamVoorMatch } from "@/lib/werkgever/naam";
import { getErvaring } from "@/lib/werker/ervaring-store";
import type { ErvaringStand } from "@/lib/werker/ervaring";
import { naarPrestatieRij, verborgenVoorBedrijf } from "@/lib/employer/prestaties";
import { telPrestaties, zelfGewerkt, actieveRegios, type Prestaties } from "@/lib/employer/prestaties-kern";
import { gewerktBij, groepeerReviews, type FunctieGroep, type KlusVoorGroep } from "@/lib/employer/kaart-kern";

// ---------------------------------------------------------------------------
// Profielkaart van een freelancer voor de opdrachtgever — te zien zodra de
// freelancer op een klus van die opdrachtgever heeft gereageerd (de toegang
// wordt afgedwongen in de API, niet hier). Alles uit bestaande data: foto,
// omgeving, betrouwbaarheid/opkomst, aantal annuleringen, gemiddeld tarief,
// werkverleden, beoordelingen, vaardigheden en certificaten.
//
// Sinds 23 nov 2026 ook (naar de profielkaart van YoungOnes): de drie cijfers over 6 maanden, de verdeling per ster, de
// beoordeling per sector en functie met "Gewerkt bij", de eigen werkervaring en de bedrijven waar via ZekerFlex is gewerkt.
// Privacy (lib/employer/match-kern.ts): de achternaam staat er pas voluit als de werker ooit bij dit bedrijf is ingepland;
// telefoon en e-mail worden alleen opgevraagd zolang hij is ingepland (tot 14 dagen na de klus), anders bestaan ze hier niet.
// De werkervaring staat er alleen als de werker dat zelf heeft aangezet (lib/werker/ervaring-store.ts, standaard uit).
// Nooit in de kaart: adres, postcode voluit, geboortedatum, ID-gegevens.
// ---------------------------------------------------------------------------

export interface CandidateHistoryItem {
  title: string;
  city: string;
  company: string;
  monthLabel: string;
  rateCents: number;
}

export interface CandidateCard {
  userId: string;
  /** tot de eerste inplanning alleen de voornaam en de eerste letter van de achternaam (lib/werkgever/naam.ts) */
  name: string;
  avatarUrl: string | null;
  badge: string;
  area: string | null; // PC4, bijv. "1011"
  reliabilityPct: number;
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
  avgRateCents: number | null;
  rating: { average: number; count: number; distribution: ReviewSummary["distribution"] };
  reviews: { rating: number; text: string; authorRole: string; at: string; shiftTitle?: string }[];
  skills: { name: string; rating: number; shiftsWorked: number; sector: string }[];
  certificates: { label: string; expiresOn?: string }[];
  history: CandidateHistoryItem[];
  /** Volgt deze werker het bedrijf dat de kaart bekijkt? (lib/worker/follows) */
  followsYou?: boolean;
  /** nu ingepland bij dit bedrijf (tot 14 dagen na de klus): dan staan de contactgegevens erbij */
  matched: boolean;
  /** telefoon en e-mail; null buiten die periode (de kaart toont dan een afgeschermd vlak) */
  contact: { phone: string | null; email: string } | null;
  /** gematchte klussen, niet voltooid en vervanging geregeld over de laatste 6 maanden (lib/employer/prestaties-kern.ts) */
  prestaties: Prestaties;
  /** beoordelingen per sector en functie, met de bedrijven waar gewerkt is */
  perFunctie: FunctieGroep[];
  /** werkervaring die de werker zelf invulde (lib/werker/ervaring.ts); leeg zolang de werker hem niet deelt met bedrijven */
  ervaring: { functie: string; bedrijf: string; vanMaand: number; vanJaar: number; nu: boolean; totMaand: number | null; totJaar: number | null; omschrijving: string }[];
  /** bedrijven waar de werker via ZekerFlex werkte */
  gewerktBij: string[];
  /** staat bij dit bedrijf als favoriet / geblokkeerd (gezet door de API) */
  favoriet?: boolean;
  geblokkeerd?: boolean;
  /** regio's waar de werker actief was (lib/employer/prestaties-kern.ts) */
  regios: { naam: string; lat: number; lng: number }[];
}

const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const GEEN_VERDELING: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

export interface KaartOpties {
  /** het bedrijf dat de kaart bekijkt: bepaalt welke bedrijven in de kaart verborgen blijven (eigen test) */
  tenantId?: string | undefined;
  /** de werker is ooit bij dit bedrijf ingepland (bepaald in de API): de volledige naam */
  naamBekend?: boolean | undefined;
  /** de werker is nu bij dit bedrijf ingepland, tot 14 dagen na de klus (bepaald in de API): telefoon en e-mail */
  contact?: boolean | undefined;
}

export async function buildCandidateCard(freelancerUserId: string, now = new Date(), opties: KaartOpties = {}): Promise<CandidateCard | null> {
  const metContact = opties.contact === true;
  const naamVoluit = metContact || opties.naamBekend === true;
  const user = await prisma.user.findUnique({
    where: { id: freelancerUserId },
    select: {
      fullName: true,
      freelancerProfile: {
        select: {
          id: true,
          badgeLevel: true,
          reliabilityScore: true,
          shiftsCompleted: true,
          homePostalCode: true,
          skills: { select: { rating: true, shiftsWorked: true, skill: { select: { name: true, category: true } } } },
        },
      },
    },
  });
  if (!user?.freelancerProfile) return null;
  const fp = user.freelancerProfile;

  const [assignments, summary, alleReviews, certs, avatars, ervaring, verborgen, contactRij] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { freelancerId: fp.id },
      select: {
        shiftId: true,
        cancelledAt: true,
        cancelReason: true,
        timesheet: { select: { status: true, actualStart: true, billableMinutes: true } },
        shift: {
          select: {
            title: true,
            startsAt: true,
            endsAt: true,
            breakMinutes: true,
            hourlyRateCents: true,
            requiredSkill: { select: { name: true } },
            branch: { select: { name: true, city: true, tenantId: true, latitude: true, longitude: true, tenant: { select: { name: true } } } },
          },
        },
      },
      orderBy: { acceptedAt: "desc" },
      take: 150,
    }),
    reviewSummary("freelancer", freelancerUserId).catch((): ReviewSummary => ({ average: 0, count: 0, distribution: { ...GEEN_VERDELING }, recent: [] })),
    listReviews("freelancer", freelancerUserId).catch((): Review[] => []),
    listCertificates(freelancerUserId).catch(() => []),
    getUserAvatars([freelancerUserId]).catch(() => ({}) as Record<string, boolean>),
    getErvaring(freelancerUserId, now).catch((): ErvaringStand => ({ items: [], geen: false })),
    opties.tenantId ? verborgenVoorBedrijf(opties.tenantId).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
    // telefoon en e-mail worden alleen opgevraagd zolang de werker bij dit bedrijf is ingepland; anders bestaan ze hier niet
    metContact ? prisma.user.findUnique({ where: { id: freelancerUserId }, select: { phone: true, email: true } }) : Promise.resolve(null),
  ]);

  const active = assignments.filter((a) => !a.cancelledAt);
  const avgRateCents = active.length
    ? Math.round(active.reduce((s, a) => s + a.shift.hourlyRateCents, 0) / active.length)
    : null;

  // opkomst: verscheen vs. gemist op afgelopen diensten; annuleringen alleen wat de werker zelf afzegde of liet
  // schieten (telOpkomst, dezelfde telling als de reactie-rijen in lib/employer/opkomst.ts)
  const { attendancePct, cancellations } = telOpkomst(assignments, now);
  const rijen = assignments.map(naarPrestatieRij);

  const history: CandidateHistoryItem[] = active
    .filter((a) => a.shift.endsAt < now && !verborgen.has(a.shift.branch.tenantId))
    .slice(0, 8)
    .map((a) => ({
      title: a.shift.title,
      city: a.shift.branch.city,
      company: a.shift.branch.name,
      monthLabel: (({ month, year }) => `${MONTHS_NL[month - 1]} ${year}`)(amsterdamParts(a.shift.startsAt)),
      rateCents: a.shift.hourlyRateCents,
    }));

  const skills = fp.skills
    .filter((s) => s.shiftsWorked > 0 || s.rating > 0)
    .map((s) => ({ name: s.skill.name, rating: Math.round(s.rating * 10) / 10, shiftsWorked: s.shiftsWorked, sector: s.skill.category ?? "" }))
    .sort((a, b) => b.shiftsWorked - a.shiftsWorked || b.rating - a.rating);

  const certificates = certs
    .filter((c) => c.status === "valid")
    .map((c) => ({ label: c.customLabel || CERT_TYPES[c.type].label, ...(c.expiresOn ? { expiresOn: c.expiresOn } : {}) }));

  const reviews = (summary.recent ?? [])
    .filter((r) => r.text && r.text.trim().length > 0)
    .slice(0, 4)
    .map((r) => ({ rating: r.rating, text: r.text, authorRole: r.authorRole, at: r.at, ...(r.shiftTitle ? { shiftTitle: r.shiftTitle } : {}) }));

  // beoordelingen per sector en functie: de klus van elke beoordeling erbij zoeken (titel, vaardigheid, bedrijf)
  const reviewKlusIds = [...new Set(alleReviews.flatMap((r) => (r.shiftId ? [r.shiftId] : [])))].slice(0, 400);
  const reviewKlussen = reviewKlusIds.length
    ? await prisma.shift
        .findMany({
          where: { id: { in: reviewKlusIds } },
          select: { id: true, title: true, requiredSkill: { select: { name: true } }, branch: { select: { tenantId: true, tenant: { select: { name: true } } } } },
        })
        .catch(() => [])
    : [];
  const klusMap = new Map<string, KlusVoorGroep>(
    reviewKlussen.map((k) => [k.id, { title: k.title, skill: k.requiredSkill?.name ?? null, tenantId: k.branch.tenantId, bedrijf: k.branch.tenant.name }]),
  );

  return {
    userId: freelancerUserId,
    name: naamVoluit ? user.fullName : naamVoorMatch(user.fullName),
    avatarUrl: avatarUrlFor(freelancerUserId, Boolean(avatars[freelancerUserId])),
    badge: fp.badgeLevel,
    area: gebiedVan(fp.homePostalCode),
    reliabilityPct: Math.round(fp.reliabilityScore * 100),
    attendancePct,
    shiftsCompleted: fp.shiftsCompleted,
    cancellations,
    avgRateCents,
    rating: { average: summary.average, count: summary.count, distribution: summary.distribution ?? { ...GEEN_VERDELING } },
    reviews,
    skills,
    certificates,
    history,
    matched: metContact,
    contact: contactRij ? { phone: contactRij.phone, email: contactRij.email } : null,
    prestaties: telPrestaties(rijen, now),
    perFunctie: groepeerReviews(alleReviews, klusMap, verborgen),
    ervaring: (ervaring.zichtbaar === true ? ervaring.items : []).map((e) => ({
      functie: e.functie,
      bedrijf: e.bedrijf,
      vanMaand: e.vanMaand,
      vanJaar: e.vanJaar,
      nu: e.nu,
      totMaand: e.totMaand,
      totJaar: e.totJaar,
      omschrijving: e.omschrijving,
    })),
    gewerktBij: gewerktBij(
      assignments.filter((a) => a.shift.endsAt < now && zelfGewerkt(a)).map((a) => ({ tenantId: a.shift.branch.tenantId, bedrijf: a.shift.branch.tenant.name })),
      verborgen,
    ),
    regios: actieveRegios(rijen, now, verborgen).slice(0, 60).map((r) => ({ naam: r.naam, lat: r.lat, lng: r.lng })),
  };
}
