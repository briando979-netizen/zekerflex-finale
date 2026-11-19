import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Deel 4 van het SmileyApp-voorstel (19 nov 2026): reviews die het team zelf in
// het beheer invoert en die de site toont. Geen koppeling met Google of een
// betaalde dienst. Deze test bewaakt de regels (puur), de opslag (met een KV in
// het geheugen), de route (herkomst, limiet, sessie) en in de broncode: het
// blok bestaat alleen met een zichtbare review, er gaan geen gegevens voor
// zoekmachines mee (geen JSON-LD) en de link naar de bron heeft nofollow.
// De reviews hieronder zijn testgegevens die alleen in het geheugen van deze
// test staan; er staat nergens in de code een review die op de site kan komen.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  jar: new Map<string, string>(),
  principal: null as { userId: string; fullName: string; rollen: string[] } | null,
  kvKapot: false,
}));

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "geheim-voor-de-test-van-minstens-32-tekens", APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/storage/kv", () => {
  const kopie = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const rijen = (prefix: string) => {
    if (h.kvKapot) throw new Error("geen verbinding");
    return [...h.kv.entries()].filter(([k]) => k.startsWith(prefix));
  };
  return {
    kvGet: async (k: string) => (h.kv.has(k) ? kopie(h.kv.get(k)) : null),
    kvSet: async (k: string, v: unknown) => void h.kv.set(k, kopie(v)),
    kvDelete: async (k: string) => void h.kv.delete(k),
    kvListValues: async (prefix: string) => rijen(prefix).map(([, v]) => kopie(v)),
    kvListEntries: async (prefix: string) => rijen(prefix).map(([key, value]) => ({ key, value: kopie(value) })),
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (naam: string) => (h.jar.has(naam) ? { name: naam, value: h.jar.get(naam) } : undefined),
    set: (naam: string, waarde: string) => void h.jar.set(naam, waarde),
    delete: (naam: string) => void h.jar.delete(naam),
  }),
}));
vi.mock("@/lib/auth", () => ({
  getPrincipal: async () => h.principal,
  hasRole: (p: { rollen: string[] }, ...rollen: string[]) => rollen.some((r) => p.rollen.includes(r)),
}));
vi.mock("@/lib/mail", () => ({ sendMail: async () => ({ id: "t", delivered: true, transport: "mailbox" }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({ ok: true }), fixedWindow: async () => ({ ok: true }) }));
vi.mock("@/lib/voorstel/smileyapp-cijfers", () => ({ telWeergave: async () => undefined, telDemoAanvraag: async () => undefined, smileyappCijfers: async () => ({}) }));

import { AppError } from "@/lib/errors";
import {
  LINK_MAX,
  NAAM_MAX,
  ORGANISATIE_MAX,
  REVIEWS_GETOOND,
  REVIEWS_MAX,
  REVIEWS_NL,
  REVIEW_BRONNEN,
  TEKST_MAX,
  alsReviewInvoer,
  bronLinkTekst,
  bronTekst,
  cijferTekst,
  isReview,
  leesBronLink,
  reviewDatum,
  reviewOverzicht,
  samenvattingTekst,
  sterrenBreedte,
  sterrenTekst,
  valideerReview,
  type Review,
  type ReviewInvoer,
} from "@/lib/voorstel/smileyapp-review-regels";
import { alleReviews, bewaarReview, reviewsVoorSite, verwijderReview } from "@/lib/voorstel/smileyapp-reviews";
import { TEKSTEN, VERTALINGEN } from "@/lib/voorstel/smileyapp-talen";

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const NU = new Date("2026-11-19T10:00:00+01:00"); // donderdag
const VANDAAG = "2026-11-19";
const TESTTEKST = "Dit is alleen tekst voor de test, geen echte review.";
const goed: ReviewInvoer = { naam: "  Testnaam   A ", organisatie: " Testorganisatie ", sterren: 5, tekst: `  ${TESTTEKST}  `, bron: "Google", bronLink: " https://voorbeeld.test/review/1 ", datum: "2026-11-18", zichtbaar: true };
const review = (o: Partial<Review> = {}): Review => ({ id: "a".repeat(16), naam: "Testnaam A", sterren: 5, tekst: TESTTEKST, bron: "Google", zichtbaar: true, aangemaakt: "2026-11-10T09:00:00.000Z", ...o });

async function fout(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("er kwam geen fout");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  h.kv.clear();
  h.jar.clear();
  h.principal = null;
  h.kvKapot = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("de regels van een review", () => {
  it("een goede review: witruimte weg, lege velden niet in de opslag", () => {
    expect(valideerReview(goed, VANDAAG)).toEqual({
      ok: true,
      waarde: { naam: "Testnaam A", organisatie: "Testorganisatie", sterren: 5, tekst: TESTTEKST, bron: "Google", bronLink: "https://voorbeeld.test/review/1", datum: "2026-11-18", zichtbaar: true },
    });
    const kaal = valideerReview({ ...goed, organisatie: " ", bronLink: "", datum: "", zichtbaar: false }, VANDAAG);
    expect(kaal).toEqual({ ok: true, waarde: { naam: "Testnaam A", sterren: 5, tekst: TESTTEKST, bron: "Google", zichtbaar: false } });
    for (const bron of REVIEW_BRONNEN) expect(valideerReview({ ...goed, bron }, VANDAAG), bron).toMatchObject({ ok: true, waarde: { bron } });
    expect(REVIEW_BRONNEN).toEqual(["Google", "Trustpilot", "E-mail", "Anders"]);
  });

  it("naam 2 tot 60 tekens, organisatie hooguit 80, tekst 20 tot 600", () => {
    expect([NAAM_MAX, ORGANISATIE_MAX, TEKST_MAX, LINK_MAX, REVIEWS_MAX, REVIEWS_GETOOND]).toEqual([60, 80, 600, 300, 60, 6]);
    expect(valideerReview({ ...goed, naam: " A " }, VANDAAG)).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerReview({ ...goed, naam: "Jo" }, VANDAAG)).toMatchObject({ ok: true });
    expect(valideerReview({ ...goed, naam: "x".repeat(60) }, VANDAAG)).toMatchObject({ ok: true });
    expect(valideerReview({ ...goed, naam: "x".repeat(61) }, VANDAAG)).toMatchObject({ ok: false, veld: "naam" });
    expect(valideerReview({ ...goed, organisatie: "x".repeat(80) }, VANDAAG)).toMatchObject({ ok: true });
    expect(valideerReview({ ...goed, organisatie: "x".repeat(81) }, VANDAAG)).toMatchObject({ ok: false, veld: "organisatie" });
    expect(valideerReview({ ...goed, tekst: "x".repeat(19) }, VANDAAG)).toMatchObject({ ok: false, veld: "tekst" });
    expect(valideerReview({ ...goed, tekst: "x".repeat(20) }, VANDAAG)).toMatchObject({ ok: true });
    expect(valideerReview({ ...goed, tekst: "x".repeat(600) }, VANDAAG)).toMatchObject({ ok: true });
    expect(valideerReview({ ...goed, tekst: "x".repeat(601) }, VANDAAG)).toMatchObject({ ok: false, veld: "tekst" });
  });

  it("sterren: alleen een geheel getal van 1 tot en met 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(valideerReview({ ...goed, sterren: n }, VANDAAG), String(n)).toMatchObject({ ok: true, waarde: { sterren: n } });
    for (const n of [0, 6, -1, 4.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(valideerReview({ ...goed, sterren: n }, VANDAAG), String(n)).toMatchObject({ ok: false, veld: "sterren" });
  });

  it("de bron komt uit de vaste lijst; 'constructor' is geen bron", () => {
    for (const bron of ["", "google", "Facebook", "constructor", "toString"]) expect(valideerReview({ ...goed, bron }, VANDAAG), bron).toMatchObject({ ok: false, veld: "bron" });
  });

  it("de link naar de bron: alleen https; een http-link wordt geweigerd", () => {
    expect(valideerReview({ ...goed, bronLink: "http://voorbeeld.test/review/1" }, VANDAAG)).toMatchObject({ ok: false, veld: "bronLink" });
    for (const link of ["javascript:alert(1)", "//voorbeeld.test/x", "voorbeeld.test/x", "ftp://voorbeeld.test/x", "https://", "https://localhost/x", "https://gebruiker:geheim@voorbeeld.test/x", "https://voorbeeld.test/een pad", "data:text/html,x"]) {
      expect(valideerReview({ ...goed, bronLink: link }, VANDAAG), link).toMatchObject({ ok: false, veld: "bronLink" });
      expect(leesBronLink(link), link).toBeNull();
    }
    expect(leesBronLink("HTTPS://Voorbeeld.test/Review?x=1")).toBe("https://voorbeeld.test/Review?x=1");
    const lang = `https://voorbeeld.test/${"x".repeat(LINK_MAX)}`;
    expect(valideerReview({ ...goed, bronLink: lang }, VANDAAG)).toMatchObject({ ok: false, veld: "bronLink" });
    expect(leesBronLink(`https://voorbeeld.test/${"x".repeat(LINK_MAX - 23)}`)).not.toBeNull();
  });

  it("de datum: een echte dag, en niet in de toekomst (de Nederlandse dag telt)", () => {
    expect(valideerReview({ ...goed, datum: VANDAAG }, VANDAAG)).toMatchObject({ ok: true, waarde: { datum: VANDAAG } });
    expect(valideerReview({ ...goed, datum: "2026-11-20" }, VANDAAG)).toMatchObject({ ok: false, veld: "datum" });
    expect(valideerReview({ ...goed, datum: "2027-01-01" }, VANDAAG)).toMatchObject({ ok: false, veld: "datum" });
    for (const d of ["2026-02-31", "18-11-2026", "gisteren"]) expect(valideerReview({ ...goed, datum: d }, VANDAAG), d).toMatchObject({ ok: false, veld: "datum" });
  });

  it("een rij uit de opslag die niet klopt, telt niet als review", () => {
    expect(isReview(review())).toBe(true);
    expect(isReview(review({ organisatie: "Testorganisatie", bronLink: "https://voorbeeld.test/x", datum: "2026-11-01" }))).toBe(true);
    for (const kapot of [null, "tekst", {}, { ...review(), sterren: 6 }, { ...review(), sterren: "5" }, { ...review(), bron: "Facebook" }, { ...review(), id: "../x" }, { ...review(), zichtbaar: "ja" }, { ...review(), bronLink: "http://voorbeeld.test/x" }, { ...review(), datum: "morgen" }, { ...review(), naam: "" }]) {
      expect(isReview(kapot), JSON.stringify(kapot)).toBe(false);
    }
    expect(alsReviewInvoer(review())).toEqual({ naam: "Testnaam A", organisatie: "", sterren: 5, tekst: TESTTEKST, bron: "Google", bronLink: "", datum: "", zichtbaar: true });
  });
});

describe("wat de site toont", () => {
  const id = (n: number) => n.toString(16).padStart(16, "0");

  it("zonder zichtbare review is er niets: geen gemiddelde, geen aantal, geen kaarten", () => {
    expect(reviewOverzicht([])).toBeNull();
    expect(reviewOverzicht([review({ zichtbaar: false }), review({ id: id(2), zichtbaar: false, sterren: 1 })])).toBeNull();
  });

  it("gemiddelde en aantal alleen over zichtbare reviews, op één decimaal", () => {
    const lijst = [review({ id: id(1), sterren: 5 }), review({ id: id(2), sterren: 4 }), review({ id: id(3), sterren: 4 }), review({ id: id(4), sterren: 1, zichtbaar: false })];
    const o = reviewOverzicht(lijst);
    expect(o?.aantal).toBe(3);
    expect(o?.gemiddelde).toBe(4.3);
    expect(o?.getoond.map((r) => r.id)).not.toContain(id(4));
    expect(reviewOverzicht([review({ sterren: 5 }), review({ id: id(2), sterren: 4 })])?.gemiddelde).toBe(4.5);
    expect(reviewOverzicht([review({ sterren: 3 })])).toMatchObject({ gemiddelde: 3, aantal: 1 });
  });

  it("hooguit zes kaarten, nieuwste review eerst; het gemiddelde telt ze allemaal", () => {
    const lijst = Array.from({ length: 9 }, (_, i) => review({ id: id(i + 1), sterren: i < 8 ? 5 : 1, datum: `2026-11-0${i + 1}`, aangemaakt: "2026-11-10T09:00:00.000Z" }));
    const o = reviewOverzicht(lijst);
    expect(o?.getoond).toHaveLength(6);
    expect(o?.getoond.map((r) => r.datum)).toEqual(["2026-11-09", "2026-11-08", "2026-11-07", "2026-11-06", "2026-11-05", "2026-11-04"]);
    expect(o?.aantal).toBe(9);
    expect(o?.gemiddelde).toBe(4.6);
    // zonder eigen datum sorteert een review op de dag waarop hij is ingevoerd
    const gemengd = reviewOverzicht([review({ id: id(1), datum: "2026-10-01" }), review({ id: id(2), aangemaakt: "2026-11-12T09:00:00.000Z" }), review({ id: id(3), datum: "2026-11-15" })]);
    expect(gemengd?.getoond.map((r) => r.id)).toEqual([id(3), id(2), id(1)]);
    // de invoer zelf blijft zoals hij was
    expect(lijst[0]?.datum).toBe("2026-11-01");
  });

  it("de tekst naast de sterren, in drie talen", () => {
    expect(samenvattingTekst({ gemiddelde: 4.6, aantal: 12 })).toBe("4,6 van 5 sterren uit 12 reviews");
    expect(samenvattingTekst({ gemiddelde: 5, aantal: 1 })).toBe("5,0 van 5 sterren uit 1 review");
    expect(samenvattingTekst({ gemiddelde: 4.6, aantal: 12 }, TEKSTEN.en.reviews, "en")).toBe("4.6 out of 5 stars from 12 reviews");
    expect(samenvattingTekst({ gemiddelde: 4.6, aantal: 12 }, TEKSTEN.de.reviews, "de")).toBe("4,6 von 5 Sternen aus 12 Bewertungen");
    expect(samenvattingTekst({ gemiddelde: 4, aantal: 1 }, TEKSTEN.de.reviews, "de")).toBe("4,0 von 5 Sternen aus 1 Bewertung");
    expect([cijferTekst(4), cijferTekst(4.26, "en")]).toEqual(["4,0", "4.3"]);
    expect(sterrenTekst(4)).toBe("4 van 5 sterren");
    expect(bronTekst("E-mail")).toBe("Bron: e-mail");
    expect(bronLinkTekst("Google")).toBe("Bekijk de review bij de bron (Google)");
    expect(REVIEWS_NL.kop).toBe("Zo beoordelen klanten Smileyapp");
    expect(REVIEWS_NL.voet).toBe("Reviews door Smileyapp zelf overgenomen uit de genoemde bron.");
    expect([reviewDatum("2026-11-03"), reviewDatum("2026-11-03", "en"), reviewDatum("2026-11-03", "de"), reviewDatum("geen")]).toEqual(["3 november 2026", "3 November 2026", "3. November 2026", ""]);
    expect([sterrenBreedte(5), sterrenBreedte(4.6), sterrenBreedte(0), sterrenBreedte(9)]).toEqual([100, 92, 0, 100]);
  });

  it("Engels en Duits hebben dezelfde sleutels als het Nederlands, zonder lege waarde en met dezelfde invulplekken", () => {
    const plat = (o: object, pad = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]): [string, string][] => (typeof v === "object" && v !== null ? plat(v as object, `${pad}${k}.`) : [[`${pad}${k}`, String(v)]]));
    const plekken = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
    const nl = new Map(plat(REVIEWS_NL));
    expect(nl.size).toBeGreaterThanOrEqual(13);
    for (const t of VERTALINGEN) {
      const x = new Map(plat(TEKSTEN[t].reviews));
      expect([...x.keys()].sort(), t).toEqual([...nl.keys()].sort());
      for (const [sleutel, waarde] of x) {
        expect(waarde.trim(), `${t}: ${sleutel}`).not.toBe("");
        expect(plekken(waarde), `${t}: ${sleutel}`).toEqual(plekken(nl.get(sleutel) ?? ""));
      }
    }
  });
});

