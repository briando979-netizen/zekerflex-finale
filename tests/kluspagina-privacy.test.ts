import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Privacy op de kluspagina van een bedrijf (23 nov 2026). Van een werker die alleen reageerde (of alleen in de wachtrij staat) ziet
// een bedrijf geen telefoon, e-mail, achternaam voluit, adres, postcode voluit, geboortedatum of ID-gegevens: niets daarvan mag in
// de pagina of in het antwoord van de API staan vóór de match. Pas bij een ingeplande kracht komen naam, telefoon en e-mail mee.
// Deze test bewaakt de drie plekken waar het mis kan gaan: de naamregel, de gegevens van de pagina en de profielkaart.

const GEHEIM = { achternaam: "Vandersteen", telefoon: "+31612345678", email: "sanne.prive@voorbeeld.test", postcode: "1012 JS", iban: "NL91ABNA0417164300" };

const h = vi.hoisted(() => ({ userSelects: [] as Record<string, unknown>[] }));

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: null }) }));
vi.mock("@/lib/offers/store", () => ({
  listCounterOffers: async () => [
    { id: "o1", shiftId: "sh1", userId: "w1", freelancerName: "Sanne Vandersteen", proposedRateCents: 1900, listedRateCents: 1800, note: "Ik heb zin in deze klus", status: "pending", at: "2026-11-20T10:00:00Z" },
  ],
}));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}), getUserProfileExtra: async () => ({}), getOrgProfileExtra: async () => ({}) }));
vi.mock("@/lib/reviews/store", () => ({
  reviewSummary: async () => ({ average: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 }, recent: [] }),
  listReviews: async () => [],
}));
vi.mock("@/lib/pools/store", () => ({ poolsInvitedToShift: async () => [] }));
vi.mock("@/lib/certificates/store", () => ({ listCertificates: async () => [], CERT_TYPES: {} }));
vi.mock("@/lib/werker/ervaring-store", () => ({ getErvaring: async () => ({ items: [], geen: false }) }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findFirst: async () => ({
        id: "sh1",
        title: "Magazijn",
        description: null,
        dresscode: null,
        extraInfo: null,
        startsAt: new Date("2026-12-08T08:00:00Z"),
        endsAt: new Date("2026-12-08T14:00:00Z"),
        breakMinutes: 30,
        hourlyRateCents: 1800,
        positions: 1,
        annuleerUren: 24,
        kostenplaats: null,
        status: "OPEN",
        visibility: "PUBLIC",
        requiredSkill: null,
        branch: { id: "b1", name: "Hal 1", city: "Utrecht", tenantId: "t1", addressLine: "Kade 1", latitude: 52.09, longitude: 5.12 },
        assignments: [],
        matches: [
          { score: 0.9, travelMinutes: 12, distanceMeters: 4000, withinGeofence: true, scoreBreakdown: {}, status: "NOTIFIED", freelancer: { id: "fp2", userId: "w2", user: { fullName: "Piet Vandersteen" } } },
        ],
      }),
      findMany: async () => [],
    },
    freelancerProfile: { findMany: async () => [] },
    shiftAssignment: { findMany: async () => [] },
    user: {
      // geeft alleen terug wat er gevraagd is: precies wat een echte database doet
      findUnique: async (args: { select: Record<string, unknown> }) => {
        h.userSelects.push(args.select);
        const alles: Record<string, unknown> = {
          fullName: "Sanne Vandersteen",
          phone: GEHEIM.telefoon,
          email: GEHEIM.email,
          freelancerProfile: { id: "fp1", badgeLevel: "GOLD", reliabilityScore: 0.9, shiftsCompleted: 3, homePostalCode: GEHEIM.postcode, payoutIban: GEHEIM.iban, skills: [] },
        };
        return Object.fromEntries(Object.keys(args.select).map((sleutel) => [sleutel, alles[sleutel]]));
      },
    },
  },
}));

import { naamVoorMatch } from "@/lib/werkgever/naam";
import { buildCandidateCard } from "@/lib/employer/candidate-card";
import { getEmployerShift } from "@/lib/dashboard/employer-shift";
import type { Principal } from "@/lib/auth";

const NU = new Date("2026-11-23T12:00:00+01:00");
const hq = { userId: "u1", email: "baas@bedrijf.test", fullName: "Baas", grants: [], memberships: [{ tenantId: "t1", role: "HQ_ADMIN" }], managedBranchIds: [] } as unknown as Principal;
const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

beforeEach(() => {
  h.userSelects.length = 0;
});

describe("de naam vóór de match", () => {
  it("is de voornaam met alleen de eerste letter van de achternaam", () => {
    expect(naamVoorMatch("Sanne Vandersteen")).toBe("Sanne V.");
    expect(naamVoorMatch("Jan de Vries")).toBe("Jan V.");
    expect(naamVoorMatch("  Fatima   el  Amrani ")).toBe("Fatima A.");
    expect(naamVoorMatch("Mila")).toBe("Mila");
    expect(naamVoorMatch("")).toBe("");
    expect(naamVoorMatch(null)).toBe("");
  });
});

