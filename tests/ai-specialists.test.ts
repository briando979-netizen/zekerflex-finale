import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ list: [] as { title: string; hourlyRateCents: number; branch: { city: string } }[] }));
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany: async () => rows.list } } }));

import { getSpecialist } from "@/lib/ai/specialists";

const jurist = getSpecialist("jurist")!.offline!;
const taxateur = getSpecialist("taxateur")!.offline!;

describe("AI-jurist contract check (no model)", () => {
  it("lists missing clauses and risky terms", async () => {
    const out = await jurist(
      "Overeenkomst tussen opdrachtgever Bakkerij BV (KVK 1234) en opdrachtnemer. De werkzaamheden: bakken. Tarief € 25 per uur, betaaltermijn 14 dagen. Opdrachtnemer werkt volgens vast rooster en is onbeperkt aansprakelijk. Er geldt een concurrentiebeding.",
    );
    expect(out).toContain("Contractcheck");
    expect(out).toContain("Vrije vervanging (Wet DBA)");
    expect(out).toContain("Concurrentiebeding");
    expect(out).toContain("Onbeperkte aansprakelijkheid");
    expect(out).toContain("geen juridisch advies");
  });

  it("asks for the text when it's too short", async () => {
    expect(await jurist("is dit goed?")).toContain("Plak");
  });
});

describe("AI-taxateur from real platform rates (no model)", () => {
  it("gives median and range for the category, local when enough data", async () => {
    rows.list = [
      ...[1600, 1700, 1800, 1900, 2000].map((r) => ({ title: "Orderpicker magazijn", hourlyRateCents: r, branch: { city: "Tilburg" } })),
      ...[2200, 2400, 2600, 2800, 3000].map((r) => ({ title: "Bediening restaurant", hourlyRateCents: r, branch: { city: "Utrecht" } })),
    ];
    const out = await taxateur("orderpicker magazijn Tilburg, 8 uur");
    expect(out).toContain("Logistiek in Tilburg");
    expect(out).toMatch(/€\s18,00/);
    expect(out).toContain("8 uur");
    expect(out).toContain("Horeca");
  });

  it("says so honestly when there's too little data", async () => {
    rows.list = [];
    expect(await taxateur("dakdekker Groningen")).toContain("Te weinig vergelijkbare klussen");
  });
});