describe("de opslag", () => {
  it("bewaren, wijzigen, verbergen en verwijderen", async () => {
    expect(await reviewsVoorSite()).toBeNull();
    const a = await bewaarReview(undefined, goed, "Sanne", NU);
    expect(a).toEqual({ id: a.id, naam: "Testnaam A", organisatie: "Testorganisatie", sterren: 5, tekst: TESTTEKST, bron: "Google", bronLink: "https://voorbeeld.test/review/1", datum: "2026-11-18", zichtbaar: true, aangemaakt: "2026-11-19T09:00:00.000Z", door: "Sanne" });
    expect(a.id).toMatch(/^[a-f0-9]{16}$/);
    expect([...h.kv.keys()]).toEqual([`voorstel-smileyapp:review:${a.id}`]);
    expect(await reviewsVoorSite()).toMatchObject({ gemiddelde: 5, aantal: 1 });

    // wijzigen: een leeggemaakt veld verdwijnt uit de opslag, de aanmaakdatum blijft
    const later = new Date("2026-11-20T08:00:00+01:00");
    const b = await bewaarReview(a.id, { ...goed, organisatie: "", bronLink: "", sterren: 4 }, "Martijn", later);
    expect(b).toEqual({ id: a.id, naam: "Testnaam A", sterren: 4, tekst: TESTTEKST, bron: "Google", datum: "2026-11-18", zichtbaar: true, aangemaakt: a.aangemaakt, door: "Martijn" });
    expect(h.kv.get(`voorstel-smileyapp:review:${a.id}`)).toEqual(b);

    // verbergen: de review blijft bewaard, maar de site toont niets meer
    await bewaarReview(a.id, { ...alsReviewInvoer(b), zichtbaar: false }, "Martijn", later);
    expect(await alleReviews()).toHaveLength(1);
    expect(await reviewsVoorSite()).toBeNull();

    expect((await fout(bewaarReview("0".repeat(16), goed, "Sanne", NU))).status).toBe(404);
    expect((await fout(bewaarReview("../account:x", goed, "Sanne", NU))).status).toBe(404);
    await verwijderReview(a.id);
    expect(h.kv.size).toBe(0);
    expect((await fout(verwijderReview(a.id))).status).toBe(404);
  });

  it("een fout bewaart niets: toekomstige datum (Nederlandse dag) en http-link", async () => {
    const morgen = await fout(bewaarReview(undefined, { ...goed, datum: "2026-11-20" }, "Sanne", NU));
    expect([morgen.status, morgen.details]).toEqual([422, { veld: "datum" }]);
    const http = await fout(bewaarReview(undefined, { ...goed, bronLink: "http://voorbeeld.test/x" }, "Sanne", NU));
    expect([http.status, http.details]).toEqual([422, { veld: "bronLink" }]);
    expect(h.kv.size).toBe(0);
    // om 00:30 Nederlandse tijd is het in UTC nog de 19e, maar de 20e mag dan wel
    expect((await bewaarReview(undefined, { ...goed, datum: "2026-11-20" }, "Sanne", new Date("2026-11-20T00:30:00+01:00"))).datum).toBe("2026-11-20");
  });

  it("hooguit 60 reviews; een bestaande wijzigen kan dan nog wel", async () => {
    for (let i = 0; i < REVIEWS_MAX; i += 1) h.kv.set(`voorstel-smileyapp:review:${i.toString(16).padStart(16, "0")}`, review({ id: i.toString(16).padStart(16, "0") }));
    const vol = await fout(bewaarReview(undefined, goed, "Sanne", NU));
    expect(vol.status).toBe(422);
    expect(vol.message).toContain("60 reviews");
    expect(h.kv.size).toBe(REVIEWS_MAX);
    expect((await bewaarReview("0".repeat(16), { ...goed, sterren: 3 }, "Sanne", NU)).sterren).toBe(3);
  });

  it("een kapotte rij of een opslag die niet antwoordt haalt de site niet onderuit: dan is er geen blok", async () => {
    h.kv.set("voorstel-smileyapp:review:kapot", "geen review");
    h.kv.set(`voorstel-smileyapp:review:${"b".repeat(16)}`, { ...review({ id: "b".repeat(16) }), sterren: 9 });
    expect(await alleReviews()).toEqual([]);
    expect(await reviewsVoorSite()).toBeNull();
    h.kv.set(`voorstel-smileyapp:review:${"c".repeat(16)}`, review({ id: "c".repeat(16), sterren: 4 }));
    expect(await reviewsVoorSite()).toMatchObject({ gemiddelde: 4, aantal: 1 });
    h.kvKapot = true;
    expect(await reviewsVoorSite()).toBeNull();
  });
});