describe("de gegevens van de kluspagina (getEmployerShift)", () => {
  it("bevatten van wie reageerde of in de wachtrij staat geen achternaam voluit en geen contactgegevens", async () => {
    const s = await getEmployerShift(hq, "sh1");
    expect(s?.offers[0]?.freelancerName).toBe("Sanne V.");
    expect(s?.queue[0]?.name).toBe("Piet V.");
    const alles = JSON.stringify(s);
    expect(alles).not.toContain(GEHEIM.achternaam);
    for (const veld of ['"phone"', '"email"', '"homePostalCode"', '"payoutIban"', '"dateOfBirth"', '"bsn"']) expect(alles, veld).not.toContain(veld);
  });
});

describe("de profielkaart (buildCandidateCard, /api/werkgever/kandidaat)", () => {
  it("vóór de match: telefoon en e-mail worden niet eens opgevraagd en de achternaam staat er niet voluit", async () => {
    const card = await buildCandidateCard("w1", NU, { tenantId: "t1", naamBekend: false, contact: false });
    expect(card?.name).toBe("Sanne V.");
    expect(card?.matched).toBe(false);
    expect(card?.contact).toBeNull();
    expect(h.userSelects).toHaveLength(1);
    expect(Object.keys(h.userSelects[0] ?? {})).not.toContain("phone");
    expect(Object.keys(h.userSelects[0] ?? {})).not.toContain("email");
    const alles = JSON.stringify(card);
    for (const geheim of Object.values(GEHEIM)) expect(alles, geheim).not.toContain(geheim);
    // van de postcode alleen de vier cijfers (het gebied), nooit de letters
    expect(card?.area).toBe("1012");
  });

  it("zonder opties is de kaart afgeschermd: de veilige stand is de standaard", async () => {
    const card = await buildCandidateCard("w1", NU);
    expect(card?.contact).toBeNull();
    expect(JSON.stringify(card)).not.toContain(GEHEIM.achternaam);
  });

  it("na de match: de volledige naam, het telefoonnummer en het e-mailadres, maar nog steeds geen postcode of rekeningnummer", async () => {
    const card = await buildCandidateCard("w1", NU, { tenantId: "t1", naamBekend: true, contact: true });
    expect(card?.name).toBe("Sanne Vandersteen");
    expect(card?.contact).toEqual({ phone: GEHEIM.telefoon, email: GEHEIM.email });
    const alles = JSON.stringify(card);
    expect(alles).not.toContain(GEHEIM.postcode);
    expect(alles).not.toContain(GEHEIM.iban);
  });
});

describe("de bronnen", () => {
  it("de API bepaalt de match zelf (een ingeplande kracht bij dit bedrijf) en geeft die door aan de kaart", () => {
    const route = lees("app/api/werkgever/kandidaat/route.ts");
    expect(route).toContain("inplanningenBij(tenantId, profile.id)");
    expect(route).toContain("contactZichtbaar(inplanningen, nu)");
    expect(route).toContain("naamBekend: naamBekend(inplanningen), contact");
    // de match komt nooit uit het verzoek zelf
    expect(route).not.toMatch(/searchParams\.get\("(gematcht|matched)"\)/);
  });

  it("de kaart vraagt telefoon en e-mail alleen op achter de match", () => {
    const kaart = lees("lib/employer/candidate-card.ts");
    expect(kaart.match(/phone: true/g) ?? []).toHaveLength(1);
    expect(kaart).toMatch(/metContact \? prisma\.user\.findUnique\(\{ where: \{ id: freelancerUserId \}, select: \{ phone: true, email: true \} \}\)/);
    expect(kaart).not.toMatch(/dateOfBirth|birthDate|geboorte(datum)?: true|bsn/i);
  });

  it("de pagina en de tabel noemen geen contactgegevens van een werker, en de kaart toont vóór de match een vast nepvlak", () => {
    for (const bestand of ["app/werkgever/diensten/[shiftId]/page.tsx", "components/werkgever/ReactieLijst.tsx", "components/werkgever/RegioVenster.tsx", "lib/employer/prestaties.ts"]) {
      const bron = lees(bestand);
      expect(bron, bestand).not.toMatch(/\.phone\b|\.email\b|homePostalCode|payoutIban|fullName/);
    }
    const kaart = lees("components/app/CandidateCardButton.tsx");
    expect(kaart).toContain('card.contact ? card.contact.phone || k.onbekend : <Afgeschermd vorm="06 00 00 00 00" uitleg={k.naMatch} />');
    expect(kaart).toContain('card.contact ? card.contact.email : <Afgeschermd vorm="naam@voorbeeld.nl" uitleg={k.naMatch} />');
    expect(lees("lib/dashboard/employer-shift.ts")).toContain("freelancerName: naamVoorMatch(o.freelancerName)");
    expect(lees("lib/dashboard/employer-shift.ts")).toContain("name: naamVoorMatch(m.freelancer.user.fullName)");
  });
});
