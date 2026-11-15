import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Je eigen WhatsApp live in Admin → WhatsApp (15 nov 2026): de brug (deploy/whatsapp-brug) en de app-kant.

vi.mock("@/lib/env", async (orig) => {
  const mod = await orig<typeof import("@/lib/env")>();
  return { ...mod, env: { ...mod.env, WHATSAPP_BRUG_URL: "http://whatsapp-brug:3900", WHATSAPP_BRUG_TOKEN: "t".repeat(24) } };
});

import { env } from "@/lib/env";
import { geldigeJid, toonNaam } from "@/lib/whatsapp/live";
import { liveStand } from "@/lib/whatsapp/brug";

type Inhoud = {
  MAX_PER_GESPREK: number;
  isGesprekJid: (j: unknown) => boolean;
  tekstVan: (m: unknown) => string | null;
  tijdVan: (t: unknown) => number;
  voegToe: (g: Map<string, { berichten: { id: string }[]; ongelezen: number; naam: string | null }>, b: Record<string, unknown>, nieuw?: boolean) => boolean;
  lijstVan: (g: Map<string, unknown>) => { jid: string; laatste: { tekst: string } | null; ongelezen: number }[];
};
let w: Inhoud;
beforeAll(async () => {
  w = (await import(/* @vite-ignore */ new URL("../deploy/whatsapp-brug/inhoud.mjs", import.meta.url).href)) as Inhoud;
});
afterEach(() => vi.unstubAllGlobals());

describe("de brug: wat er in de gesprekken komt", () => {
  it("gewone gesprekken en groepen; geen status, kanalen of verzendlijsten", () => {
    expect(w.isGesprekJid("31612345678@s.whatsapp.net")).toBe(true);
    expect(w.isGesprekJid("120363025246125486@g.us")).toBe(true);
    expect(w.isGesprekJid("123456789012345@lid")).toBe(true);
    expect(w.isGesprekJid("status@broadcast")).toBe(false);
    expect(w.isGesprekJid("120363012345@newsletter")).toBe(false);
    expect(w.isGesprekJid("1234@broadcast")).toBe(false);
  });

  it("de tekst van een bericht, ook bij foto's, spraak en documenten; niets bij reacties", () => {
    expect(w.tekstVan({ conversation: "Hoi" })).toBe("Hoi");
    expect(w.tekstVan({ extendedTextMessage: { text: "Zie link" } })).toBe("Zie link");
    expect(w.tekstVan({ imageMessage: { caption: "De bon" } })).toBe("📷 De bon");
    expect(w.tekstVan({ imageMessage: {} })).toBe("📷 Foto");
    expect(w.tekstVan({ audioMessage: { ptt: true } })).toBe("🎤 Spraakbericht");
    expect(w.tekstVan({ documentMessage: { fileName: "factuur.pdf" } })).toBe("📄 factuur.pdf");
    expect(w.tekstVan({ ephemeralMessage: { message: { conversation: "Verdwijnt" } } })).toBe("Verdwijnt");
    expect(w.tekstVan({ reactionMessage: { text: "👍" } })).toBeNull();
    expect(w.tekstVan({ protocolMessage: {} })).toBeNull();
    expect(w.tekstVan(null)).toBeNull();
  });

  it("tijden als getal of Long, in milliseconden", () => {
    expect(w.tijdVan(1794700000)).toBe(1794700000000);
    expect(w.tijdVan({ toString: () => "1794700000" })).toBe(1794700000000);
  });

  it("geen dubbelen, op volgorde, ongelezen alleen voor nieuwe berichten van een ander, en een grens per gesprek", () => {
    const g = new Map();
    const jid = "31612345678@s.whatsapp.net";
    expect(w.voegToe(g, { jid, id: "b", vanMij: false, tekst: "tweede", tijd: 2000, naam: "Jan" }, true)).toBe(true);
    expect(w.voegToe(g, { jid, id: "a", vanMij: false, tekst: "eerste", tijd: 1000 }, false)).toBe(true);
    expect(w.voegToe(g, { jid, id: "b", vanMij: false, tekst: "tweede", tijd: 2000 }, true)).toBe(false);
    const gesprek = g.get(jid);
    expect(gesprek.berichten.map((b: { id: string }) => b.id)).toEqual(["a", "b"]);
    expect(gesprek.ongelezen).toBe(1);
    expect(gesprek.naam).toBe("Jan");
    w.voegToe(g, { jid, id: "c", vanMij: true, tekst: "antwoord", tijd: 3000 });
    expect(g.get(jid).ongelezen).toBe(0);
    for (let i = 0; i < w.MAX_PER_GESPREK + 20; i++) w.voegToe(g, { jid, id: `x${i}`, vanMij: false, tekst: "x", tijd: 4000 + i });
    expect(g.get(jid).berichten.length).toBe(w.MAX_PER_GESPREK);
    expect(w.lijstVan(g)[0]?.laatste?.tekst).toBe("x");
    expect(w.voegToe(g, { jid: "status@broadcast", id: "s", vanMij: false, tekst: "status", tijd: 1 })).toBe(false);
  });
});

