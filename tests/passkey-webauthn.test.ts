import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CborFout, leesCbor, leesCborGeheel } from "@/lib/auth/passkey/cbor";
import { coseNaarSleutel } from "@/lib/auth/passkey/cose";
import { opPasskeyHost, passkeyBron } from "@/lib/auth/passkey/omgeving";
import { netteNaam, raadToestelNaam } from "@/lib/auth/passkey/naam";
import { leesAuthData, verifieerInlog, verifieerRegistratie, type Verwacht } from "@/lib/auth/passkey/webauthn";
import { authData, cbor, meldAan, nieuwToestel, registreer, type Cbor, type Toestel } from "@/tests/helpers/webauthn-toestel";

// ---------------------------------------------------------------------------
// De WebAuthn-controle zelf (lib/auth/passkey/webauthn.ts), met echte
// sleutelparen en byte voor byte nagebouwde browserantwoorden: een geldige
// registratie en aanmelding, en elke weigering die de specificatie voorschrijft.
// ---------------------------------------------------------------------------

const RP = "zekerflex.com";
const ORIGIN = "https://zekerflex.com";
const CHALLENGE = Buffer.alloc(32, 7).toString("base64url");
const verwacht = (extra: Partial<Verwacht> = {}): Verwacht => ({ challenge: CHALLENGE, origin: ORIGIN, rpId: RP, uvVerplicht: false, ...extra });
const ceremonie = { rpId: RP, origin: ORIGIN, challenge: CHALLENGE };

function opgeslagen(t: Toestel, signCount = 0) {
  return { publicKey: t.cose, algorithm: t.alg, signCount, userHandle: t.userHandle.toString("base64url") };
}

describe("registreren (§7.1)", () => {
  it("een geldige passkey (attestatie none) wordt geaccepteerd", () => {
    const t = nieuwToestel();
    const uit = verifieerRegistratie(registreer(t, ceremonie), verwacht());
    expect(uit).toMatchObject({ ok: true, algorithm: -7, signCount: 0, uv: true, fmt: "none" });
    if (!uit.ok) throw new Error("niet ok");
    expect(uit.credentialId.equals(t.credentialId)).toBe(true);
    expect(uit.publicKey.equals(t.cose)).toBe(true);
  });

  it.each(["ed25519", "rs256"] as const)("ook %s", (soort) => {
    const t = nieuwToestel(soort);
    expect(verifieerRegistratie(registreer(t, ceremonie), verwacht()).ok).toBe(true);
  });

  it("een andere verklaring (packed) lezen we niet: we vertrouwen het toestel niet op attestatie", () => {
    const t = nieuwToestel();
    const r = registreer(t, ceremonie, { fmt: "packed", attStmt: new Map<number | string, Cbor>([["alg", -7], ["sig", Buffer.from("geen echte handtekening")]]) });
    expect(verifieerRegistratie(r, verwacht())).toMatchObject({ ok: true, fmt: "packed" });
  });

  const weigeringen: [string, (t: Toestel) => ReturnType<typeof registreer>, Partial<Verwacht>, string][] = [
    ["type webauthn.get", (t) => registreer(t, { ...ceremonie, type: "webauthn.get" }), {}, "type"],
    ["verkeerde challenge", (t) => registreer(t, { ...ceremonie, challenge: Buffer.alloc(32, 8).toString("base64url") }), {}, "challenge"],
    ["vervalste origin", (t) => registreer(t, { ...ceremonie, origin: "https://zekerflex.com.evil.example" }), {}, "origin"],
    ["http in plaats van https", (t) => registreer(t, { ...ceremonie, origin: "http://zekerflex.com" }), {}, "origin"],
    ["vanuit een frame op een andere site", (t) => registreer(t, { ...ceremonie, crossOrigin: true }), {}, "cross_origin"],
    ["verkeerde rpIdHash", (t) => registreer(t, { ...ceremonie, rpId: "evil.example" }), {}, "rp_id"],
    ["geen aanraking (UP)", (t) => registreer(t, { ...ceremonie, vlaggen: { up: false } }), {}, "up"],
    ["UV verplicht maar niet gezet", (t) => registreer(t, { ...ceremonie, vlaggen: { uv: false } }), { uvVerplicht: true }, "uv"],
    ["BS zonder BE", (t) => registreer(t, { ...ceremonie, vlaggen: { bs: true } }), {}, "be_bs"],
    ["fmt none met een verklaring", (t) => registreer(t, ceremonie, { attStmt: new Map<number | string, Cbor>([["x", 1]]) }), {}, "ongeldig"],
  ];
  it.each(weigeringen)("weigert: %s", (_naam, maak, extra, reden) => {
    expect(verifieerRegistratie(maak(nieuwToestel()), verwacht(extra))).toEqual({ ok: false, reden });
  });

  it("weigert een rawId die niet bij authenticatorData hoort", () => {
    const r = registreer(nieuwToestel(), ceremonie);
    expect(verifieerRegistratie({ ...r, rawId: Buffer.alloc(32, 1) }, verwacht())).toEqual({ ok: false, reden: "credential_id" });
  });

  it("weigert een niet-ondersteund algoritme (ES384)", () => {
    const t = nieuwToestel();
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
    const jwk = publicKey.export({ format: "jwk" });
    t.cose = cbor(new Map<number, Cbor>([[1, 2], [3, -35], [-1, 2], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]));
    expect(verifieerRegistratie(registreer(t, ceremonie), verwacht())).toEqual({ ok: false, reden: "sleutel" });
  });

  it("weigert kapotte gegevens zonder te gooien", () => {
    const r = registreer(nieuwToestel(), ceremonie);
    expect(verifieerRegistratie({ ...r, attestationObject: Buffer.concat([r.attestationObject, Buffer.from([0])]) }, verwacht())).toEqual({ ok: false, reden: "ongeldig" });
    expect(verifieerRegistratie({ ...r, clientDataJSON: Buffer.from("{kapot") }, verwacht())).toEqual({ ok: false, reden: "ongeldig" });
    expect(verifieerRegistratie({ ...r, attestationObject: Buffer.from([0xa1]) }, verwacht())).toEqual({ ok: false, reden: "ongeldig" });
  });
});

