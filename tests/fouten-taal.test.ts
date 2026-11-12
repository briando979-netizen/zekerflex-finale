import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppError, toErrorBody } from "@/lib/errors";
import { FOUTEN, foutenVoor } from "@/lib/i18n/fouten";
import { vertaalFoutBody } from "@/lib/i18n/fout-vertaal";
import { installeer } from "@/components/app/FoutVertaler";

// Foutmeldingen van de server aan een werker, in zijn app-taal (12 nov 2026). De server blijft Nederlands antwoorden en geeft
// een vaste sleutel mee (error.sleutel, error.params); de werker-app vervangt de message. Statuscodes veranderen niet.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

/** Waar elke sleutel ontstaat: daar staat de Nederlandse tekst, en de sleutel. */
const PLEK: Record<string, string> = {
  apply: "lib/matching/apply.ts",
  elig: "lib/fiscal/eligibility.ts",
  onboarding: "lib/onboarding/werker-poort-server.ts",
  offer: "app/api/shifts/[shiftId]/offer/route.ts",
  fiscal: "app/api/me/fiscal/route.ts",
  payout: "app/api/me/payout/route.ts",
  checkin: "lib/timesheets/checkin.ts",
  doc: "app/api/onboarding/document-lezen/route.ts",
  common: "lib/errors.ts",
};

describe("de teksten", () => {
  it("minstens 25 meldingen, elk in alle vijf talen met dezelfde plaatshouders en echt vertaald", () => {
    const sleutels = Object.keys(FOUTEN);
    expect(sleutels.length).toBeGreaterThanOrEqual(25);
    for (const k of sleutels) {
      const t = FOUTEN[k]!;
      for (const taal of TALEN) {
        expect(t[taal].length, `${k} ${taal}`).toBeGreaterThan(5);
        expect(plaats(t[taal]), `${k} ${taal}`).toBe(plaats(t.nl));
        if (taal !== "nl" && t.nl.length > 25) expect(t[taal], `${k} ${taal}`).not.toBe(t.nl);
      }
    }
  });

  it("de Nederlandse tekst is gelijk aan de tekst op de plek waar de fout ontstaat, en de sleutel staat daar ook", () => {
    for (const [k, t] of Object.entries(FOUTEN)) {
      // "common.verzoek" staat in meerdere routes (hier de fiscale route); de twee algemene meldingen in lib/errors.ts
      const src = bron(k === "common.verzoek" ? "app/api/me/fiscal/route.ts" : PLEK[k.split(".")[0]!]!);
      expect(src, `${k}: sleutel`).toContain(`"${k}"`);
      // met plaatshouders staat de zin in de bron met een invulling; alleen de vaste stukken controleren
      if (!t.nl.includes("{")) expect(src, `${k}: tekst`).toContain(t.nl);
    }
    // de melding met plaatshouders: dezelfde zin als overlapMessageSelf
    expect(bron("lib/shifts/worker-overlap.ts")).toContain("Je staat dan al ingepland: ${o.title} bij ${o.branch} (${overlapWhen(o)}). Twee diensten tegelijk kan niet. Zeg die eerst af als je deze wilt doen.");
    expect(FOUTEN["apply.overlap"]!.nl).toBe("Je staat dan al ingepland: {titel} bij {filiaal} ({wanneer}). Twee diensten tegelijk kan niet. Zeg die eerst af als je deze wilt doen.");
  });

  it("de ONBOARDING_EERST-tekst is dezelfde als de Nederlandse sleutel", () => {
    expect(bron("lib/onboarding/werker-poort-server.ts")).toContain(`ONBOARDING_EERST = "${FOUTEN["onboarding.eerst"]!.nl}"`);
  });

  it("foutenVoor: Nederlands geeft niets (de message is al Nederlands), de andere talen alles", () => {
    expect(foutenVoor("nl")).toEqual({});
    for (const taal of ["en", "pl", "ro", "uk"] as const) expect(Object.keys(foutenVoor(taal)).length).toBe(Object.keys(FOUTEN).length);
  });
});

describe("de server: sleutel erbij, rest ongewijzigd", () => {
  it("een AppError met sleutel geeft dezelfde status, code en Nederlandse message, plus sleutel en params", () => {
    const { status, body } = toErrorBody(AppError.conflict("Deze dienst is al vol.").metSleutel("apply.vol"));
    expect(status).toBe(409);
    expect(body.error).toMatchObject({ code: "CONFLICT", message: "Deze dienst is al vol.", sleutel: "apply.vol" });
    const met = toErrorBody(AppError.conflict("x").metSleutel("apply.overlap", { titel: "Bar", filiaal: "Centrum", wanneer: "di 4 nov" }));
    expect(met.body.error.params).toEqual({ titel: "Bar", filiaal: "Centrum", wanneer: "di 4 nov" });
  });

  it("een fout zonder sleutel krijgt er geen; de statuscodes 412/422/423 blijven", () => {
    expect(toErrorBody(AppError.precondition("Rond eerst je aanmelding af.")).body.error).not.toHaveProperty("sleutel");
    expect(toErrorBody(AppError.precondition("x").metSleutel("onboarding.eerst")).status).toBe(412);
    expect(toErrorBody(AppError.validation("x").metSleutel("fiscal.bsnFout")).status).toBe(422);
    expect(new AppError("INTERNAL", "x", 423).metSleutel("a").status).toBe(423);
  });

  it("de algemene meldingen (ongeldige invoer, interne fout) hebben een sleutel", () => {
    const zod = toErrorBody({ name: "ZodError", issues: [] });
    expect(zod.status).toBe(422);
    expect(zod.body.error.sleutel).toBe("common.invoer");
    const intern = toErrorBody(new Error("boem"), { logged: true });
    expect(intern.status).toBe(500);
    expect(intern.body.error.sleutel).toBe("common.intern");
    expect(intern.body.error.message).not.toContain("boem");
  });
});

