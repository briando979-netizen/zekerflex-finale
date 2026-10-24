import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";
import { listCertificates, CERT_TYPES } from "@/lib/certificates/store";
import { getUserAvatars } from "@/lib/profile/store";
import { avatarUrlFor } from "@/lib/profile/card";

// ---------------------------------------------------------------------------
// Profielkaart van een freelancer voor de opdrachtgever — te zien zodra de
// freelancer op een klus van die opdrachtgever heeft gereageerd (de toegang
// wordt afgedwongen in de API, niet hier). Alles uit bestaande data: foto,
// omgeving, betrouwbaarheid/opkomst, aantal annuleringen, gemiddeld tarief,
// werkverleden, beoordelingen, vaardigheden en certificaten.
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
  name: string;
  avatarUrl: string | null;
  badge: string;
  area: string | null; // PC4, bijv. "1011"
  reliabilityPct: number;
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
  avgRateCents: number | null;
  rating: { average: number; count: number };
  reviews: { rating: number; text: string; authorRole: string; at: string; shiftTitle?: string }[];
  skills: { name: string; rating: number; shiftsWorked: number }[];
  certificates: { label: string; expiresOn?: string }[];
  history: CandidateHistoryItem[];
}

const MONTHS_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export async function buildCandidateCard(freelancerUserId: string, now = new Date()): Promise<CandidateCard | null> {
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
          skills: { select: { rating: true, shiftsWorked: true, skill: { select: { name: true } } } },
        },
      },
    },
  });
  if (!user?.freelancerProfile) return null;
  const fp = user.freelancerProfile;

  const [assignments, summary, certs, avatars] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { freelancerId: fp.id },
      select: {
        cancelledAt: true,
        timesheet: { select: { status: true, actualStart: true } },
        shift: {
          select: { title: true, startsAt: true, endsAt: true, hourlyRateCents: true, branch: { select: { name: true, city: true } } },
        },
      },
      orderBy: { acceptedAt: "desc" },
      take: 150,
    }),
    reviewSummary("freelancer", freelancerUserId).catch(() => ({ average: 0, count: 0, recent: [] as never[] })),
    listCertificates(freelancerUserId).catch(() => []),
    getUserAvatars([freelancerUserId]).catch(() => ({}) as Record<string, boolean>),
  ]);

  const active = assignments.filter((a) => !a.cancelledAt);
  const cancellations = assignments.length - active.length;
  const avgRateCents = active.length
    ? Math.round(active.reduce((s, a) => s + a.shift.hourlyRateCents, 0) / active.length)
    : null;

  // opkomst: verscheen vs. gemist op afgelopen (niet-geannuleerde) diensten
  let showed = 0;
  let missed = 0;
  for (const a of assignments) {
    if (a.shift.endsAt >= now) continue;
    const ts = a.timesheet;
    const cameIn = !a.cancelledAt && (ts?.actualStart != null || ["SUBMITTED", "APPROVED", "DISPUTED"].includes(ts?.status ?? ""));
    if (a.cancelledAt || !cameIn) missed++;
    else showed++;
  }
  const attendancePct = showed + missed > 0 ? Math.round((showed / (showed + missed)) * 100) : null;

  const history: CandidateHistoryItem[] = active
    .filter((a) => a.shift.endsAt < now)
    .slice(0, 8)
    .map((a) => ({
      title: a.shift.title,
      city: a.shift.branch.city,
      company: a.shift.branch.name,
      monthLabel: `${MONTHS_NL[a.shift.startsAt.getMonth()]} ${a.shift.startsAt.getFullYear()}`,
      rateCents: a.shift.hourlyRateCents,
    }));

  const skills = fp.skills
    .filter((s) => s.shiftsWorked > 0 || s.rating > 0)
    .map((s) => ({ name: s.skill.name, rating: Math.round(s.rating * 10) / 10, shiftsWorked: s.shiftsWorked }))
    .sort((a, b) => b.shiftsWorked - a.shiftsWorked || b.rating - a.rating);

  const certificates = certs
    .filter((c) => c.status === "valid")
    .map((c) => ({ label: c.customLabel || CERT_TYPES[c.type].label, ...(c.expiresOn ? { expiresOn: c.expiresOn } : {}) }));

  const reviews = (summary.recent ?? [])
    .filter((r) => r.text && r.text.trim().length > 0)
    .slice(0, 4)
    .map((r) => ({ rating: r.rating, text: r.text, authorRole: r.authorRole, at: r.at, ...(r.shiftTitle ? { shiftTitle: r.shiftTitle } : {}) }));

  return {
    userId: freelancerUserId,
    name: user.fullName,
    avatarUrl: avatarUrlFor(freelancerUserId, Boolean(avatars[freelancerUserId])),
    badge: fp.badgeLevel,
    area: fp.homePostalCode ? fp.homePostalCode.replace(/\s/g, "").slice(0, 4) : null,
    reliabilityPct: Math.round(fp.reliabilityScore * 100),
    attendancePct,
    shiftsCompleted: fp.shiftsCompleted,
    cancellations,
    avgRateCents,
    rating: { average: summary.average, count: summary.count },
    reviews,
    skills,
    certificates,
    history,
  };
}