describe("inloggen (§7.2)", () => {
  it.each(["es256", "ed25519", "rs256"] as const)("een geldige aanmelding met %s", (soort) => {
    const t = nieuwToestel(soort);
    expect(verifieerInlog(meldAan(t, ceremonie), opgeslagen(t), verwacht())).toEqual({ ok: true, signCount: 0, uv: true, backedUp: false });
  });

  it("geeft de nieuwe teller en de synchronisatie terug", () => {
    const t = nieuwToestel();
    const a = meldAan(t, { ...ceremonie, vlaggen: { be: true, bs: true } }, { teller: 8 });
    expect(verifieerInlog(a, opgeslagen(t, 7), verwacht())).toEqual({ ok: true, signCount: 8, uv: true, backedUp: true });
  });

  it("weigert een verkeerde challenge", () => {
    const t = nieuwToestel();
    const a = meldAan(t, { ...ceremonie, challenge: Buffer.alloc(32, 9).toString("base64url") });
    expect(verifieerInlog(a, opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "challenge" });
  });

  it.each(["https://zekerflex.com.evil.example", "https://evil.example", "http://zekerflex.com", "https://www.zekerflex.com", "https://zekerflex.com:8443"])("weigert een vervalste origin: %s", (origin) => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, { ...ceremonie, origin }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "origin" });
  });

  it("weigert een verkeerde rpIdHash (passkey van een ander domein)", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, { ...ceremonie, rpId: "evil.example" }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "rp_id" });
  });

  it("weigert type webauthn.create", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, { ...ceremonie, type: "webauthn.create" }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "type" });
  });

  it("weigert zonder aanraking (UP)", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, { ...ceremonie, vlaggen: { up: false } }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "up" });
  });

  it("UV naar keuze, maar verplicht als tweestapsverificatie aan staat", () => {
    const t = nieuwToestel();
    const zonderUv = meldAan(t, { ...ceremonie, vlaggen: { uv: false } });
    expect(verifieerInlog(zonderUv, opgeslagen(t), verwacht()).ok).toBe(true);
    expect(verifieerInlog(zonderUv, opgeslagen(t), verwacht({ uvVerplicht: true }))).toEqual({ ok: false, reden: "uv" });
  });

  it("weigert een handtekening van een andere sleutel", () => {
    const t = nieuwToestel();
    const ander = nieuwToestel();
    expect(verifieerInlog(meldAan(t, ceremonie, { sleutel: ander.privateKey }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "handtekening" });
  });

  it("weigert authenticatorData die na het ondertekenen is veranderd", () => {
    const t = nieuwToestel();
    const a = meldAan(t, { ...ceremonie, vlaggen: { uv: false } });
    // UV-vlag achteraf aanzetten om 2FA te omzeilen
    const vervalst = Buffer.from(a.authenticatorData);
    vervalst[32] = (vervalst[32] ?? 0) | 0x04;
    expect(verifieerInlog({ ...a, authenticatorData: vervalst }, opgeslagen(t), verwacht({ uvVerplicht: true }))).toEqual({ ok: false, reden: "handtekening" });
  });

  it("weigert een handtekening over andere clientData", () => {
    const t = nieuwToestel();
    const a = meldAan(t, ceremonie);
    const b = meldAan(t, { ...ceremonie, challenge: Buffer.alloc(32, 3).toString("base64url") });
    expect(verifieerInlog({ ...a, signature: b.signature }, opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "handtekening" });
  });

  describe("teller (signCount)", () => {
    const geval = (opgeslagenTeller: number, nieuw: number) => {
      const t = nieuwToestel();
      return verifieerInlog(meldAan(t, ceremonie, { teller: nieuw }), opgeslagen(t, opgeslagenTeller), verwacht());
    };
    it("weigert een dalende teller (mogelijk gekopieerd toestel)", () => expect(geval(10, 5)).toEqual({ ok: false, reden: "teller" }));
    it("weigert een gelijke teller boven 0", () => expect(geval(10, 10)).toEqual({ ok: false, reden: "teller" }));
    it("weigert 0 na een teller boven 0", () => expect(geval(5, 0)).toEqual({ ok: false, reden: "teller" }));
    it("accepteert een stijgende teller", () => expect(geval(10, 11)).toMatchObject({ ok: true, signCount: 11 }));
    it("accepteert 0 en 0 (gesynchroniseerde passkeys tellen niet)", () => expect(geval(0, 0)).toMatchObject({ ok: true, signCount: 0 }));
    it("accepteert de eerste stap van 0 naar boven", () => expect(geval(0, 1)).toMatchObject({ ok: true, signCount: 1 }));
  });

  it("weigert een passkey met een andere of ontbrekende user handle", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, ceremonie, { userHandle: Buffer.alloc(32, 5) }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "user_handle" });
    expect(verifieerInlog(meldAan(t, ceremonie, { userHandle: null }), opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "user_handle" });
  });

  it("weigert een nieuwe sleutel in een inlog (AT-vlag)", () => {
    const t = nieuwToestel();
    const a = meldAan(t, ceremonie);
    const metAt = authData({ rpId: RP, teller: 0, credential: { id: t.credentialId, cose: t.cose } });
    expect(verifieerInlog({ ...a, authenticatorData: metAt }, opgeslagen(t), verwacht())).toEqual({ ok: false, reden: "ongeldig" });
  });

  it("weigert als de opgeslagen sleutel niet bij het algoritme hoort", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, ceremonie), { ...opgeslagen(t), algorithm: -257 }, verwacht())).toEqual({ ok: false, reden: "sleutel" });
  });

  it("weigert een lege challenge aan onze kant", () => {
    const t = nieuwToestel();
    expect(verifieerInlog(meldAan(t, ceremonie), opgeslagen(t), verwacht({ challenge: "" }))).toEqual({ ok: false, reden: "challenge" });
  });
});

