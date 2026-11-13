import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

// 404-ronde (13 nov 2026, Caddy-log van 2 dagen, scanners eruit): echte bezoekers raakten /favicon.ico (17×), een
// apple-touch-icon (7×, de linkvoorvertoning van Apple) en /api/engagement (15×, werkers zonder profiel). De pictogrammen
// lopen nu door naar de bestaande bestanden; /api/engagement zonder profiel is gewoon "niet geteld".

const h = vi.hoisted(() => ({ profiel: null as unknown, geteld: 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: async () => h.profiel },
    engagementEvent: { findFirst: async () => null },
  },
}));
vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1", roles: [] }), requireRole: () => undefined }));
vi.mock("@/lib/engagement/events", () => ({ recordEngagement: async () => void (h.geteld += 1) }));

import { POST } from "@/app/api/engagement/route";

describe("vaste adressen van pictogrammen", () => {
  it("lopen door (308) naar een pictogram dat echt in public/ staat", async () => {
    type Regel = { source: string; destination: string; permanent: boolean };
    const mod = (await import(pathToFileURL(path.join(process.cwd(), "next.config.mjs")).href)) as { default: { redirects: () => Promise<Regel[]> } };
    const regels = await mod.default.redirects();
    for (const bron of ["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"]) {
      const r = regels.find((x) => x.source === bron);
      expect(r, bron).toBeDefined();
      expect(r?.permanent, bron).toBe(true);
      expect(existsSync(path.join(process.cwd(), "public", r?.destination ?? "")), bron).toBe(true);
    }
  });
});

describe("POST /api/engagement", () => {
  const vraag = () => new Request("http://app:3000/api/engagement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "APP_OPEN" }) });

  it("zonder werkersprofiel: 200, niet geteld (geen 404)", async () => {
    h.profiel = null;
    const res = await POST(vraag());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, geteld: false });
  });

  it("met een profiel: gewoon geteld", async () => {
    h.profiel = { id: "fp1" };
    h.geteld = 0;
    const res = await POST(vraag());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, geteld: true });
    expect(h.geteld).toBe(1);
  });
});
