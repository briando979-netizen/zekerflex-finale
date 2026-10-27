import { prisma } from "@/lib/prisma";
import { haversineMeters } from "@/lib/geo/geofencing";

// ---------------------------------------------------------------------------
// Open klussen as the public (not logged-in) web sees them: /klussen, the city
// pages and Google for Jobs. Only PUBLIC shifts that still take reactions and
// haven't started yet. No addresses beyond postcode/city, no rates hidden —
// the same information a freelancer sees in the app before reacting.
// ---------------------------------------------------------------------------

export interface PublicShift {
  id: string;
  title: string;
  description: string | null;
  company: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  startsAt: Date;
  endsAt: Date;
  hourlyRateCents: number;
  positions: number;
  viaUitzendbureau: boolean;
  createdAt: Date;
  skill: string | null;
}

const OPEN = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;

const select = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  hourlyRateCents: true,
  positions: true,
  viaUitzendbureau: true,
  createdAt: true,
  requiredSkill: { select: { name: true } },
  branch: { select: { city: true, postalCode: true, latitude: true, longitude: true, tenant: { select: { name: true } } } },
} as const;

type Row = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  hourlyRateCents: number;
  positions: number;
  viaUitzendbureau: boolean;
  createdAt: Date;
  requiredSkill: { name: string } | null;
  branch: { city: string; postalCode: string; latitude: number; longitude: number; tenant: { name: string } };
};

const toPublic = (s: Row): PublicShift => ({
  id: s.id,
  title: s.title,
  description: s.description,
  company: s.branch.tenant.name,
  city: s.branch.city,
  postalCode: s.branch.postalCode,
  latitude: s.branch.latitude,
  longitude: s.branch.longitude,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  hourlyRateCents: s.hourlyRateCents,
  positions: s.positions,
  viaUitzendbureau: s.viaUitzendbureau,
  createdAt: s.createdAt,
  skill: s.requiredSkill?.name ?? null,
});

export async function publicOpenShifts(opts: { near?: { lat: number; lng: number; km: number }; take?: number } = {}): Promise<PublicShift[]> {
  const near = opts.near;
  const latDelta = near ? near.km / 111.32 : 0;
  const lngDelta = near ? near.km / (111.32 * Math.max(Math.cos((near.lat * Math.PI) / 180), 0.01)) : 0;
  const rows = (await prisma.shift.findMany({
    where: {
      status: { in: [...OPEN] },
      visibility: "PUBLIC",
      startsAt: { gt: new Date() },
      ...(near ? {
        branch: {
          latitude: { gte: near.lat - latDelta, lte: near.lat + latDelta },
          longitude: { gte: near.lng - lngDelta, lte: near.lng + lngDelta },
        },
      } : {}),
    },
    orderBy: { startsAt: "asc" },
    take: 500,
    select,
  })) as Row[];
  let out = rows.map(toPublic);
  if (near) {
    const { lat, lng, km } = near;
    out = out.filter((s) => haversineMeters({ latitude: lat, longitude: lng }, { latitude: s.latitude, longitude: s.longitude }) <= km * 1000);
  }
  return opts.take ? out.slice(0, opts.take) : out;
}

export async function publicShiftTenant(id: string): Promise<string | null> {
  return (await prisma.shift.findUnique({ where: { id }, select: { branch: { select: { tenantId: true } } } }))?.branch.tenantId ?? null;
}

export async function publicShift(id: string): Promise<PublicShift | null> {
  const s = (await prisma.shift.findFirst({
    where: { id, status: { in: [...OPEN] }, visibility: "PUBLIC", startsAt: { gt: new Date() } },
    select,
  })) as Row | null;
  return s ? toPublic(s) : null;
}

/** schema.org JobPosting — what makes a klus show up in Google's job search. */
export function jobPostingJsonLd(s: PublicShift, siteUrl: string): Record<string, unknown> {
  const hours = Math.max(0, (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000);
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: s.title,
    description:
      (s.description ? `<p>${escapeHtml(s.description)}</p>` : "") +
      `<p>Klus via ZekerFlex in ${escapeHtml(s.city)} op ${s.startsAt.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" })}, ` +
      `${hours.toFixed(1).replace(".", ",")} uur, € ${(s.hourlyRateCents / 100).toFixed(2).replace(".", ",")} per uur. ` +
      (s.viaUitzendbureau
        ? "Je werkt via het ZekerFlex-uitzendbureau: geen KVK nodig, loon met vakantiegeld en pensioen.</p>"
        : "Voor zzp'ers en flexwerkers; je kiest zelf hoe snel je wordt uitbetaald.</p>"),
    datePosted: s.createdAt.toISOString(),
    validThrough: s.startsAt.toISOString(),
    employmentType: s.viaUitzendbureau ? ["TEMPORARY"] : ["CONTRACTOR", "TEMPORARY"],
    hiringOrganization: { "@type": "Organization", name: s.company },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: s.city, postalCode: s.postalCode, addressCountry: "NL" },
      geo: { "@type": "GeoCoordinates", latitude: s.latitude, longitude: s.longitude },
    },
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "EUR",
      value: { "@type": "QuantitativeValue", value: s.hourlyRateCents / 100, unitText: "HOUR" },
    },
    directApply: true,
    url: `${siteUrl}/klussen/${s.id}`,
    identifier: { "@type": "PropertyValue", name: "ZekerFlex", value: s.id },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