describe("authenticatorData", () => {
  it("leest vlaggen, teller en de nieuwe sleutel", () => {
    const t = nieuwToestel();
    const ad = leesAuthData(authData({ rpId: RP, teller: 0x01020304, vlaggen: { be: true }, credential: { id: t.credentialId, cose: t.cose } }));
    expect(ad).toMatchObject({ up: true, uv: true, be: true, bs: false, at: true, signCount: 0x01020304 });
    expect(ad.credential?.publicKey.equals(t.cose)).toBe(true);
  });
  it("weigert te korte of te lange gegevens", () => {
    expect(() => leesAuthData(Buffer.alloc(36))).toThrow();
    expect(() => leesAuthData(Buffer.concat([authData({ rpId: RP, teller: 0 }), Buffer.from([1])]))).toThrow();
  });
});

describe("CBOR-lezer", () => {
  it("leest gehele getallen, negatieve, tekst, bytes, arrays en maps", () => {
    const w = leesCborGeheel(cbor(new Map<number | string, Cbor>([[1, 2], [-1, -300], ["t", "één"], ["b", Buffer.from([1, 2])], ["a", [1, 70000, true, null]]])));
    expect(w).toBeInstanceOf(Map);
    const m = w as Map<number | string, unknown>;
    expect(m.get(1)).toBe(2);
    expect(m.get(-1)).toBe(-300);
    expect(m.get("t")).toBe("één");
    expect(m.get("b")).toEqual(Buffer.from([1, 2]));
    expect(m.get("a")).toEqual([1, 70000, true, null]);
  });
  it("leest een 64-bits getal en geeft de positie na het item", () => {
    const b = Buffer.from([0x1b, 0, 0, 0, 1, 0, 0, 0, 0, 0xff]);
    expect(leesCbor(b)).toEqual({ waarde: 2 ** 32, einde: 9 });
  });
  it.each([
    ["onbepaalde lengte", Buffer.from([0x5f, 0x41, 0x00, 0xff])],
    ["lengte voorbij het einde", Buffer.from([0x58, 0x10, 0x00])],
    ["array langer dan de buffer", Buffer.from([0x9a, 0xff, 0xff, 0xff, 0xff])],
    ["tag", Buffer.from([0xc0, 0x00])],
    ["dubbele mapsleutel", Buffer.from([0xa2, 0x01, 0x00, 0x01, 0x00])],
    ["mapsleutel die een array is", Buffer.from([0xa1, 0x80, 0x00])],
    ["te diep", Buffer.from([...Array(20).fill(0x81), 0x00])],
    ["getal te groot voor JS", Buffer.from([0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])],
    ["leeg", Buffer.alloc(0)],
  ])("weigert: %s", (_naam, b) => {
    expect(() => leesCborGeheel(b)).toThrow(CborFout);
  });
  it("weigert bytes na het item", () => {
    expect(() => leesCborGeheel(Buffer.from([0x01, 0x02]))).toThrow(CborFout);
  });
});