describe("de route van het beheer", () => {
  const URL_INHOUD = "http://app:3000/api/voorstel/smileyapp/beheer/inhoud";
  const KOPPEN = { "x-forwarded-host": "smileyapp.zekerflex.com", origin: "https://smileyapp.zekerflex.com" };
  type Antwoord = { status: number; json: { reviews?: Review[]; error?: { message?: string; details?: { veld?: string } } } };
  const haal = async (koppen: Record<string, string> = KOPPEN): Promise<Antwoord> => {
    const { GET } = await import("@/app/api/voorstel/smileyapp/beheer/inhoud/route");
    const res = await GET(new Request(`${URL_INHOUD}?deel=reviews`, { headers: koppen }));
    return { status: res.status, json: (await res.json()) as Antwoord["json"] };
  };
  const stuur = async (body: unknown, koppen: Record<string, string> = {}): Promise<Antwoord> => {
    const { POST } = await import("@/app/api/voorstel/smileyapp/beheer/inhoud/route");
    const res = await POST(new Request(URL_INHOUD, { method: "POST", headers: { "content-type": "application/json", ...KOPPEN, ...koppen }, body: JSON.stringify(body) }));
    return { status: res.status, json: (await res.json()) as Antwoord["json"] };
  };
  const invoer = { actie: "review-bewaren", naam: "Testnaam A", organisatie: "", sterren: 4, tekst: TESTTEKST, bron: "Trustpilot", bronLink: "", datum: "", zichtbaar: true };

  it("zonder sessie: 401, en er wordt niets bewaard", async () => {
    expect((await haal()).status).toBe(401);
    expect((await stuur(invoer)).status).toBe(401);
    expect((await stuur({ actie: "review-verwijderen", id: "a".repeat(16) })).status).toBe(401);
    expect(h.kv.size).toBe(0);
  });

  it("met sessie: toevoegen, zichtbaar uitzetten en verwijderen; elk antwoord is de lijst van de server", async () => {
    h.principal = { userId: "u1", fullName: "Eigenaar ZekerFlex", rollen: ["PLATFORM_ADMIN"] };
    expect(await haal()).toEqual({ status: 200, json: { reviews: [] } });
    const na = await stuur(invoer);
    expect(na.status).toBe(200);
    expect(na.json.reviews).toHaveLength(1);
    const r = na.json.reviews?.[0];
    expect(r).toMatchObject({ naam: "Testnaam A", sterren: 4, bron: "Trustpilot", zichtbaar: true, door: "Eigenaar ZekerFlex" });
    expect(await haal()).toEqual({ status: 200, json: na.json });
    const uit = await stuur({ ...invoer, id: r?.id, zichtbaar: false });
    expect(uit.json.reviews?.map((x) => [x.id, x.zichtbaar])).toEqual([[r?.id, false]]);
    expect(await reviewsVoorSite()).toBeNull();
    expect(await stuur({ actie: "review-verwijderen", id: r?.id })).toEqual({ status: 200, json: { reviews: [] } });
    expect(h.kv.size).toBe(0);
  });

  it("weigert een andere website, geen JSON, een verkeerde vorm en wat de regels afkeuren; zegt welk veld", async () => {
    h.principal = { userId: "u1", fullName: "Eigenaar ZekerFlex", rollen: ["PLATFORM_ADMIN"] };
    expect((await stuur(invoer, { origin: "https://evil.example" })).status).toBe(403);
    expect((await haal({ ...KOPPEN, origin: "https://evil.example" })).status).toBe(403);
    expect((await stuur(invoer, { "content-type": "text/plain" })).status).toBe(422);
    expect((await stuur({ ...invoer, sterren: "5" })).status).toBe(422);
    expect((await stuur({ ...invoer, zichtbaar: "ja" })).status).toBe(422);
    expect((await stuur({ ...invoer, id: "../x" })).status).toBe(422);
    const http = await stuur({ ...invoer, bronLink: "http://voorbeeld.test/x" });
    expect([http.status, http.json.error?.details?.veld]).toEqual([422, "bronLink"]);
    const morgen = await stuur({ ...invoer, datum: "2026-11-20" });
    expect([morgen.status, morgen.json.error?.details?.veld]).toEqual([422, "datum"]);
    const zes = await stuur({ ...invoer, sterren: 6 });
    expect([zes.status, zes.json.error?.details?.veld]).toEqual([422, "sterren"]);
    expect(h.kv.size).toBe(0);
  });
});