describe("de app-kant", () => {
  it("geldige gesprekken en een leesbare naam zonder naam", () => {
    expect(geldigeJid("31612345678@s.whatsapp.net")).toBe(true);
    expect(geldigeJid("../geheim")).toBe(false);
    expect(toonNaam({ jid: "31612345678@s.whatsapp.net", naam: null })).toBe("+31 6 1234 5678");
    expect(toonNaam({ jid: "4915123456789@s.whatsapp.net", naam: "  " })).toBe("+4915123456789");
    expect(toonNaam({ jid: "120363025246125486@g.us", naam: null, groep: true })).toBe("Groep");
    expect(toonNaam({ jid: "31612345678@s.whatsapp.net", naam: "Bakker Jan" })).toBe("Bakker Jan");
  });

  it("niet gekoppeld: de koppelcode als SVG; gekoppeld: geen code", async () => {
    const code = `2@${"A".repeat(60)},${"B".repeat(40)},${"C".repeat(40)}`;
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/gezond")
        ? new Response(JSON.stringify({ ok: true, verbonden: false, wachtOpQr: true, gesprekken: 0 }))
        : new Response(code),
    );
    vi.stubGlobal("fetch", fetchMock);
    const stand = await liveStand();
    expect(stand).toMatchObject({ ingericht: true, verbonden: false, wachtOpQr: true });
    expect(stand.qrSvg).toMatch(/^<svg/);
    // de sleutel gaat mee als Bearer, nooit in de URL
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${"t".repeat(24)}`);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, verbonden: true, wachtOpQr: false, gesprekken: 12 }))));
    expect(await liveStand()).toEqual({ ingericht: true, verbonden: true, wachtOpQr: false, qrSvg: null, gesprekken: 12 });
  });

  it("zonder sleutel op de server: niet ingericht, en niets naar de brug", async () => {
    const e = env as { WHATSAPP_BRUG_URL?: string | undefined };
    const oud = e.WHATSAPP_BRUG_URL;
    e.WHATSAPP_BRUG_URL = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await liveStand()).ingericht).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    e.WHATSAPP_BRUG_URL = oud;
  });
});

describe("bewaker: met je eigen nummer antwoordt de spoedoproep niet vanzelf", () => {
  it("doorsturen naar /api/whatsapp/inkomend alleen met BRUG_SPOED=1, en geen berichttekst in het log", () => {
    const brug = readFileSync(new URL("../deploy/whatsapp-brug/brug.mjs", import.meta.url), "utf8");
    expect(brug).toContain('const SPOED = process.env.BRUG_SPOED === "1";');
    expect(brug).toContain('if (!SPOED || type !== "notify") continue;');
    expect(brug).not.toMatch(/console\.(log|warn|error)\([^)]*\btekst\b/);
    const compose = readFileSync(new URL("../docker-compose.whatsapp.yml", import.meta.url), "utf8");
    expect(compose).toContain("BRUG_SPOED: ${WHATSAPP_BRUG_SPOED:-0}");
    // geen poort naar buiten (de opmerking "Geen `ports:`" telt niet)
    expect(compose).not.toMatch(/^\s+ports:/m);
  });
});
