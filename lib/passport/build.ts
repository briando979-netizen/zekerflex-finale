import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";
import { listCertificates, CERT_TYPES } from "@/lib/certificates/store";
import { sealPassport, type PassportSeal } from "@/lib/passport/seal";

// ---------------------------------------------------------------------------
// Bouwt de momentopname van een werkpaspoort: geverifieerde identiteit, echte
// werkstatistiek, beoordeelde vaardigheden, geldige certificaten en recente
// reviews — plus een geavanceerd zegel over de kerninhoud. Alle data komt uit
// bestaande bronnen (FreelancerProfile, reviews, certificaten); niets verzonnen.
// ---------------------------------------------------------------------------

export interface PassportSkill {
  name: string;
  category: string;
  rating: number; // 0..5
  shiftsWorked: number;
}

export interface PassportCertificate {
  label: string;
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
}

export interface PassportReview {
  rating: number;
  text: string;
  authorRole: "employer" | "freelancer";
  shiftTitle?: string;
  at: string;
}

export interface Passport {
  fullName: string;
  country: string;
  memberSince: string; // ISO
  kvkNumber: string;
  kvkVerified: boolean;
  kvkVerifiedAt?: string;
  badgeLevel: string;
  shiftsCompleted: number;
  reliabilityScore: number; // 0..1
  rating: { average: number; count: number };
  skills: PassportSkill[];
  certificates: PassportCertificate[];
  reviews: PassportReview[];
  seal: PassportSeal;
}

/** Canonieke, stabiele kern voor het zegel (geen vrije tekst/volatiele velden). */
function canonical(p: Omit<Passport, "seal" | "reviews">): string {
  return JSON.stringify({
    name: p.fullName,
    kvk: p.kvkNumber,
    kvkVerified: p.kvkVerified,
    country: p.country,
    badge: p.badgeLevel,
    shifts: p.shiftsCompleted,
    rating: p.rating,
    skills: p.skills.map((s) => [s.name, s.rating, s.shiftsWorked]),
    certs: p.certificates.map((c) => c.label).sort(),
  });
}

export async function buildPassport(userId: string): Promise<Passport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      createdAt: true,
      freelancerProfile: {
        select: {
          kvkNumber: true,
          kvkValid: true,
          kvkVerifiedAt: true,
          country: true,
          badgeLevel: true,
          shiftsCompleted: true,
          reliabilityScore: true,
          skills: {
            select: { rating: true, shiftsWorked: true, skill: { select: { name: true, category: true } } },
          },
        },
      },
    },
  });
  if (!user?.freelancerProfile) return null;
  const fp = user.freelancerProfile;

  const [summary, certs] = await Promise.all([
    reviewSummary("freelancer", userId).catch(() => ({ average: 0, count: 0, recent: [] as never[] })),
    listCertificates(userId).catch(() => []),
  ]);

  const skills: PassportSkill[] = fp.skills
    .filter((s) => s.shiftsWorked > 0 || s.rating > 0)
    .map((s) => ({ name: s.skill.name, category: s.skill.category, rating: Math.round(s.rating * 10) / 10, shiftsWorked: s.shiftsWorked }))
    .sort((a, b) => b.shiftsWorked - a.shiftsWorked || b.rating - a.rating);

  const certificates: PassportCertificate[] = certs
    .filter((c) => c.status === "valid")
    .map((c) => ({
      label: c.customLabel || CERT_TYPES[c.type].label,
      ...(c.number ? { number: c.number } : {}),
      ...(c.issuedOn ? { issuedOn: c.issuedOn } : {}),
      ...(c.expiresOn ? { expiresOn: c.expiresOn } : {}),
    }));

  const reviews: PassportReview[] = (summary.recent ?? [])
    .filter((r) => r.text && r.text.trim().length > 0)
    .slice(0, 3)
    .map((r) => ({
      rating: r.rating,
      text: r.text,
      authorRole: r.authorRole,
      ...(r.shiftTitle ? { shiftTitle: r.shiftTitle } : {}),
      at: r.at,
    }));

  const core: Omit<Passport, "seal" | "reviews"> = {
    fullName: user.fullName,
    country: fp.country,
    memberSince: user.createdAt.toISOString(),
    kvkNumber: fp.kvkNumber,
    kvkVerified: fp.kvkValid,
    ...(fp.kvkVerifiedAt ? { kvkVerifiedAt: fp.kvkVerifiedAt.toISOString() } : {}),
    badgeLevel: fp.badgeLevel,
    shiftsCompleted: fp.shiftsCompleted,
    reliabilityScore: fp.reliabilityScore,
    rating: { average: summary.average, count: summary.count },
    skills,
    certificates,
  };

  return { ...core, reviews, seal: sealPassport(userId, canonical(core)) };
}
