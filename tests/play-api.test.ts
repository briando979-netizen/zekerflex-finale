import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/play/account", () => ({ toegangstoken: async () => "proef-token" }));

import { alsVingerafdruk, hoogsteVersie, metEdit, PlayFout, zetSpoor } from "@/lib/play/api";
import { uitlegPlayFout } from "@/lib/play/uitleg";

describe("vingerafdruk van Google", () => {
  const hex = "ab".repeat(32);
  const verwacht = Array(32).fill("AB").join(":");
  it("leest hex, hex met dubbele punten en base64", () => {
    expect(alsVingerafdruk(hex)).toBe(verwacht);
    expect(alsVingerafdruk(verwacht)).toBe(verwacht);
    expect(alsVingerafdruk(Buffer.from(hex, "hex").toString("base64"))).toBe(verwacht);
  });
  it("weigert onzin", () => {
    expect(alsVingerafdruk("abc")).toBeNull();
  });
});

describe("hoogste versie in de sporen", () => {
  const tracks = [
    { track: "internal", releases: [{ status: "completed" as const, versionCodes: ["4"] }] },
    { track: "alpha", releases: [{ status: "completed" as const, versionCodes: ["3"] }] },
  ];
  it("per spoor en over alle sporen", () => {
    expect(hoogsteVersie(tracks)).toBe(4);
    expect(hoogsteVersie(tracks, "alpha")).toBe(3);
    expect(hoogsteVersie(tracks, "production")).toBe(0);
  });
});

describe("fouten van Google in gewoon Nederlands", () => {
  const ctx = { pakket: "nl.jansen.app", serviceEmail: "zf@p.iam.gserviceaccount.com" };
  it("geen toegang noemt het e-mailadres om uit te nodigen", () => {
    expect(uitlegPlayFout(new PlayFout(403, "PERMISSION_DENIED", "The caller does not have permission"), ctx)).toContain("zf@p.iam.gserviceaccount.com");
  });
  it("onbekende app wijst naar de eerste upload", () => {
    expect(uitlegPlayFout(new PlayFout(404, "applicationNotFound", "Package not found: nl.jansen.app."), ctx)).toContain("nl.jansen.app");
  });
  it("concept-app", () => {
    expect(uitlegPlayFout(new PlayFout(400, "", "Only releases with status draft may be created on draft app."), ctx)).toContain("concept");
  });
  it("onbekende fout houdt de tekst van Google", () => {
    expect(uitlegPlayFout(new PlayFout(400, "", "Something odd"), ctx)).toBe("Google Play meldt: Something odd");
  });
});

describe("een edit in Google Play", () => {
  afterEach(() => vi.unstubAllGlobals());

  function nepGoogle(antwoorden: ((url: string, init: RequestInit) => Response | undefined)[]) {
    const vragen: { url: string; methode: string; body?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      vragen.push({ url, methode: init.method ?? "GET", ...(typeof init.body === "string" ? { body: init.body } : {}) });
      for (const a of antwoorden) {
        const r = a(url, init);
        if (r) return r;
      }
      return new Response("{}", { status: 200 });
    });
    return vragen;
  }
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  it("opent, wijzigt en bevestigt; stuurt het token mee", async () => {
    const vragen = nepGoogle([(url, init) => (url.endsWith("/edits") && init.method === "POST" ? json({ id: "e1" }) : undefined)]);
    await metEdit("nl.jansen.app", async (e) => {
      await zetSpoor(e, "alpha", [{ status: "completed", versionCodes: ["5"] }]);
      return {};
    });
    expect(vragen.map((v) => `${v.methode} ${v.url.replace(/^https:\/\/[^/]+/, "")}`)).toEqual([
      "POST /androidpublisher/v3/applications/nl.jansen.app/edits",
      "PUT /androidpublisher/v3/applications/nl.jansen.app/edits/e1/tracks/alpha",
      "POST /androidpublisher/v3/applications/nl.jansen.app/edits/e1:commit",
    ]);
    expect(JSON.parse(vragen[1]?.body ?? "{}")).toEqual({ track: "alpha", releases: [{ status: "completed", versionCodes: ["5"] }] });
  });

  it("probeert opnieuw met changesNotSentForReview als Google dat vraagt", async () => {
    const vragen = nepGoogle([
      (url, init) => (url.endsWith("/edits") && init.method === "POST" ? json({ id: "e2" }) : undefined),
      (url) => (url.endsWith(":commit") ? json({ error: { code: 400, message: "Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true." } }, 400) : undefined),
    ]);
    const r = await metEdit("nl.jansen.app", async () => ({}));
    expect(r.handmatigVersturen).toBe(true);
    expect(vragen.at(-1)?.url).toContain(":commit?changesNotSentForReview=true");
  });

  it("gooit de edit weg bij een fout en geeft een PlayFout", async () => {
    const vragen = nepGoogle([
      (url, init) => (url.endsWith("/edits") && init.method === "POST" ? json({ id: "e3" }) : undefined),
      (url) => (url.includes("/tracks/") ? json({ error: { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission" } }, 403) : undefined),
    ]);
    await expect(metEdit("nl.jansen.app", async (e) => (await zetSpoor(e, "internal", []), {}))).rejects.toBeInstanceOf(PlayFout);
    expect(vragen.at(-1)?.methode).toBe("DELETE");
  });
});

describe("ondertekening voor Google (JWT)", () => {
  it("is een geldige RS256-handtekening met de juiste claims", async () => {
    const { jwtVoor } = await vi.importActual<typeof import("@/lib/play/account")>("@/lib/play/account");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sa = { client_email: "zf@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), token_uri: "https://oauth2.googleapis.com/token" };
    const [kop, claims, handtekening] = jwtVoor(sa, 1_800_000_000).split(".");
    expect(createVerify("RSA-SHA256").update(`${kop}.${claims}`).verify(publicKey, Buffer.from(handtekening ?? "", "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(claims ?? "", "base64url").toString())).toEqual({
      iss: "zf@p.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
  });
});
