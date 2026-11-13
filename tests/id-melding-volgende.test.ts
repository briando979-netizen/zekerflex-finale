import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WerkerPoortFeiten } from "@/lib/onboarding/werker-poort";

// De melding "ID geverifieerd" wijst naar de eerste open stap van de aanmelding (13 nov 2026): hij linkte naar
// /dashboard/eerste-indruk, en die pagina stuurde 7 van de 20 werkers zonder uitleg terug naar Verificatie.

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  poort: null as unknown,
  pushes: [] as { title: string; body: string; data: Record<string, string> }[],
  mails: [] as { subject: string; text: string; html: string }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => ({ email: "jan@voorbeeld.nl", fullName: "Jan de Vries", kycStatus: "VERIFIED", disabledAt: null, memberships: [{ role: "FREELANCER" }] }) },
    keyValueStore: {
      findMany: async (a: { where: { key: { in: string[] } } }) => a.where.key.in.filter((k) => h.kv.has(k)).map((k) => ({ key: k, value: h.kv.get(k) })),
      findUnique: async (a: { where: { key: string } }) => (h.kv.has(a.where.key) ? { key: a.where.key, value: h.kv.get(a.where.key) } : null),
      upsert: async (a: { where: { key: string }; create: { value: unknown } }) => void h.kv.set(a.where.key, a.create.value),
    },
  },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], push: { title: string; body: string; data: Record<string, string> }) => (h.pushes.push(push), ids.length),
}));
vi.mock("@/lib/mail", async () => {
  const echt = await vi.importActual<typeof import("@/lib/mail")>("@/lib/mail");
  return { ...echt, sendMail: async (m: { subject: string; text: string; html: string }) => (h.mails.push(m), { id: "m", delivered: true, transport: "mailbox" }) };
});
vi.mock("@/lib/onboarding/kan-reageren", () => ({ kanReagerenOpKlussen: async () => ({ ok: false }) }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({
  werkerPoortStand: async () => {
    if (h.poort === "storing") throw new Error("db weg");
    return h.poort;
  },
}));

import { meldIdGeverifieerd } from "@/lib/onboarding/id-geverifieerd";
import { idMeldingVolgende, stapNaam } from "@/lib/onboarding/id-melding-volgende";
import { idGeverifieerdEmailT } from "@/lib/mail/werker/id-geverifieerd";
import { WORKER_PUSH } from "@/lib/i18n/worker-push";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { LOCALES } from "@/lib/i18n/config";

const af: WerkerPoortFeiten = {
  soortGekozen: true,
  branchesGekozen: true,
  gegevensIngevuld: true,
  identiteitIngestuurd: true,
  werkrechtIngevuld: true,
  tweestapAan: false,
  fotoGezet: true,
};

describe("idMeldingVolgende: de eerste open stap", () => {
  it("alles af, of onbekend (storing): zoals vroeger naar eerste indruk", () => {
    expect(idMeldingVolgende(af)).toEqual({ sleutel: null, open: 0, pad: "/dashboard/eerste-indruk" });
    expect(idMeldingVolgende(null)).toEqual({ sleutel: null, open: 0, pad: "/dashboard/eerste-indruk" });
  });
  it("alleen de foto open: naar de fotostap", () => {
    expect(idMeldingVolgende({ ...af, fotoGezet: false })).toEqual({ sleutel: "foto", open: 1, pad: "/dashboard/eerste-indruk?stap=foto" });
  });
  it("gegevens en foto open: eerst de gegevens, op Verificatie", () => {
    expect(idMeldingVolgende({ ...af, gegevensIngevuld: false, fotoGezet: false })).toEqual({ sleutel: "gegevens", open: 2, pad: "/dashboard/verificatie" });
  });
  it("branches open: naar de wizard bij de klussen", () => {
    expect(idMeldingVolgende({ ...af, branchesGekozen: false, gegevensIngevuld: false, fotoGezet: false })).toEqual({ sleutel: "branches", open: 3, pad: "/dashboard/klussen" });
    expect(idMeldingVolgende({ ...af, soortGekozen: false }).pad).toBe("/dashboard/klussen");
  });
  it("tweestap en werkrecht tellen niet (geen verplichte stap van de poort)", () => {
    expect(idMeldingVolgende({ ...af, tweestapAan: false, werkrechtIngevuld: false }).sleutel).toBeNull();
  });
});

describe("de teksten, in vijf talen", () => {
  it("de stapnaam is die van de wizard, met een kleine letter", () => {
    for (const taal of LOCALES) {
      const naam = FREELANCER_DICTS[taal].start.gegevensStep;
      expect(stapNaam("gegevens", taal)).toBe(naam.charAt(0).toLocaleLowerCase(taal) + naam.slice(1));
    }
    expect(stapNaam("gegevens", "nl")).toBe("je gegevens");
    expect(stapNaam("identiteit", "nl")).toBe("je ID");
  });
  it("de push noemt de stap en het aantal, en past in een melding", () => {
    for (const taal of LOCALES) {
      const een = WORKER_PUSH[taal].idOkVolgende(stapNaam("foto", taal), 1);
      const drie = WORKER_PUSH[taal].idOkVolgende(stapNaam("branches", taal), 3);
      expect(een, taal).toContain(stapNaam("foto", taal));
      expect(een, taal).toContain("1");
      expect(drie, taal).toContain(stapNaam("branches", taal));
      expect(drie, taal).toContain("3");
      expect(drie.length, taal).toBeLessThanOrEqual(180);
    }
    expect(WORKER_PUSH.nl.idOkVolgende("je gegevens", 1)).toBe("Nog 1 stap: je gegevens.");
    expect(WORKER_PUSH.nl.idOkVolgende("je gegevens", 2)).toBe("Nog 2 stappen, eerst: je gegevens.");
  });
  it("de mail met een open stap: de zin en een knop naar die stap; zonder: zoals hij was", () => {
    for (const taal of LOCALES) {
      const zin = WORKER_PUSH[taal].idOkVolgende(stapNaam("gegevens", taal), 2);
      const m = idGeverifieerdEmailT("Anna Kowalska", "https://zekerflex.com/", false, taal, { zin, pad: "/dashboard/verificatie" });
      expect(m.text, taal).toContain(zin);
      expect(m.text, taal).toContain("https://zekerflex.com/dashboard/verificatie");
      expect(m.html, taal).toContain('href="https://zekerflex.com/dashboard/verificatie"');
      expect(m.html, taal).not.toContain("eerste-indruk");
    }
    expect(idGeverifieerdEmailT("Anna Kowalska", "https://zekerflex.com", false, "nl").html).toContain("/dashboard/eerste-indruk");
  });
});

describe("meldIdGeverifieerd per stand", () => {
  beforeEach(() => {
    h.kv.clear();
    h.pushes.length = 0;
    h.mails.length = 0;
  });

  it("gegevens open: push en mail wijzen naar Verificatie en zeggen wat er nog moet", async () => {
    h.poort = { ...af, gegevensIngevuld: false, fotoGezet: false };
    expect(await meldIdGeverifieerd("u1")).toMatchObject({ verstuurd: true, push: 1, mail: true });
    expect(h.pushes[0]?.data["url"]).toBe("/dashboard/verificatie");
    expect(h.pushes[0]?.body).toBe("Nog 2 stappen, eerst: je gegevens.");
    expect(h.mails[0]?.text).toContain("Nog 2 stappen, eerst: je gegevens.");
    expect(h.mails[0]?.html).toContain("/dashboard/verificatie");
  });

  it("alleen de foto open: naar de fotostap", async () => {
    h.poort = { ...af, fotoGezet: false };
    await meldIdGeverifieerd("u2");
    expect(h.pushes[0]?.data["url"]).toBe("/dashboard/eerste-indruk?stap=foto");
    expect(h.pushes[0]?.body).toBe("Nog 1 stap: profielfoto.");
  });

  it("in de app-taal van de werker", async () => {
    h.poort = { ...af, branchesGekozen: false, fotoGezet: false };
    h.kv.set("werker-taal:u3", { locale: "pl" });
    await meldIdGeverifieerd("u3");
    expect(h.pushes[0]?.body).toBe(WORKER_PUSH.pl.idOkVolgende(stapNaam("branches", "pl"), 2));
    expect(h.pushes[0]?.data["url"]).toBe("/dashboard/klussen");
  });

  it("alles af of een storing bij het opzoeken: de melding van vroeger", async () => {
    h.poort = af;
    await meldIdGeverifieerd("u4");
    h.poort = "storing";
    await meldIdGeverifieerd("u5");
    for (const p of h.pushes) {
      expect(p.data["url"]).toBe("/dashboard/eerste-indruk");
      expect(p.body).toBe(WORKER_PUSH.nl.idOkBody);
    }
    expect(h.pushes).toHaveLength(2);
  });
});