describe("COSE-sleutel", () => {
  it("weigert een P-256-punt dat niet op de curve ligt", () => {
    const k = cbor(new Map<number, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.alloc(32, 1)], [-3, Buffer.alloc(32, 2)]]));
    expect(() => coseNaarSleutel(k)).toThrow();
  });
  it("weigert ES256 met een verkeerde curve of korte coördinaat", () => {
    const t = nieuwToestel();
    const kort = cbor(new Map<number, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.alloc(31)], [-3, Buffer.alloc(32)]]));
    const curve = cbor(new Map<number, Cbor>([[1, 2], [3, -7], [-1, 2], [-2, Buffer.alloc(32)], [-3, Buffer.alloc(32)]]));
    expect(() => coseNaarSleutel(kort)).toThrow();
    expect(() => coseNaarSleutel(curve)).toThrow();
    expect(coseNaarSleutel(t.cose).alg).toBe(-7);
  });
});

describe("domein (rpId en origin uit APP_BASE_URL)", () => {
  it("zekerflex.com", () => {
    expect(passkeyBron("https://zekerflex.com")).toEqual({ rpId: "zekerflex.com", origin: "https://zekerflex.com", host: "zekerflex.com" });
    expect(passkeyBron("https://zekerflex.com/")?.origin).toBe("https://zekerflex.com");
  });
  it("localhost mag zonder https (ontwikkelen)", () => {
    expect(passkeyBron("http://localhost:3000")).toEqual({ rpId: "localhost", origin: "http://localhost:3000", host: "localhost:3000" });
  });
  it.each(["http://zekerflex.com", "https://37-97-226-24.sslip.io", "https://bouwer.37-97-226-24.sslip.io", "https://10.0.0.1.nip.io", "https://37.97.226.24", "http://[::1]:3000", "geen url"])(
    "doet niet mee: %s",
    (url) => expect(passkeyBron(url)).toBeNull(),
  );
  it("vergelijkt de echte host achter Caddy, niet request.url", () => {
    const bron = passkeyBron("https://zekerflex.com")!;
    expect(opPasskeyHost(new Headers({ host: "app:3000", "x-forwarded-host": "zekerflex.com" }), bron)).toBe(true);
    expect(opPasskeyHost(new Headers({ host: "zekerflex.com" }), bron)).toBe(true);
    expect(opPasskeyHost(new Headers({ host: "app:3000" }), bron)).toBe(false);
    expect(opPasskeyHost(new Headers({ "x-forwarded-host": "voorbeeld.37-97-226-24.sslip.io", host: "zekerflex.com" }), bron)).toBe(false);
  });
});

describe("naam van het toestel", () => {
  it("raadt een herkenbare naam", () => {
    expect(raadToestelNaam("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(raadToestelNaam("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Android");
    expect(raadToestelNaam("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(raadToestelNaam("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("Mac");
    expect(raadToestelNaam("")).toBe("Passkey");
  });
  it("maakt een ingetypte naam netjes", () => {
    expect(netteNaam("  Mijn\u0000  telefoon\u202e ")).toBe("Mijn telefoon");
    expect(netteNaam("")).toBe("Passkey");
    expect(netteNaam(42)).toBe("Passkey");
    expect(netteNaam("x".repeat(100))).toHaveLength(60);
  });
});
