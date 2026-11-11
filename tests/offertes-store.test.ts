import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag draait in dit bestand op een gewone Map: dezelfde functies als lib/storage/kv, zonder database.
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), naSet: null as null | ((k: string) => void) }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => {
    m.kv.set(k, structuredClone(v));
    m.naSet?.(k);
  },
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));

import {
  bewerkOfferte,
  claimNummer,
  kopieerOfferte,
  leesOfferte,
  lijstOffertes,
  maakOfferte,
  nieuweLinkOfferte,
  offerteVanToken,
  reageerOpToken,
  tokenHash,
  trekOfferteIn,
  verstuurOfferte,
  verwijderOfferte,
  wisKlant,
} from "@/lib/offertes/store";
import { controleerInhoud, type OfferteInhoud } from "@/lib/offertes/model";

const NU = new Date("2026-11-12T10:00:00+01:00");
const T = "tenant1";
const BODY = { klant: { naam: "Piet Jansen", email: "piet@voorbeeld.nl", telefoon: "06 1234 5678", adres: "Dorpsstraat 1" }, titel: "Dakkapel", inleiding: "", regels: [{ omschrijving: "Arbeid", aantal: 8, eenheid: "uur", prijsCent: 6_500, btw: 21 }], kortingPct: 10, geldigTot: "2026-12-12", voorwaarden: "" };
function inhoud(over: Record<string, unknown> = {}): OfferteInhoud {
  const r = controleerInhoud({ ...BODY, ...over }, NU);
  if (!r.ok) throw new Error(r.fout);
  return r.waarde;
}

beforeEach(() => {
  m.kv.clear();
  m.naSet = null;
});

describe("nummers: OF-<jaar>-<volgnummer> per organisatie en jaar", () => {
  it("telt op, begint elk jaar opnieuw en is per organisatie apart", async () => {
    expect((await maakOfferte(T, inhoud(), NU)).nummer).toBe("OF-2026-0001");
    expect((await maakOfferte(T, inhoud(), NU)).nummer).toBe("OF-2026-0002");
    expect((await maakOfferte("tenant2", inhoud(), NU)).nummer).toBe("OF-2026-0001");
    expect((await maakOfferte(T, inhoud(), new Date("2027-01-02T10:00:00+01:00"))).nummer).toBe("OF-2027-0001");
  });

  it("het jaar volgt de Nederlandse datum: oudejaarsnacht 23:30 UTC is al 2027", async () => {
    expect((await maakOfferte(T, inhoud(), new Date("2026-12-31T23:30:00Z"))).nummer).toBe("OF-2027-0001");
    expect((await maakOfferte(T, inhoud(), new Date("2026-12-31T22:30:00Z"))).nummer).toBe("OF-2026-0001");
  });

  it("een verwijderd concept geeft zijn nummer niet vrij", async () => {
    const a = await maakOfferte(T, inhoud(), NU);
    await verwijderOfferte(T, a.id);
    expect((await maakOfferte(T, inhoud(), NU)).nummer).toBe("OF-2026-0002");
  });

  it("zes offertes tegelijk krijgen zes verschillende nummers (de claim vangt de botsing op)", async () => {
    const alle = await Promise.all(Array.from({ length: 6 }, () => maakOfferte(T, inhoud(), NU)));
    const nummers = alle.map((o) => o.nummer);
    expect(new Set(nummers).size).toBe(6);
    expect((await lijstOffertes(T)).map((o) => o.nummer).sort()).toEqual([...nummers].sort());
    for (const n of nummers) expect(n).toMatch(/^OF-2026-\d{4}$/);
  });

  it("een ander die tijdens ons schrijven hetzelfde volgnummer claimt: wij trekken in en nemen het volgende", async () => {
    let eenmaal = false;
    m.naSet = (k) => {
      if (!eenmaal && k.endsWith(":00001:oMIJN")) {
        eenmaal = true;
        m.kv.set(`offertes:nr:${T}:2026:00001:oANDER`, { id: "oANDER", seq: 1 });
      }
    };
    expect(await claimNummer(T, "oMIJN", NU)).toBe("OF-2026-0002");
    expect(m.kv.has(`offertes:nr:${T}:2026:00001:oMIJN`)).toBe(false); // onze claim is ingetrokken
    expect(m.kv.has(`offertes:nr:${T}:2026:00001:oANDER`)).toBe(true); // die van de ander blijft staan
  });

  it("een bestaande claim van een ander schuift ons op", async () => {
    m.kv.set(`offertes:nr:${T}:2026:00001:oANDER`, { id: "oANDER", seq: 1 });
    expect(await claimNummer(T, "oMIJN", NU)).toBe("OF-2026-0002");
  });
});

