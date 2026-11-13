import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// WhatsApp-uitbouw stap 9 (13 nov): linkvoorbeelden (titel, omschrijving, site). Bewust zonder afbeelding, nooit een
// eenmalige of geheime link ophalen, en het ophalen gaat via de SSRF-wacht van lib/website-check/fetch.ts.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void kv.delete(k),
  kvAppend: async (k: string, v: unknown) => void kv.set(k, [...((kv.get(k) as unknown[]) ?? []), structuredClone(v)]),
  kvListValues: async (prefix: string) => [...kv.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v)),
}));
const fetchPage = vi.fn();
vi.mock("@/lib/website-check/fetch", () => ({ fetchPage: (...a: unknown[]) => fetchPage(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { leesVoorbeeld, voorbeeldLink } from "@/lib/messaging/link-voorbeeld";
import { maakLinkVoorbeeld } from "@/lib/messaging/link-voorbeeld-ophalen";
import { editMessage, getMessages, postMessage, type ChatThread } from "@/lib/messaging/store";

beforeEach(() => {
  kv.clear();
  kv.set("chat-thread:t1", { id: "t1", kind: "direct", participants: ["a", "b"], createdAt: "", lastMessageAt: "", lastMessage: null, meta: {}, reads: {} } as ChatThread);
  fetchPage.mockReset();
});

const pagina = (html: string, type = "text/html; charset=utf-8") => ({ status: 200, headers: { "content-type": type }, body: html, finalUrl: "https://www.voorbeeld.nl/vacature/42" });
const HTML = `<html><head><title>Reserve-titel</title>
<meta content="Kok gezocht in Utrecht &amp; omstreken" property="og:title">
<meta name="description" content="Wij zoeken per direct een kok voor 3 diensten per week. Goede sfeer, eerlijk loon.">
<meta property="og:site_name" content="Voorbeeld Werk"></head><body>…</body></html>`;

describe("welke link een voorbeeld krijgt", () => {
  it("de eerste gewone link, zonder #, ook als hij met www. begint", () => {
    expect(voorbeeldLink("Kijk: https://www.voorbeeld.nl/vacature/42#boven!")).toBe("https://www.voorbeeld.nl/vacature/42");
    expect(voorbeeldLink("zie www.zekerflex.com.")).toBe("https://www.zekerflex.com/");
    expect(voorbeeldLink("geen link hier")).toBeNull();
  });

  it("nooit een link die naar iets eenmaligs of geheims ruikt", () => {
    for (const geheim of [
      "https://x.nl/login?next=/",
      "https://x.nl/reset-password/abc",
      "https://x.nl/auth/callback?code=123",
      "https://x.nl/nieuwsbrief/afmelden/7",
      "https://x.nl/community/join/abc/def",
      "https://x.nl/a?t=aBcDeFgHiJkLmNoPqRsTuVwXyZ12",
      "https://jan:geheim@x.nl/",
    ]) {
      expect(voorbeeldLink(`hier: ${geheim}`), geheim).toBeNull();
    }
  });
});

describe("wat we uit de pagina halen", () => {
  it("og:title (in elke attribuutvolgorde), de omschrijving en de sitenaam; tekens netjes", () => {
    expect(leesVoorbeeld(HTML, "https://www.voorbeeld.nl/vacature/42")).toEqual({
      url: "https://www.voorbeeld.nl/vacature/42",
      host: "Voorbeeld Werk",
      titel: "Kok gezocht in Utrecht & omstreken",
      omschrijving: "Wij zoeken per direct een kok voor 3 diensten per week. Goede sfeer, eerlijk loon.",
    });
  });

  it("zonder og: de <title> en de host zonder www.; zonder titel geen voorbeeld; lange tekst ingekort", () => {
    expect(leesVoorbeeld("<title> Alleen  een titel </title>", "https://www.site.nl/x")).toEqual({ url: "https://www.site.nl/x", host: "site.nl", titel: "Alleen een titel" });
    expect(leesVoorbeeld("<p>niets</p>", "https://site.nl")).toBeNull();
    const lang = leesVoorbeeld(`<title>${"a".repeat(300)}</title>`, "https://site.nl");
    expect(lang?.titel.length).toBe(120);
    expect(lang?.titel.endsWith("…")).toBe(true);
  });
});

describe("na het versturen", () => {
  it("zet het voorbeeld in het bericht", async () => {
    fetchPage.mockResolvedValue(pagina(HTML));
    const m = await postMessage("t1", "a", "Is dit wat voor jou? https://www.voorbeeld.nl/vacature/42");
    await maakLinkVoorbeeld("t1", m);
    expect(fetchPage).toHaveBeenCalledWith("https://www.voorbeeld.nl/vacature/42", expect.objectContaining({ timeoutMs: 4000, maxRedirects: 3 }));
    expect((await getMessages("t1"))[0]?.linkVoorbeeld?.titel).toBe("Kok gezocht in Utrecht & omstreken");
  });

  it("geen HTML, een fout of een geheime link: geen voorbeeld (en een geheime link wordt niet eens opgehaald)", async () => {
    fetchPage.mockResolvedValue(pagina("%PDF", "application/pdf"));
    const pdf = await postMessage("t1", "a", "https://www.voorbeeld.nl/folder.pdf");
    await maakLinkVoorbeeld("t1", pdf);
    fetchPage.mockRejectedValue(new Error("x.nl reageerde niet binnen 4 seconden."));
    const traag = await postMessage("t1", "a", "https://x.nl/");
    await maakLinkVoorbeeld("t1", traag);
    fetchPage.mockClear();
    const geheim = await postMessage("t1", "a", "https://x.nl/reset-password/abc");
    await maakLinkVoorbeeld("t1", geheim);
    expect(fetchPage).not.toHaveBeenCalled();
    expect((await getMessages("t1")).some((x) => x.linkVoorbeeld)).toBe(false);
  });

  it("bewerkt vóórdat het voorbeeld er was, of daarna: geen oud voorbeeld bij nieuwe tekst", async () => {
    fetchPage.mockResolvedValue(pagina(HTML));
    const m = await postMessage("t1", "a", "https://www.voorbeeld.nl/vacature/42");
    await editMessage("t1", m.id, "toch niet");
    await maakLinkVoorbeeld("t1", m); // het voorbeeld hoort bij de oude tekst
    expect((await getMessages("t1"))[0]?.linkVoorbeeld).toBeUndefined();
    const n = await postMessage("t1", "a", "https://www.voorbeeld.nl/vacature/42");
    await maakLinkVoorbeeld("t1", n);
    await editMessage("t1", n.id, "andere tekst");
    expect((await getMessages("t1")).at(-1)?.linkVoorbeeld).toBeUndefined();
  });
});

describe("waar het in de code zit", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("de verzendroute maakt het voorbeeld na het antwoord; de bubbel toont geen afbeelding van de andere site", () => {
    expect(lees("app/api/inbox/[threadId]/route.ts")).toContain('if (input.kind === "text") after(() => maakLinkVoorbeeld(thread.id, msg));');
    const bubbel = lees("components/chat/MessageBubble.tsx");
    const start = bubbel.indexOf("{m.linkVoorbeeld && !m.deleted && (");
    const kaart = bubbel.slice(start, bubbel.indexOf("</a>", start));
    expect(start).toBeGreaterThan(-1);
    expect(kaart).not.toContain("<img");
    expect(kaart).toContain('rel="noopener noreferrer nofollow"');
  });

  it("ophalen alleen via de SSRF-wacht, en nooit de link zelf in een log", () => {
    const ophalen = lees("lib/messaging/link-voorbeeld-ophalen.ts");
    expect(ophalen).toContain('import { fetchPage } from "@/lib/website-check/fetch";');
    expect(ophalen).toContain("host: new URL(url).hostname");
    expect(ophalen).not.toMatch(/logger\.\w+\([^)]*\burl\b(?!\)\.hostname)/);
  });
});