describe("vertaalFoutBody", () => {
  const pl = foutenVoor("pl");
  it("vervangt de message door de tekst in de taal, met de plaatshouders ingevuld", () => {
    const uit = vertaalFoutBody({ error: { code: "CONFLICT", message: "Deze dienst is al vol.", sleutel: "apply.vol" } }, pl) as { error: { message: string; code: string } };
    expect(uit.error.message).toBe(FOUTEN["apply.vol"]!.pl);
    expect(uit.error.code).toBe("CONFLICT");
    const o = vertaalFoutBody({ error: { code: "CONFLICT", message: "x", sleutel: "apply.overlap", params: { titel: "Bar", filiaal: "Centrum", wanneer: "di 4 nov 09:00–17:00" } } }, pl) as { error: { message: string } };
    expect(o.error.message).toContain("Bar");
    expect(o.error.message).toContain("Centrum");
    expect(o.error.message).not.toContain("{");
  });

  it("een onbekende sleutel, een body zonder sleutel of Nederlands (geen teksten) verandert niets", () => {
    expect(vertaalFoutBody({ error: { message: "Dit blijft", sleutel: "bestaat.niet" } }, pl)).toBeNull();
    expect(vertaalFoutBody({ error: { message: "Geen sleutel" } }, pl)).toBeNull();
    expect(vertaalFoutBody({ error: { message: "x", sleutel: "apply.vol" } }, {})).toBeNull();
    expect(vertaalFoutBody({ error: { message: "x", sleutel: "constructor" } }, pl)).toBeNull();
    expect(vertaalFoutBody("tekst", pl)).toBeNull();
    expect(vertaalFoutBody(null, pl)).toBeNull();
  });
});

describe("de fetch-vertaler in de browser", () => {
  const g = globalThis as unknown as { window?: unknown; __zfFoutVertaler?: unknown };
  const json = (status: number, body: unknown, soort = "application/json") => () => new Response(JSON.stringify(body), { status, headers: { "content-type": soort } });
  const zet = (maak: () => Response) => {
    const echt = async () => maak();
    const w = { fetch: echt, location: { href: "https://zf.test/dashboard/klussen", origin: "https://zf.test" } };
    g.window = w;
    return w;
  };
  afterEach(() => {
    delete g.window;
    delete g.__zfFoutVertaler;
  });

  it("een mislukte /api-aanroep met een bekende sleutel krijgt de tekst in de app-taal; status en kop blijven", async () => {
    const w = zet(json(409, { error: { code: "CONFLICT", message: "Deze dienst is al vol.", sleutel: "apply.vol" } }));
    installeer(foutenVoor("uk"));
    const res = await (w.fetch as unknown as (u: string) => Promise<Response>)("/api/shifts/s1/offer");
    expect(res.status).toBe(409);
    expect(res.headers.get("content-type")).toContain("json");
    expect((await res.json()).error.message).toBe(FOUTEN["apply.vol"]!.uk);
  });

  it("een geslaagd antwoord, een andere soort antwoord of een onbekende sleutel blijft onaangeroerd (Nederlands)", async () => {
    const ok = zet(json(200, { error: { sleutel: "apply.vol", message: "x" } }));
    installeer(foutenVoor("pl"));
    expect(await ((await (ok.fetch as unknown as (u: string) => Promise<Response>)("/api/x")).json())).toEqual({ error: { sleutel: "apply.vol", message: "x" } });
    delete g.window;
    delete g.__zfFoutVertaler;

    const onbekend = zet(json(422, { error: { message: "Blijft Nederlands", sleutel: "bestaat.niet" } }));
    installeer(foutenVoor("pl"));
    expect((await (await (onbekend.fetch as unknown as (u: string) => Promise<Response>)("/api/x")).json()).error.message).toBe("Blijft Nederlands");
    delete g.window;
    delete g.__zfFoutVertaler;

    const tekst = zet(json(500, "plain", "text/plain"));
    installeer(foutenVoor("pl"));
    expect(((await (tekst.fetch as unknown as (u: string) => Promise<Response>)("/api/x")) as Response).status).toBe(500);
  });

  it("een andere herkomst of een pad buiten /api wordt niet aangeraakt, en Nederlands (lege lijst) ook niet", async () => {
    const w = zet(json(409, { error: { message: "NL", sleutel: "apply.vol" } }));
    installeer(foutenVoor("pl"));
    const buiten = await (w.fetch as unknown as (u: string) => Promise<Response>)("https://ander.example/api/x");
    expect((await buiten.json()).error.message).toBe("NL");
    const pagina = await (w.fetch as unknown as (u: string) => Promise<Response>)("/dashboard/klussen");
    expect((await pagina.json()).error.message).toBe("NL");
    delete g.window;
    delete g.__zfFoutVertaler;

    const nl = zet(json(409, { error: { message: "NL", sleutel: "apply.vol" } }));
    installeer(foutenVoor("nl"));
    expect((await (await (nl.fetch as unknown as (u: string) => Promise<Response>)("/api/x")).json()).error.message).toBe("NL");
  });

  it("alleen de werker-layout plaatst de vertaler", () => {
    expect(bron("app/dashboard/layout.tsx")).toContain("<FoutVertaler texts={foutenVoor(locale)} />");
    for (const l of ["app/werkgever/layout.tsx", "app/admin/layout.tsx"]) expect(bron(l), l).not.toContain("FoutVertaler");
  });
});
