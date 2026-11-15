import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// De assistent per app (15 nov 2026). Wie werker is én een bedrijf beheert, kreeg in /werkgever/assistent de werkersversie
// ("Kent je klussen, uren en uitbetalingen", "Wanneer is mijn volgende klus?"). Nu kiest de app de kant, alleen binnen de
// rollen die iemand echt heeft.

vi.mock("@/lib/auth", () => ({ hasRole: (p: { roles: string[] }, ...r: string[]) => r.some((x) => p.roles.includes(x)) }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/dashboard/freelancer", () => ({ getFreelancerOverview: async () => ({ upcoming: [] }) }));
vi.mock("@/lib/dashboard/my-work", () => ({ getMyWork: async () => ({}) }));
vi.mock("@/lib/dashboard/marketplace", () => ({ getMarketplace: async () => ({}) }));
vi.mock("@/lib/dashboard/employer", () => ({ getEmployerOverview: async () => ({}) }));

import { roleOf, toolsFor } from "@/lib/brain/tools";

const p = (roles: string[]) => ({ userId: "u1", roles, grants: roles.map((role) => ({ role, organizationId: "t1" })) }) as never;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de app kiest de kant, nooit meer rechten", () => {
  it("werker én bedrijf: in de werkgeversapp het bedrijf, in de werkersapp de werker, zonder app zoals altijd", () => {
    const beide = p(["FREELANCER", "LOCAL_MANAGER"]);
    expect(roleOf(beide, "werkgever")).toBe("opdrachtgever");
    expect(roleOf(beide, "werker")).toBe("werknemer");
    expect(roleOf(beide)).toBe("werknemer");
  });

  it("alleen werker: ook met app=werkgever blijft het de werker (geen bedrijfsgegevens via de adresbalk)", () => {
    expect(roleOf(p(["FREELANCER"]), "werkgever")).toBe("werknemer");
  });

  it("beheer blijft beheer, een bedrijf blijft een bedrijf", () => {
    expect(roleOf(p(["PLATFORM_ADMIN", "FREELANCER"]), "werkgever")).toBe("admin");
    expect(roleOf(p(["HQ_ADMIN"]), "werker")).toBe("opdrachtgever");
  });

  it("de hulpmiddelen van het bedrijf bevatten geen werkersplanning", () => {
    const namen = toolsFor("opdrachtgever").map((t) => t.name);
    expect(namen).not.toContain("mijn_planning");
    expect(toolsFor("werknemer").map((t) => t.name)).toContain("mijn_planning");
  });
});

describe("het scherm en de route", () => {
  it("elke app geeft zijn kant mee; het bedrijf leest diensten, uren en facturen", () => {
    expect(bron("app/werkgever/assistent/page.tsx")).toContain('<BrainChat app="werkgever" />');
    expect(bron("app/dashboard/assistent/page.tsx")).toContain('<BrainChat app="werker" />');
    const chat = bron("components/brain/BrainChat.tsx");
    expect(chat).toContain("`/api/brain?app=${app}`");
    expect(chat).toContain("Kent je diensten, uren en facturen");
    const route = bron("app/api/brain/route.ts");
    expect(route).toContain("roleOf(p, appUit(request))");
    expect(route).toContain("think(p, question, app ? { app } : {})");
    expect(bron("lib/brain/index.ts")).toContain("runTools(p, toolNames, role)");
  });
});