describe("maken, bewerken, verwijderen", () => {
  it("een nieuwe offerte is een concept zonder link", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    expect(o).toMatchObject({ status: "concept", titel: "Dakkapel", gemaaktOp: NU.toISOString() });
    expect(o.id).toMatch(/^o[0-9a-f]{12}$/);
    expect(await leesOfferte(T, o.id)).toEqual(o);
  });

  it("een concept bewerken kan; een verstuurde of beantwoorde offerte geeft een nette fout", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    expect((await bewerkOfferte(T, o.id, inhoud({ titel: "Nieuwe titel" }), NU)).titel).toBe("Nieuwe titel");
    expect((await leesOfferte(T, o.id))?.nummer).toBe(o.nummer);
    await verstuurOfferte(T, o.id, "Bouw BV", NU);
    await expect(bewerkOfferte(T, o.id, inhoud(), NU)).rejects.toThrow(/Trek hem eerst in/);
    const { token } = await nieuweLinkOfferte(T, o.id, NU);
    await reageerOpToken(token, "geaccepteerd", "Piet", "", NU);
    await expect(bewerkOfferte(T, o.id, inhoud(), NU)).rejects.toThrow(/kopie/);
    expect((await leesOfferte(T, o.id))?.titel).toBe("Nieuwe titel");
  });

  it("verwijderen mag alleen bij een concept", async () => {
    const a = await maakOfferte(T, inhoud(), NU);
    const b = await maakOfferte(T, inhoud(), NU);
    await verstuurOfferte(T, b.id, "Bouw BV", NU);
    await expect(verwijderOfferte(T, b.id)).rejects.toThrow(/Alleen een concept/);
    await verwijderOfferte(T, a.id);
    expect(await leesOfferte(T, a.id)).toBeNull();
    expect(await leesOfferte(T, b.id)).not.toBeNull();
  });

  it("de lijst heeft de nieuwste eerst", async () => {
    const a = await maakOfferte(T, inhoud(), new Date("2026-11-10T10:00:00Z"));
    const b = await maakOfferte(T, inhoud(), new Date("2026-11-11T10:00:00Z"));
    expect((await lijstOffertes(T)).map((o) => o.id)).toEqual([b.id, a.id]);
  });

  it("een andere organisatie, een ongeldig id of 'constructor' vindt niets", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    expect(await leesOfferte("tenant2", o.id)).toBeNull();
    expect(await lijstOffertes("tenant2")).toEqual([]);
    expect(await leesOfferte(T, "constructor")).toBeNull();
    expect(await leesOfferte(T, "../x")).toBeNull();
    await expect(bewerkOfferte("tenant2", o.id, inhoud(), NU)).rejects.toThrow(/bestaat niet/);
    await expect(verstuurOfferte("tenant2", o.id, "X", NU)).rejects.toThrow(/bestaat niet/);
    await expect(wisKlant("tenant2", o.id, NU)).rejects.toThrow(/bestaat niet/);
  });
});

