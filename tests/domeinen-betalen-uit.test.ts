import { beforeEach, describe, expect, it, vi } from "vitest";

// Online betalen (Stripe) staat dicht (11 nov 2026). De domeinzoeker belooft dan geen "Bestel en betaal" met iDEAL of
// kaart, maar laat een bedrijf aanvragen (contact binnen één werkdag); alleen het eerste jaar in de bundel bestelt
// het nog zelf (dat kost niets). En een aanvraag van een testadres mailt sales niet echt (AGENTS.md). 15 nov, da.

const h = vi.hoisted(() => ({ uit: null as null | { tot: string }, mails: [] as { to: string }[], leads: 0 }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined }));
vi.mock("@/lib/domeinen/beschikbaar", () => ({ beschikbaarheid: async () => "vrij" }));
vi.mock("@/lib/billing/stripe-betalen", () => ({ betalenUit: async () => h.uit }));
vi.mock("@/lib/rijschool/herkomst", () => ({ zelfdeHerkomst: () => true }));
vi.mock("@/lib/sales/leads", () => ({ createLead: async () => void h.leads++ }));
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string }) => void h.mails.push(m) }));


beforeEach(() => {
  h.uit = null;
  h.mails = [];
  h.leads = 0;
});

describe("zoeken zegt of online betalen kan", () => {
  it("betalen: true als de vlag niet staat, false als Stripe dicht is", async () => {
    const { GET } = await import("@/app/api/domeinen/zoek/route");
    const aan = (await (await GET(new Request("https://zekerflex.com/api/domeinen/zoek?naam=proefzaak"))).json()) as { betalen: boolean; resultaten: unknown[] };
    expect(aan.betalen).toBe(true);
    expect(aan.resultaten.length).toBeGreaterThan(0);
    h.uit = { tot: new Date(Date.now() + 3_600_000).toISOString() };
    const dicht = (await (await GET(new Request("https://zekerflex.com/api/domeinen/zoek?naam=proefzaak"))).json()) as { betalen: boolean };
    expect(dicht.betalen).toBe(false);
  });
});

describe("aanvragen", () => {
  const vraag = (email: string) =>
    new Request("https://zekerflex.com/api/domeinen/aanvraag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domein: "proefzaak.nl", soort: "registreren", naam: "Anna", email, consent: true }),
    });

  it("een testadres: de lead wel, de mail naar sales niet", async () => {
    const { POST } = await import("@/app/api/domeinen/aanvraag/route");
    const r = await POST(vraag("anna@zekerflex.test"));
    expect(r.status).toBe(200);
    expect(h.leads).toBe(1);
    expect(h.mails).toHaveLength(0);
  });

  it("een gewoon adres: lead én mail naar sales", async () => {
    const { POST } = await import("@/app/api/domeinen/aanvraag/route");
    const r = await POST(vraag("anna@proefzaak.nl"));
    expect(r.status).toBe(200);
    expect(h.leads).toBe(1);
    expect(h.mails).toHaveLength(1);
  });
});
