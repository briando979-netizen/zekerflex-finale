import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  aangemaakt: [] as Record<string, unknown>[],
  mails: [] as { to: string; subject: string; text: string; html: string; replyTo?: string }[],
  claims: new Set<string>(),
  redisStuk: false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rijschoolBericht: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.aangemaakt.push(data);
        return { id: `b${h.aangemaakt.length}`, ...data, gelezenOm: null, createdAt: new Date("2026-11-04T09:00:00Z") };
      }),
    },
  },
}));
vi.mock("@/lib/redis", () => ({
  claimIdempotency: vi.fn(async (sleutel: string) => {
    if (h.redisStuk) throw new Error("Redis weg");
    if (h.claims.has(sleutel)) return false;
    h.claims.add(sleutel);
    return true;
  }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (m: (typeof h.mails)[number]) => {
    h.mails.push(m);
    return { delivered: true };
  }),
}));

import { gesprekkenUit, schoonBericht, voorvertoning, type BerichtRij } from "@/lib/rijschool/berichten-lijst";
import { stuurBericht } from "@/lib/rijschool/berichten";
import type { Rijschool } from "@prisma/client";

const school = { id: "r1", naam: "Rijschool <Zon>", slug: "zon", kleur: "#1D4E89", email: "info@zon.example.com", telefoon: "0612345678" } as Rijschool;
const lisa = { id: "l1", rijschoolId: "r1", naam: "Lisa de Vries", email: "lisa@example.com" };

beforeEach(() => {
  h.aangemaakt.length = 0;
  h.mails.length = 0;
  h.claims.clear();
  h.redisStuk = false;
});

describe("schoonBericht", () => {
  it("haalt randen, stuurtekens en lege regels weg, maar houdt alinea's", () => {
    expect(schoonBericht("  Hoi!\r\n\r\n\r\n\r\nKan ik morgen?​\u0007  ")).toBe("Hoi!\n\nKan ik morgen?");
    expect(schoonBericht("regel 1   \nregel 2")).toBe("regel 1\nregel 2");
    expect(schoonBericht(" \n\t ")).toBe("");
  });
});

describe("gesprekkenUit", () => {
  const b = (id: string, leerlingId: string, at: string, vanLeerling: boolean, gelezen: boolean): BerichtRij & { leerlingId: string; leerlingNaam: string } => ({
    id, leerlingId, leerlingNaam: leerlingId.toUpperCase(), vanLeerling, afzender: "", tekst: id, at, gelezen,
  });

  it("één gesprek per leerling, nieuwste bovenaan, ongelezen alleen van de leerling", () => {
    const g = gesprekkenUit([
      b("3", "a", "2026-11-04T10:00:00Z", true, false),
      b("2", "b", "2026-11-04T09:00:00Z", false, false),
      b("1", "a", "2026-11-03T10:00:00Z", true, false),
      b("0", "a", "2026-11-02T10:00:00Z", true, true),
    ]);
    expect(g.map((x) => [x.leerlingId, x.laatste.id, x.ongelezen])).toEqual([
      ["a", "3", 2],
      ["b", "2", 0],
    ]);
  });
});

describe("voorvertoning", () => {
  it("maakt één regel en kort af met een beletselteken", () => {
    expect(voorvertoning("Hoi\n\nhoe gaat het?")).toBe("Hoi hoe gaat het?");
    expect(voorvertoning("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

describe("stuurBericht", () => {
  it("bewaart een bericht van de leerling en mailt de school, met antwoord naar de leerling", async () => {
    const rij = await stuurBericht(school, lisa, { leerling: true }, "  Kan mijn les van vrijdag <later>?  ");
    expect(rij).toMatchObject({ vanLeerling: true, tekst: "Kan mijn les van vrijdag <later>?", gelezen: false });
    expect(h.aangemaakt[0]).toMatchObject({ rijschoolId: "r1", leerlingId: "l1", vanLeerling: true, afzender: "" });
    expect(h.mails).toHaveLength(1);
    const m = h.mails[0]!;
    expect(m.to).toBe("info@zon.example.com");
    expect(m.replyTo).toBe("lisa@example.com");
    expect(m.subject).toBe("Bericht van Lisa de Vries");
    expect(m.text).toContain("/werkgever/rijschool?tab=berichten&leerling=l1");
    // de tekst van de leerling komt ontsnapt in de html
    expect(m.html).toContain("Kan mijn les van vrijdag &lt;later&gt;?");
    expect(m.html).not.toContain("<later>");
  });

  it("mailt de leerling met de naam van wie namens de school schreef", async () => {
    await stuurBericht(school, lisa, { leerling: false, afzender: "Jan" }, "Ja, om 15:00 kan.");
    expect(h.aangemaakt[0]).toMatchObject({ vanLeerling: false, afzender: "Jan" });
    const m = h.mails[0]!;
    expect(m.to).toBe("lisa@example.com");
    expect(m.subject).toBe("Nieuw bericht van Rijschool <Zon>");
    expect(m.text).toContain("Jan van Rijschool <Zon> stuurde je een bericht");
    expect(m.text).toContain("/rijschool/zon/leerling?tab=berichten");
    expect(m.html).toContain("Rijschool &lt;Zon&gt;");
  });

  it("stuurt hoogstens één seintje per kwartier per gesprek en richting", async () => {
    await stuurBericht(school, lisa, { leerling: true }, "een");
    await stuurBericht(school, lisa, { leerling: true }, "twee");
    await stuurBericht(school, lisa, { leerling: false, afzender: "Jan" }, "antwoord");
    expect(h.aangemaakt).toHaveLength(3);
    expect(h.mails.map((m) => m.to)).toEqual(["info@zon.example.com", "lisa@example.com"]);
  });

  it("mailt toch als Redis weg is (liever een seintje te veel)", async () => {
    h.redisStuk = true;
    await stuurBericht(school, lisa, { leerling: true }, "hallo");
    await stuurBericht(school, lisa, { leerling: true }, "nog een");
    expect(h.mails).toHaveLength(2);
  });

  it("weigert een leeg bericht, een te lang bericht en een leerling van een andere school", async () => {
    await expect(stuurBericht(school, lisa, { leerling: true }, " \n ")).rejects.toThrow("Schrijf eerst een bericht.");
    await expect(stuurBericht(school, lisa, { leerling: true }, "x".repeat(2001))).rejects.toThrow("hoogstens 2000 tekens");
    await expect(stuurBericht(school, { ...lisa, rijschoolId: "ander" }, { leerling: true }, "hoi")).rejects.toThrow("Leerling niet gevonden.");
    expect(h.aangemaakt).toHaveLength(0);
  });

  it("zonder e-mailadres van de school geen mail, het bericht staat er wel", async () => {
    await stuurBericht({ ...school, email: "" }, lisa, { leerling: true }, "hoi");
    expect(h.aangemaakt).toHaveLength(1);
    expect(h.mails).toHaveLength(0);
  });
});