describe("bronbewakers", () => {
  const BLOK = "components/voorstel/smileyapp/ReviewBlok.tsx";
  const NIEUW = [BLOK, "components/voorstel/smileyapp/beheer/ReviewsBeheer.tsx", "lib/voorstel/smileyapp-review-regels.ts", "lib/voorstel/smileyapp-reviews.ts"];
  const ROUTE = "app/api/voorstel/smileyapp/beheer/inhoud/route.ts";
  const handlers = (s: string) => s.split(/\nexport async function /).slice(1);

  it("het blok bestaat alleen met een zichtbare review: geen kop, geen lege sterren, geen voorbeeld", () => {
    const blok = lees(BLOK);
    expect(blok).toContain("const overzicht = await reviewsVoorSite();");
    expect(blok).toContain("if (!overzicht) return null;");
    // de voorwaarde staat vóór alles wat het blok tekent
    expect(blok.indexOf("if (!overzicht) return null;")).toBeLessThan(blok.indexOf("<section"));
    expect(blok.indexOf("if (!overzicht) return null;")).toBeLessThan(blok.indexOf("<Kopje"));
    const regels = lees("lib/voorstel/smileyapp-review-regels.ts");
    expect(regels).toContain("const zichtbaar = alle.filter((r) => r.zichtbaar);");
    expect(regels).toContain("if (zichtbaar.length === 0 || cijfer === null) return null;");
    expect(lees("lib/voorstel/smileyapp-reviews.ts")).toContain("return reviewOverzicht(await alleReviews().catch(() => []));");
    // er staat nergens een review in de code: geen lijst met namen, teksten of sterren als standaard
    // (het lege formulier in het beheer heeft tekst: "" en naam: "": dat is geen review)
    for (const f of NIEUW) expect(lees(f), f).not.toMatch(/VOORBEELD|voorbeeldreview|const REVIEWS\s*[:=]|\btekst: "[^"]|\bnaam: "[^"]/);
  });

  it("het blok staat op de voorpagina, bovenaan de klantverhalen en op de vertaalde voorpagina's", () => {
    const home = lees("app/voorstel/smileyapp/page.tsx");
    expect(home.match(/<ReviewBlok \/>/g)).toHaveLength(1);
    expect(home.indexOf("<ReviewBlok />")).toBeLessThan(home.indexOf('<section id="klanten"'));
    const klanten = lees("app/voorstel/smileyapp/klanten/page.tsx");
    expect(klanten.match(/<ReviewBlok \/>/g)).toHaveLength(1);
    expect(klanten.indexOf("<ReviewBlok />")).toBeLessThan(klanten.indexOf("{VERHALEN.map("));
    // zonder dit maakt de build de pagina één keer, zonder database, en verschijnt een review nooit
    expect(klanten).toContain('export const dynamic = "force-dynamic";');
    expect(home).toContain('export const dynamic = "force-dynamic";');
    const landing = lees("components/voorstel/smileyapp/taal/Landing.tsx");
    expect(landing.match(/<ReviewBlok taal=\{taal\} \/>/g)).toHaveLength(1);
    for (const t of VERTALINGEN) expect(lees(`app/voorstel/smileyapp/${t}/page.tsx`), t).toContain('export const dynamic = "force-dynamic";');
    expect(lees(BLOK)).toContain("const t = taal === \"nl\" ? REVIEWS_NL : TEKSTEN[taal].reviews;");
  });

  it("toegankelijk: de sterren zijn versiering, het cijfer staat er als tekst bij", () => {
    const blok = lees(BLOK);
    expect(blok.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(blok).toContain("{samenvattingTekst(overzicht, t, taal)}");
    expect(blok).toContain('<span className="sr-only">{sterrenTekst(r.sterren, t)}</span>');
    // elke regel met sterren-tekens is verborgen voor een schermlezer of staat erbinnen
    expect(blok).not.toMatch(/aria-label=/);
    expect(blok).toContain("{t.voet}");
    expect(blok).toContain("{r.tekst}");
    // geen kop van het eerste niveau en geen formulier
    for (const f of NIEUW) expect(lees(f), f).not.toMatch(/<h1[\s>]|<form[\s>]/);
  });

  it("de link naar de bron: nieuw tabblad, rel met noopener en nofollow, en een duidelijke linktekst", () => {
    const blok = lees(BLOK);
    const links = blok.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain("href={r.bronLink}");
    expect(links[0]).toContain('target="_blank"');
    expect(links[0]).toContain('rel="noopener nofollow"');
    expect(blok).toContain("{bronLinkTekst(r.bron, t)}");
    expect(blok).toContain("{t.nieuwVenster}");
    expect(blok).toContain("{r.bronLink && (");
    // ook in het beheer volgt een zoekmachine de link niet
    expect(lees("components/voorstel/smileyapp/beheer/ReviewsBeheer.tsx")).toMatch(/href=\{r\.bronLink\} target="_blank" rel="[^"]*nofollow[^"]*"/);
  });

  it("geen gegevens voor zoekmachines in de nieuwe bestanden: geen JSON-LD, geen canonical", () => {
    for (const f of [...NIEUW, ROUTE, "app/voorstel/smileyapp/klanten/page.tsx", "app/voorstel/smileyapp/page.tsx", "components/voorstel/smileyapp/taal/Landing.tsx"]) {
      const s = lees(f);
      expect(s, f).not.toMatch(/application\/ld\+json|ldJson\(|JSON\.stringify\([^)]*\)\s*\}\s*<\/script|<script/);
      expect(s, f).not.toMatch(/itemProp|itemScope|itemType|schema\.org/);
      expect(s, f).not.toMatch(/canonical\(|alternates/);
    }
  });

  it("de route: herkomst en limiet (de poort), dan de sessie, dan pas de body; een eigen limiet per teamlid", () => {
    const s = lees(ROUTE);
    expect(s).not.toMatch(/request\.(json|text|formData|arrayBuffer|blob)\(/);
    const lijst = handlers(s);
    expect(lijst.map((x) => x.slice(0, x.indexOf("(")))).toEqual(["GET", "POST"]);
    for (const hnd of lijst) {
      const poort = hnd.indexOf("await smileyPoort(request");
      const sessie = hnd.indexOf("await eisToegang()");
      const werk = Math.min(...["alleReviews(", "bewaarReview(", "verwijderReview(", "await jsonBegrensd("].map((t) => hnd.indexOf(t)).filter((i) => i >= 0));
      expect(poort).toBeGreaterThanOrEqual(0);
      expect(sessie).toBeGreaterThan(poort);
      expect(werk).toBeGreaterThan(sessie);
    }
    const post = lijst[1] ?? "";
    expect(post).toContain("await jsonBegrensd(request, 60_000)");
    expect(post.indexOf('name: "smileyapp-inhoud", identifier: ik.id')).toBeLessThan(post.indexOf("await bewaarReview("));
    expect(post.indexOf('name: "smileyapp-inhoud", identifier: ik.id')).toBeGreaterThan(0);
    // reviews zijn voor het hele team: ze staan vóór de regel die alleen een beheerder doorlaat
    expect(post.indexOf("await verwijderReview(")).toBeLessThan(post.indexOf('if (ik.rol !== "beheerder")'));
    // de poort zelf: herkomst achter Caddy en een limiet per IP
    const poort = lees("lib/voorstel/smileyapp-poort.ts");
    expect(poort).toContain("zelfdeHerkomst(request.headers, request.url)");
    expect(poort).toContain("await enforceRateLimit(");
    expect(s).not.toContain("AppError.forbidden");
  });

  it("het beheer: de afgesproken zin, verwijderen in twee stappen, en de lijst van de server overnemen", () => {
    const scherm = lees("components/voorstel/smileyapp/beheer/ReviewsBeheer.tsx");
    expect(scherm).toContain('"use client"');
    expect(scherm).toContain("Zet hier alleen reviews die je echt hebt gekregen, met de naam zoals de schrijver hem zelf gebruikte. De site zet erbij dat SmileyApp ze zelf heeft overgenomen.");
    expect(scherm).toContain("setLijst((await vraag<{ reviews: Review[] }>(URL_INHOUD, { method: \"POST\", body })).reviews);");
    expect(scherm).toContain("Deze review verwijderen?");
    expect(scherm.indexOf("setZeker(r.id)")).toBeGreaterThan(0);
    expect(scherm).toContain('actie: "review-verwijderen", id: r.id');
    // elk veld heeft een label, en fouten komen via Melding (role="alert")
    for (const veld of ["naam", "organisatie", "tekst", "bron", "datum", "link"]) {
      expect(scherm, veld).toContain(`htmlFor="sm-review-${veld}"`);
      expect(scherm, veld).toContain(`id="sm-review-${veld}"`);
    }
    expect(scherm).toContain("<Melding fout={fout} ok={ok} />");
    expect(lees("components/voorstel/smileyapp/beheer/api.tsx")).toContain('<p role="alert"');
    // een client-onderdeel laadt niets van de server
    expect(scherm).not.toMatch(/from "@\/lib\/(storage|prisma|mail|redis|voorstel\/smileyapp-(accounts|aanvragen|blog|pakketten|cijfers|poort|mail|reviews|talen))"/);
    expect(scherm).not.toMatch(/from "zod"/);
    const beheer = lees("components/voorstel/smileyapp/beheer/SmileyBeheer.tsx");
    expect(beheer).toContain('["reviews", "Reviews"],');
    expect(beheer).toContain('{tab === "reviews" && <ReviewsBeheer vandaag={vandaag} />}');
    expect(lees("lib/voorstel/smileyapp-reviews.ts")).toContain('const PREFIX = "voorstel-smileyapp:review:";');
  });
});