describe("de link: een token die alleen als hash bewaard wordt", () => {
  it("versturen geeft een token van 32 tekens; nergens in de opslag staat de token zelf", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const { offerte, token } = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(offerte).toMatchObject({ status: "verstuurd", bedrijfsnaam: "Bouw BV", tokenHash: tokenHash(token) });
    expect(offerte.tokenHash).not.toContain(token);
    expect(JSON.stringify([...m.kv])).not.toContain(token);
  });

  it("twee offertes krijgen verschillende tokens", async () => {
    const a = await verstuurOfferte(T, (await maakOfferte(T, inhoud(), NU)).id, "B", NU);
    const b = await verstuurOfferte(T, (await maakOfferte(T, inhoud(), NU)).id, "B", NU);
    expect(a.token).not.toBe(b.token);
  });

  it("de juiste token vindt de offerte; een foute, afgekapte of rare token niet", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const { token } = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    expect((await offerteVanToken(token))?.offerte.id).toBe(o.id);
    expect((await offerteVanToken(token))?.tenantId).toBe(T);
    const fout = `${token.slice(0, 31)}${token.endsWith("A") ? "B" : "A"}`;
    for (const t of [fout, token.slice(0, 31), `${token}x`, "", "constructor", "__proto__", "../../etc/passwd", token.toUpperCase() === token ? token.toLowerCase() : token.toUpperCase(), " ".repeat(32)]) {
      expect(await offerteVanToken(t)).toBeNull();
    }
    expect(await offerteVanToken(undefined as unknown as string)).toBeNull();
  });

  it("token raden: 300 willekeurige pogingen vinden niets", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    await verstuurOfferte(T, o.id, "Bouw BV", NU);
    const { nieuweToken } = await import("@/lib/offertes/store");
    for (let n = 0; n < 300; n++) expect(await offerteVanToken(nieuweToken())).toBeNull();
  });

  it("een concept heeft geen werkende link, ook niet met een bestaande token-sleutel", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const { token } = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    await trekOfferteIn(T, o.id, NU);
    expect(await offerteVanToken(token)).toBeNull();
    // zelfs als de verwijzing per ongeluk bleef staan: de hash op de offerte is weg en de status is concept
    m.kv.set(`offertes:token:${tokenHash(token)}`, { tenantId: T, id: o.id });
    expect(await offerteVanToken(token)).toBeNull();
  });

  it("intrekken en daarna opnieuw versturen geeft een nieuwe link; de oude blijft dood", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const eerste = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    expect((await trekOfferteIn(T, o.id, NU)).status).toBe("concept");
    const tweede = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    expect(await offerteVanToken(eerste.token)).toBeNull();
    expect((await offerteVanToken(tweede.token))?.offerte.id).toBe(o.id);
  });

  it("een nieuwe link maakt de oude ongeldig en haalt de oude verwijzing weg", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const eerste = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    const tweede = await nieuweLinkOfferte(T, o.id, NU);
    expect(await offerteVanToken(eerste.token)).toBeNull();
    expect(m.kv.has(`offertes:token:${tokenHash(eerste.token)}`)).toBe(false);
    expect((await offerteVanToken(tweede.token))?.offerte.status).toBe("verstuurd");
    await expect(nieuweLinkOfferte(T, (await maakOfferte(T, inhoud(), NU)).id, NU)).rejects.toThrow(/nog geen link/);
  });

  it("versturen kan niet voor een onvolledige offerte, en maakt dan ook geen token", async () => {
    const o = await maakOfferte(T, inhoud({ regels: [] }), NU);
    await expect(verstuurOfferte(T, o.id, "Bouw BV", NU)).rejects.toThrow(/minstens één regel/);
    expect([...m.kv.keys()].some((k) => k.startsWith("offertes:token:"))).toBe(false);
  });
});

