import { generateKeyPairSync, createVerify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: m.warn, error: m.error, info: m.info, debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { dedupeSleutels, leesBankBestand } = await import("@/lib/boekhouding/bank/lees");
const kern = await import("@/lib/boekhouding/bank/koppeling/kern");
const { EnableBanking, mapTransactie, maakJwt, bedragNaarCentenApi } = await import("@/lib/boekhouding/bank/koppeling/enable-banking");
const { haalBankOpMet } = await import("@/lib/boekhouding/bank/koppeling/ophalen");

const NU = new Date("2026-11-12T10:00:00+01:00");
const IBAN = "NL91ABNA0417164300";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

const regel = (over: Partial<import("@/lib/boekhouding/bank/types").BankRegel> = {}): import("@/lib/boekhouding/bank/types").BankRegel => ({
  boekdag: "2026-11-10",
  valutadag: "2026-11-10",
  bedragCents: -1250,
  valuta: "EUR",
  tegenIban: "NL02ABNA0123456789",
  tegenNaam: 'Leverancier "X" B.V.',
  omschrijving: "Factuur 2026-001; regel 2",
  endToEndId: null,
  bankReferentie: "REF-1",
  ...over,
});

describe("kern: sinds, toestemming, csv", () => {
  it("bepaalt vanaf welke dag er wordt opgehaald", () => {
    const vandaag = "2026-11-12";
    expect(kern.bepaalSinds({ vandaag, laatsteSuccesDag: "2026-11-11", nieuwsteBestaandeBoekdag: "2026-10-01" })).toBe("2026-11-08");
    expect(kern.bepaalSinds({ vandaag, laatsteSuccesDag: null, nieuwsteBestaandeBoekdag: "2026-11-01" })).toBe("2026-11-02");
    // een oud afschrift: nooit verder terug dan 90 dagen
    expect(kern.bepaalSinds({ vandaag, laatsteSuccesDag: null, nieuwsteBestaandeBoekdag: "2025-01-01" })).toBe("2026-08-14");
    expect(kern.bepaalSinds({ vandaag, laatsteSuccesDag: null, nieuwsteBestaandeBoekdag: null })).toBe("2026-08-14");
  });

  it("telt dagen over een maand- en jaargrens zonder setDate", () => {
    expect(kern.dagMinDagen("2026-01-02", 3)).toBe("2025-12-30");
    expect(kern.dagPlusEen("2026-02-28")).toBe("2026-03-01");
  });

  it("meldt de stand van de toestemming", () => {
    expect(kern.toestemmingStand("2027-01-01T00:00:00Z", NU)).toBe("geldig");
    expect(kern.toestemmingStand("2026-11-20T00:00:00Z", NU)).toBe("bijna-verlopen");
    expect(kern.toestemmingStand("2026-11-12T08:00:00Z", NU)).toBe("verlopen");
    expect(kern.toestemmingStand("onzin", NU)).toBe("verlopen");
    expect(kern.dagenTotVerlopen("2026-11-20T10:00:00+01:00", NU)).toBe(8);
  });

  it("maakt een csv die de bestaande lezer precies terug leest, met bankreferentie", () => {
    const regels = [regel(), regel({ bedragCents: 100000, bankReferentie: "REF-2", tegenNaam: null, tegenIban: null, omschrijving: null, valutadag: null })];
    const data = leesBankBestand(Buffer.from(kern.regelsNaarCsv(IBAN, regels), "utf8"));
    expect(data.formaat).toBe("CSV");
    expect(data.rekeningIban).toBe(IBAN);
    expect(data.transacties).toHaveLength(2);
    expect(data.transacties[0]).toMatchObject({ boekdag: "2026-11-10", bedragCents: -1250, tegenIban: "NL02ABNA0123456789", bankReferentie: "REF-1" });
    expect(data.transacties[0]?.tegenNaam).toBe('Leverancier "X" B.V.');
    expect(data.transacties[1]).toMatchObject({ bedragCents: 100000, bankReferentie: "REF-2" });
  });

  it("geeft bij overlap dezelfde unieke sleutels: dubbel ophalen geeft geen dubbele regels", () => {
    const a = leesBankBestand(Buffer.from(kern.regelsNaarCsv(IBAN, [regel(), regel({ bankReferentie: "REF-2", bedragCents: -5 })]), "utf8"));
    const b = leesBankBestand(Buffer.from(kern.regelsNaarCsv(IBAN, [regel({ bankReferentie: "REF-2", bedragCents: -5 }), regel({ bankReferentie: "REF-3" })]), "utf8"));
    const sa = dedupeSleutels(IBAN, a.transacties);
    const sb = dedupeSleutels(IBAN, b.transacties);
    expect(sa).toContain("ref:REF-2");
    expect(sb.filter((s) => sa.includes(s))).toEqual(["ref:REF-2"]);
  });

  it("zonder referentie blijven twee gelijke betalingen op één dag bestaan, en is de sleutel stabiel", () => {
    const r = regel({ bankReferentie: null });
    const data = leesBankBestand(Buffer.from(kern.regelsNaarCsv(IBAN, [r, r]), "utf8"));
    const s = dedupeSleutels(IBAN, data.transacties);
    expect(new Set(s).size).toBe(2);
  });

  it("leest een kapotte staat uit KV zonder te gooien", () => {
    expect(kern.leesStaat(null)).toBeNull();
    expect(kern.leesStaat({ aanbieder: "x" })).toBeNull();
    const ok = { aanbieder: "enable-banking", sessieVerzegeld: "v1.a.b.c", rekeningUid: "u1", geldigTot: "2027-01-01T00:00:00Z", gekoppeldOp: "2026-11-12T09:00:00Z", laatsteSucces: null, laatsteFout: { code: "tijdelijk", op: "2026-11-12T09:00:00Z" } };
    expect(kern.leesStaat(ok)?.laatsteFout?.code).toBe("tijdelijk");
    expect(kern.leesStaat({ ...ok, laatsteFout: { code: "raar", op: "x" } })?.laatsteFout).toBeNull();
  });
});

describe("Enable Banking: afbeelden en aanroepen (zonder netwerk)", () => {
  it("leest bedragen exact", () => {
    expect(bedragNaarCentenApi("12.5")).toBe(1250);
    expect(bedragNaarCentenApi("0.07")).toBe(7);
    expect(bedragNaarCentenApi("1234")).toBe(123400);
    expect(bedragNaarCentenApi("12.345")).toBeNull();
    expect(bedragNaarCentenApi("-3")).toBeNull();
    expect(bedragNaarCentenApi(undefined)).toBeNull();
  });

  const eb = (over: Record<string, unknown> = {}) => ({
    entry_reference: "E1",
    status: "BOOK",
    transaction_amount: { amount: "12.50", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    booking_date: "2026-11-10",
    value_date: "2026-11-11",
    creditor: { name: "Bakker" },
    creditor_account: { iban: "NL02 ABNA 0123 4567 89" },
    debtor: { name: "Wij" },
    remittance_information: ["Factuur 1", "bedankt"],
    ...over,
  });

  it("neemt bij uitgaand de begunstigde en maakt het bedrag negatief", () => {
    expect(mapTransactie(eb())).toEqual({
      boekdag: "2026-11-10",
      valutadag: "2026-11-11",
      bedragCents: -1250,
      valuta: "EUR",
      tegenIban: "NL02ABNA0123456789",
      tegenNaam: "Bakker",
      omschrijving: "Factuur 1 bedankt",
      endToEndId: null,
      bankReferentie: "E1",
    });
  });

  it("neemt bij inkomend de betaler", () => {
    const r = mapTransactie(eb({ credit_debit_indicator: "CRDT", debtor: { name: "Klant" }, debtor_account: { iban: "NL91ABNA0417164300" } }));
    expect(r).toMatchObject({ bedragCents: 1250, tegenNaam: "Klant", tegenIban: "NL91ABNA0417164300" });
  });

  it("slaat wat niet geboekt of onleesbaar is over", () => {
    expect(mapTransactie(eb({ status: "PDNG" }))).toBeNull();
    expect(mapTransactie(eb({ credit_debit_indicator: "?" }))).toBeNull();
    expect(mapTransactie(eb({ booking_date: undefined, value_date: undefined }))).toBeNull();
    expect(mapTransactie(eb({ transaction_amount: { amount: "abc", currency: "EUR" } }))).toBeNull();
    expect(mapTransactie("tekst")).toBeNull();
  });

  it("ondertekent de JWT met RS256 en de app-sleutel", () => {
    const jwt = maakJwt({ appId: "app-1", privateKey }, NU);
    const [kop, inhoud, sig] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(kop, "base64url").toString())).toEqual({ typ: "JWT", alg: "RS256", kid: "app-1" });
    const claims = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as { iss: string; aud: string; iat: number; exp: number };
    expect(claims).toMatchObject({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: Math.floor(NU.getTime() / 1000) });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(createVerify("RSA-SHA256").update(`${kop}.${inhoud}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  const antwoord = (status: number, body: unknown) => ({ status, json: async () => body });

  it("leest alle pagina's via continuation_key en vraagt alleen geboekte transacties", async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      urls.push(url);
      return url.includes("continuation_key=K2") ? antwoord(200, { transactions: [eb({ entry_reference: "E2" })] }) : antwoord(200, { transactions: [eb(), eb({ status: "PDNG", entry_reference: "P" })], continuation_key: "K2" });
    });
    const k = new EnableBanking({ appId: "a", privateKey, fetch: fetchFn, nu: () => NU }).voorRekening("uid/1");
    const regels = await k.haalTransacties("2026-11-01");
    expect(regels.map((r) => r.bankReferentie)).toEqual(["E1", "E2"]);
    expect(urls[0]).toContain("/accounts/uid%2F1/transactions?");
    expect(urls[0]).toContain("date_from=2026-11-01");
    expect(urls[0]).toContain("date_to=2026-11-12");
    expect(urls[0]).toContain("transaction_status=BOOK");
  });

  it("vertaalt fouten van de aanbieder naar duidelijke codes", async () => {
    const maak = (status: number) => new EnableBanking({ appId: "a", privateKey, fetch: async () => antwoord(status, {}), nu: () => NU }).voorRekening("u");
    await expect(maak(401).haalTransacties("2026-11-01")).rejects.toMatchObject({ code: "toestemming-verlopen" });
    await expect(maak(429).haalTransacties("2026-11-01")).rejects.toMatchObject({ code: "tijdelijk" });
    await expect(maak(503).haalTransacties("2026-11-01")).rejects.toMatchObject({ code: "tijdelijk" });
    await expect(maak(422).haalTransacties("2026-11-01")).rejects.toMatchObject({ code: "afgewezen" });
    const weg = new EnableBanking({ appId: "a", privateKey, fetch: async () => Promise.reject(new Error("https://geheim.example/?code=123")), nu: () => NU }).voorRekening("u");
    await expect(weg.haalTransacties("2026-11-01")).rejects.toSatisfy((e: Error) => e.name === "BankKoppelingFout" && !e.message.includes("geheim"));
  });

  it("geeft de link voor de toestemming en rondt de sessie af", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = vi.fn(async (url: string, init: { body?: string }) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
      if (url.endsWith("/auth")) return antwoord(200, { url: "https://bank.example/toestemming" });
      return antwoord(200, { session_id: "S1", access: { valid_until: "2027-05-10T00:00:00Z" }, accounts: [{ uid: "U1", account_id: { iban: IBAN } }, { nope: 1 }] });
    });
    const e = new EnableBanking({ appId: "a", privateKey, fetch: fetchFn, nu: () => NU });
    expect((await e.startToestemming({ bank: "ING", geldigDagen: 179, redirectUrl: "https://z.example/terug", state: "st" })).url).toBe("https://bank.example/toestemming");
    expect(calls[0]?.body).toMatchObject({ aspsp: { name: "ING", country: "NL" }, psu_type: "business", state: "st", redirect_url: "https://z.example/terug" });
    expect(await e.rondToestemmingAf("c")).toEqual({ sessieId: "S1", geldigTot: "2027-05-10T00:00:00Z", rekeningen: [{ uid: "U1", iban: IBAN }] });
  });
});

describe("haalBankOp: de ophaalstap", () => {
  const staat = (over: Partial<import("@/lib/boekhouding/bank/koppeling/kern").KoppelingStaat> = {}): import("@/lib/boekhouding/bank/koppeling/kern").KoppelingStaat => ({
    aanbieder: "enable-banking",
    sessieVerzegeld: "v1.x.y.z",
    rekeningUid: "u1",
    geldigTot: "2027-03-01T00:00:00Z",
    gekoppeldOp: "2026-09-01T00:00:00Z",
    laatsteSucces: null,
    laatsteFout: null,
    ...over,
  });
  const importUit = (nieuw: number) => ({ afschriftId: "a1", alIngelezen: false, herkend: "x", formaat: "CSV" as const, totaal: nieuw, nieuw, alBekend: 0, waarschuwingen: [], verwerkt: null });

  function deps(s: ReturnType<typeof staat>, over: Record<string, unknown> = {}) {
    const bewaard: { id: string; staat: ReturnType<typeof staat> }[] = [];
    const haal = vi.fn(async (_sinds: string) => [regel()]);
    const importeer = vi.fn(async (_o: { bankRekeningId: string; bytes: Buffer; door: string }) => importUit(1));
    return {
      bewaard,
      haal,
      importeer,
      d: {
        flagAan: async () => true,
        staten: async () => [{ bankRekeningId: "r1", staat: s }],
        bewaarStaat: async (id: string, st: ReturnType<typeof staat>) => void bewaard.push({ id, staat: st }),
        rekening: async () => ({ iban: IBAN, actief: true }),
        nieuwsteBoekdag: async () => "2026-11-01",
        maakKoppeling: () => ({ aanbieder: "test", haalTransacties: haal }),
        importeer,
        nu: () => NU,
        ...over,
      },
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it("doet niets als de vlag uit staat", async () => {
    const x = deps(staat(), { flagAan: async () => false });
    expect(await haalBankOpMet(x.d)).toEqual({ status: "uit", rekeningen: [] });
    expect(x.haal).not.toHaveBeenCalled();
  });

  it("haalt op vanaf de dag na het nieuwste bestaande afschrift en geeft een csv aan de import", async () => {
    const x = deps(staat());
    const u = await haalBankOpMet(x.d);
    expect(x.haal).toHaveBeenCalledWith("2026-11-02");
    const o = x.importeer.mock.calls[0]?.[0];
    expect(o?.bankRekeningId).toBe("r1");
    expect(o?.door).toBe("bankkoppeling");
    expect(leesBankBestand(o?.bytes as Buffer).transacties).toHaveLength(1);
    expect(u.rekeningen[0]).toMatchObject({ status: "ok", nieuw: 1, melding: null });
    expect(x.bewaard[0]?.staat).toMatchObject({ laatsteSucces: NU.toISOString(), laatsteFout: null });
  });

  it("begint de volgende keer met een paar dagen overlap", async () => {
    const x = deps(staat({ laatsteSucces: "2026-11-11T02:00:00Z" }));
    await haalBankOpMet(x.d);
    expect(x.haal).toHaveBeenCalledWith("2026-11-08");
  });

  it("slaat de import over als er niets nieuws is, maar telt het als geslaagd", async () => {
    const x = deps(staat());
    x.haal.mockResolvedValueOnce([]);
    const u = await haalBankOpMet(x.d);
    expect(x.importeer).not.toHaveBeenCalled();
    expect(u.rekeningen[0]?.status).toBe("ok");
  });

  it("meldt een verlopen toestemming luid en belt de bank niet", async () => {
    const x = deps(staat({ geldigTot: "2026-11-01T00:00:00Z" }));
    const u = await haalBankOpMet(x.d);
    expect(x.haal).not.toHaveBeenCalled();
    expect(u.rekeningen[0]).toMatchObject({ status: "verlopen", toestemming: "verlopen" });
    expect(u.rekeningen[0]?.melding).toContain("opnieuw toestemming");
    expect(m.error).toHaveBeenCalledWith("bankkoppeling: toestemming verlopen", expect.objectContaining({ reden: "toestemming-verlopen" }));
    expect(x.bewaard[0]?.staat.laatsteFout?.code).toBe("toestemming-verlopen");
  });

  it("waarschuwt 14 dagen van tevoren, en haalt wel op", async () => {
    const x = deps(staat({ geldigTot: "2026-11-20T00:00:00Z" }));
    const u = await haalBankOpMet(x.d);
    expect(x.haal).toHaveBeenCalled();
    expect(u.rekeningen[0]).toMatchObject({ status: "ok", toestemming: "bijna-verlopen" });
    expect(u.rekeningen[0]?.melding).toContain("loopt over 7 dagen af");
    expect(m.warn).toHaveBeenCalled();
  });

  it("zet een verlopen sessie bij de bank om in 'verlopen' en een tijdelijke fout in 'fout', zonder iets van de bank te loggen", async () => {
    const { BankKoppelingFout } = kern;
    const a = deps(staat());
    a.haal.mockRejectedValueOnce(new BankKoppelingFout("toestemming-verlopen", "verlopen"));
    expect((await haalBankOpMet(a.d)).rekeningen[0]?.status).toBe("verlopen");
    const b = deps(staat());
    b.haal.mockRejectedValueOnce(new BankKoppelingFout("tijdelijk", "even niet"));
    expect((await haalBankOpMet(b.d)).rekeningen[0]).toMatchObject({ status: "fout", melding: "even niet" });
    expect(b.bewaard[0]?.staat.laatsteFout?.code).toBe("tijdelijk");
    expect(JSON.stringify([...m.warn.mock.calls, ...m.error.mock.calls])).not.toMatch(/NL\d\d[A-Z]{4}/);
  });

  it("een fout bij de ene rekening houdt de andere niet tegen", async () => {
    const x = deps(staat(), { staten: async () => [{ bankRekeningId: "r1", staat: staat() }, { bankRekeningId: "r2", staat: staat() }] });
    x.importeer.mockRejectedValueOnce(new Error("kapot"));
    const u = await haalBankOpMet(x.d);
    expect(u.rekeningen.map((r) => r.status)).toEqual(["fout", "ok"]);
  });

  it("slaat een inactieve bankrekening over", async () => {
    const x = deps(staat(), { rekening: async () => ({ iban: IBAN, actief: false }) });
    expect((await haalBankOpMet(x.d)).rekeningen[0]?.status).toBe("overgeslagen");
    expect(x.haal).not.toHaveBeenCalled();
  });
});
