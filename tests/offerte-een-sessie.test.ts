import net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De offerte-AI leest info@ in één IMAP-sessie (14 nov), zoals de bounce-ronde: eerst opende elk bericht een eigen
// login, en fetchMessageContent zette elk gelezen bericht op gelezen (bedoeld voor het Postvak in, waar een mens opent).
// Een nep-IMAP-server telt de logins en de commando's.

const h = vi.hoisted(() => ({ port: 0, kv: new Map<string, unknown>(), chats: 0 }));
vi.mock("@/lib/mail", () => ({
  imapConfig: () => ({ host: "127.0.0.1", port: h.port, secure: false, user: "u", pass: "p", timeout: 5 }),
  sendMail: async () => ({ id: "m", delivered: true, transport: "smtp" }),
  mailShell: (t: string, b: string) => `${t}${b}`,
}));
vi.mock("@/lib/ai/client", () => ({
  ensureAiNode: async () => undefined,
  llmConfigProblem: () => null,
  fastModel: () => "nep",
  chat: async () => {
    h.chats += 1;
    return { text: JSON.stringify({ isOffer: false, confidence: 0.1, samenvatting: "geen offerte" }) };
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async () => [],
}));
vi.mock("@/lib/sales/leads", () => ({ createLead: async () => ({ id: "lead" }) }));

import { sweepSalesOffers } from "@/lib/sales/offers";

const MAILS: Record<number, { van: [string, string]; onderwerp: string; tekst: string }> = {
  21: { van: ["klant", "bedrijf.test"], onderwerp: "Offerte voor drie kelners", tekst: "Wij zoeken zaterdag drie kelners." },
  22: { van: ["postmaster", "outlook.com"], onderwerp: "Undeliverable: x", tekst: "Final-Recipient: rfc822;a@b.test" },
  23: { van: ["jan", "bedrijf.test"], onderwerp: "Vraag", tekst: "Hoe werkt het?" },
};

function nepServer() {
  const commandos: string[] = [];
  let logins = 0;
  const server = net.createServer((sock) => {
    sock.write("* OK nep-IMAP klaar\r\n");
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const regel = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const [tag, ...rest] = regel.split(" ");
        const cmd = rest.join(" ");
        commandos.push(cmd.startsWith("LOGIN") ? "LOGIN" : cmd);
        if (cmd.startsWith("LOGIN")) {
          logins += 1;
          sock.write(`${tag} OK\r\n`);
        } else if (cmd === "EXAMINE INBOX") {
          sock.write(`* 3 EXISTS\r\n${tag} OK [READ-ONLY]\r\n`);
        } else if (cmd.startsWith("FETCH ")) {
          [21, 22, 23].forEach((uid, n) => {
            const m = MAILS[uid]!;
            sock.write(`* ${n + 1} FETCH (UID ${uid} FLAGS () ENVELOPE ("Sat, 14 Nov 2026 03:00:00 +0100" "${m.onderwerp}" ((NIL NIL "${m.van[0]}" "${m.van[1]}")) NIL NIL NIL NIL NIL NIL "<m${uid}@x>"))\r\n`);
          });
          sock.write(`${tag} OK\r\n`);
        } else if (cmd.startsWith("UID FETCH ")) {
          const uid = Number(cmd.split(" ")[2]);
          const m = MAILS[uid]!;
          const ruw = `From: ${m.van[0]}@${m.van[1]}\r\nSubject: ${m.onderwerp}\r\nContent-Type: text/plain\r\n\r\n${m.tekst}\r\n`;
          sock.write(`* 1 FETCH (UID ${uid} BODY[] {${Buffer.byteLength(ruw)}}\r\n${ruw})\r\n${tag} OK\r\n`);
        } else if (cmd === "LOGOUT") {
          sock.write(`* BYE\r\n${tag} OK\r\n`);
          sock.end();
        } else {
          sock.write(`${tag} BAD\r\n`);
        }
      }
    });
  });
  return new Promise<{ commandos: string[]; logins: () => number; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      h.port = (server.address() as net.AddressInfo).port;
      resolve({ commandos, logins: () => logins, stop: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

let stop: (() => Promise<void>) | null = null;
beforeEach(() => {
  h.kv.clear();
  h.chats = 0;
});
afterEach(async () => {
  await stop?.();
  stop = null;
});

describe("de offerte-AI leest in één sessie", () => {
  it("1 login voor de lijst en de berichten; een terugkaatser niet opgehaald; niets op gelezen; netjes uitgelogd", async () => {
    const s = await nepServer();
    stop = s.stop;
    const r = await sweepSalesOffers(15);
    expect(r).toMatchObject({ ok: true, scanned: 2, offers: 0, errors: [] });
    expect(h.chats).toBe(2);
    expect(s.logins()).toBe(1);
    // nieuwste eerst, zoals fetchInboxList
    expect(s.commandos.filter((c) => c.startsWith("UID FETCH"))).toEqual(["UID FETCH 23 (BODY.PEEK[])", "UID FETCH 21 (BODY.PEEK[])"]);
    expect(s.commandos.some((c) => /SELECT|STORE|\\Seen/i.test(c))).toBe(false);
    expect(s.commandos.at(-1)).toBe("LOGOUT");
    // dubbel verwerken voorkomt offer:seen, voor elk bericht (ook de overgeslagen terugkaatser)
    expect([...h.kv.keys()].filter((k) => k.startsWith("offer:seen:")).sort()).toEqual(["offer:seen:21", "offer:seen:22", "offer:seen:23"]);
  });

  it("een tweede ronde haalt niets opnieuw op", async () => {
    const s = await nepServer();
    stop = s.stop;
    await sweepSalesOffers(15);
    const voor = s.commandos.filter((c) => c.startsWith("UID FETCH")).length;
    await sweepSalesOffers(15);
    expect(s.commandos.filter((c) => c.startsWith("UID FETCH")).length).toBe(voor);
    expect(s.logins()).toBe(2); // één per ronde
  });

  it("de postbus niet bereikbaar: een reden, geen crash", async () => {
    h.port = 1; // niemand luistert
    const r = await sweepSalesOffers(15);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/^inbox lezen mislukte: /);
  });
});