describe("de klant reageert", () => {
  async function verstuurd() {
    const o = await maakOfferte(T, inhoud(), NU);
    return { o, ...(await verstuurOfferte(T, o.id, "Bouw BV", NU)) };
  }

  it("akkoord: status, naam en tijdstip; het blijft via dezelfde link te zien", async () => {
    const { o, token } = await verstuurd();
    const later = new Date("2026-11-13T09:15:00+01:00");
    const n = await reageerOpToken(token, "geaccepteerd", "Piet Jansen", "", later);
    expect(n).toMatchObject({ status: "geaccepteerd", reactie: { keuze: "geaccepteerd", naam: "Piet Jansen", op: later.toISOString() } });
    expect(Object.keys(n?.reactie ?? {}).sort()).toEqual(["keuze", "naam", "op", "reden"]); // geen IP of apparaat
    expect((await leesOfferte(T, o.id))?.status).toBe("geaccepteerd");
    expect((await offerteVanToken(token))?.offerte.status).toBe("geaccepteerd");
  });

  it("afwijzen met reden", async () => {
    const { token } = await verstuurd();
    expect(await reageerOpToken(token, "afgewezen", "", "Te duur", NU)).toMatchObject({ status: "afgewezen", reactie: { reden: "Te duur" } });
  });

  it("dubbel akkoord, of omkeren na een reactie, geeft een conflict en verandert niets", async () => {
    const { o, token } = await verstuurd();
    await reageerOpToken(token, "geaccepteerd", "Piet", "", NU);
    await expect(reageerOpToken(token, "geaccepteerd", "Jan", "", NU)).rejects.toThrow(/al geaccepteerd/);
    await expect(reageerOpToken(token, "afgewezen", "", "", NU)).rejects.toThrow(/al geaccepteerd/);
    expect((await leesOfferte(T, o.id))?.reactie?.naam).toBe("Piet");
  });

  it("een verlopen offerte kan niet meer geaccepteerd worden, ook al staat hij nog op 'verstuurd'", async () => {
    const { o, token } = await verstuurd();
    await expect(reageerOpToken(token, "geaccepteerd", "Piet", "", new Date("2026-12-13T09:00:00+01:00"))).rejects.toThrow(/verlopen/);
    expect((await leesOfferte(T, o.id))?.status).toBe("verstuurd");
    expect(await reageerOpToken(token, "geaccepteerd", "Piet", "", new Date("2026-12-12T20:00:00+01:00"))).not.toBeNull();
  });

  it("akkoord zonder naam wordt geweigerd; een onbekende token geeft null", async () => {
    const { token } = await verstuurd();
    await expect(reageerOpToken(token, "geaccepteerd", " ", "", NU)).rejects.toThrow(/naam/);
    expect(await reageerOpToken("x".repeat(32), "geaccepteerd", "Piet", "", NU)).toBeNull();
  });

  it("na intrekken kan de klant niet meer reageren", async () => {
    const { o, token } = await verstuurd();
    await trekOfferteIn(T, o.id, NU);
    expect(await reageerOpToken(token, "geaccepteerd", "Piet", "", NU)).toBeNull();
  });
});

describe("kopie en klantgegevens wissen", () => {
  it("een kopie van een geaccepteerde offerte is een nieuw concept met een nieuw nummer; het origineel blijft vergrendeld", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const { token } = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    await reageerOpToken(token, "geaccepteerd", "Piet", "", NU);
    const k = await kopieerOfferte(T, o.id, NU);
    expect(k).toMatchObject({ status: "concept", nummer: "OF-2026-0002", kopieVan: "OF-2026-0001", titel: "Dakkapel" });
    expect(k.id).not.toBe(o.id);
    expect(k.tokenHash).toBeUndefined();
    expect(k.reactie).toBeUndefined();
    expect((await leesOfferte(T, o.id))?.status).toBe("geaccepteerd");
    await expect(bewerkOfferte(T, o.id, inhoud(), NU)).rejects.toThrow(/kopie/);
    expect((await bewerkOfferte(T, k.id, inhoud({ titel: "Versie 2" }), NU)).titel).toBe("Versie 2");
  });

  it("klantgegevens wissen: alles van de klant weg uit de opslag, de link dood, de bedragen blijven", async () => {
    const o = await maakOfferte(T, inhoud(), NU);
    const { token } = await verstuurOfferte(T, o.id, "Bouw BV", NU);
    await reageerOpToken(token, "geaccepteerd", "Piet Jansen", "", NU);
    const w = await wisKlant(T, o.id, NU);
    expect(w).toMatchObject({ klantGewist: true, status: "geaccepteerd", klant: { naam: "Verwijderd", email: "", telefoon: "", adres: "" }, reactie: { naam: "Verwijderd" } });
    expect(await offerteVanToken(token)).toBeNull();
    expect(JSON.stringify([...m.kv])).not.toMatch(/Piet|voorbeeld|Dorpsstraat|06 1234/);
    expect(w.regels).toHaveLength(1);
  });
});
