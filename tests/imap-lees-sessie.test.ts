import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { openLeesSessie } from "@/lib/mail/imap";
import { rondBouncesAf, type BounceAfhankelijkheden } from "@/lib/mail/bounce-ronde";

// Eén IMAP-sessie per bounce-ronde (14 nov): eerst opende elke terugkaatser een eigen verbinding met een eigen login op
// de postbus die ook SMTP en de offerte-AI gebruiken. Een nep-IMAP-server telt de logins en de commando's.

const BERICHT = "From: postmaster@outlook.com\r\nSubject: Undeliverable: x\r\n\r\nFinal-Recipient: rfc822;a@b.test\r\nStatus: 5.1.1\r\n";

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
          sock.write(`${tag} OK ingelogd\r\n`);
        } else if (cmd === "EXAMINE INBOX") {
          sock.write(`* 3 EXISTS\r\n${tag} OK [READ-ONLY] klaar\r\n`);
        } else if (cmd.startsWith("FETCH ")) {
          for (const [seq, uid] of [[1, 11], [2, 12], [3, 13]]) {
            sock.write(`* ${seq} FETCH (UID ${uid} FLAGS () ENVELOPE ("Sat, 07 Nov 2026 16:50:48 +0100" "Undeliverable: x" (("Postmaster" NIL "postmaster" "outlook.com")) NIL NIL NIL NIL NIL NIL "<m${uid}@x>"))\r\n`);
          }
          sock.write(`${tag} OK klaar\r\n`);
        } else if (/^UID FETCH 12 /.test(cmd)) {
          sock.write(`${tag} NO dit bericht is weg\r\n`);
        } else if (cmd.startsWith("UID FETCH ")) {
          const uid = cmd.split(" ")[2];
          sock.write(`* 1 FETCH (UID ${uid} BODY[] {${Buffer.byteLength(BERICHT)}}\r\n${BERICHT})\r\n${tag} OK klaar\r\n`);
        } else if (cmd === "LOGOUT") {
          sock.write(`* BYE tot ziens\r\n${tag} OK\r\n`);
          sock.end();
        } else {
          sock.write(`${tag} BAD onbekend\r\n`);
        }
      }
    });
  });
  return new Promise<{ port: number; commandos: string[]; logins: () => number; stop: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, commandos, logins: () => logins, stop: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

let stoppen: (() => Promise<void>) | null = null;
afterEach(async () => {
  await stoppen?.();
  stoppen = null;
});

describe("één leessessie per ronde", () => {
  it("één login voor de lijst en alle berichten; alleen lezen (EXAMINE, BODY.PEEK); netjes afgesloten", async () => {
    const s = await nepServer();
    stoppen = s.stop;
    const sessie = await openLeesSessie({ host: "127.0.0.1", port: s.port, secure: false, user: "u", pass: "p", timeout: 5 }, 10);
    const lijst = await sessie.lijst(200);
    expect(lijst.map((e) => e.uid)).toEqual([13, 12, 11]);
    expect(lijst[0]).toMatchObject({ fromAddress: "postmaster@outlook.com", subject: "Undeliverable: x" });
    expect(await sessie.ruw(11)).toContain("Final-Recipient: rfc822;a@b.test");
    // een bericht dat er niet meer is: een fout voor dat bericht, de sessie gaat door
    await expect(sessie.ruw(12)).rejects.toThrow();
    expect(await sessie.ruw(13)).toContain("Status: 5.1.1");
    await sessie.sluit();
    await sessie.sluit(); // twee keer sluiten mag
    expect(s.logins()).toBe(1);
    expect(s.commandos).toContain("EXAMINE INBOX");
    expect(s.commandos.some((c) => /SELECT|STORE|\\Seen/i.test(c))).toBe(false);
    expect(s.commandos.filter((c) => c.startsWith("UID FETCH")).every((c) => c.includes("BODY.PEEK[]"))).toBe(true);
    expect(s.commandos.at(-1)).toBe("LOGOUT");
  });

  it("hooguit zoveel berichten per sessie; na sluiten niets meer", async () => {
    const s = await nepServer();
    stoppen = s.stop;
    const sessie = await openLeesSessie({ host: "127.0.0.1", port: s.port, secure: false, user: "u", pass: "p", timeout: 5 }, 1);
    expect(await sessie.ruw(11)).not.toBeNull();
    expect(await sessie.ruw(13)).toBeNull(); // grens bereikt: geen commando meer
    await sessie.sluit();
    expect(await sessie.ruw(11)).toBeNull();
    expect(s.commandos.filter((c) => c.startsWith("UID FETCH"))).toHaveLength(1);
  });
});

describe("de ronde sluit de postbus altijd af", () => {
  const basis = (): BounceAfhankelijkheden & { gesloten: number; opgehaald: number[] } => {
    const d = {
      gesloten: 0,
      opgehaald: [] as number[],
      aan: async () => false,
      lijst: async () => [11, 12, 13].map((u) => ({ berichtUid: u, date: "Sat, 07 Nov 2026 16:50:48 +0100", fromAddress: "postmaster@outlook.com", subject: "Undeliverable: x" })),
      ruw: async (u: number) => {
        d.opgehaald.push(u);
        if (u === 12) throw new Error("postbus haperde");
        return BERICHT;
      },
      merk: async () => null,
      zetMerk: async () => undefined,
      merken: async () => [],
      hard: async () => ({ onderdrukt: false, leads: 0 }),
      zacht: async () => false,
      beleid: async () => false,
      mailLog: async () => false,
      bewaar: async () => undefined,
      ruimOp: async () => undefined,
      sluit: async () => void (d.gesloten += 1),
    };
    return d;
  };

  it("een fout bij één bericht houdt de rest niet tegen; daarna één keer sluiten", async () => {
    const d = basis();
    const m = await rondBouncesAf(d, new Date("2026-11-14T03:35:00+00:00"));
    expect(d.opgehaald).toEqual([11, 12, 13]);
    expect(m.nieuw).toBe(2);
    expect(d.gesloten).toBe(1);
  });

  it("ook als de KV voor één bericht faalt", async () => {
    const d = basis();
    d.merk = async (u: number) => {
      if (u === 13) throw new Error("kv weg");
      return null;
    };
    d.ruw = async (u: number) => (d.opgehaald.push(u), BERICHT);
    const m = await rondBouncesAf(d, new Date("2026-11-14T03:35:00+00:00"));
    expect(m.nieuw).toBe(2);
    expect(d.gesloten).toBe(1);
  });

  it("ook als de postbus niet open gaat", async () => {
    const d = basis();
    d.lijst = async () => {
      throw Object.assign(new Error("ECONNREFUSED"), { name: "ImapError" });
    };
    const m = await rondBouncesAf(d, new Date("2026-11-14T03:35:00+00:00"));
    expect(m.fout).toBe("postbus niet te lezen (ImapError)");
    expect(d.gesloten).toBe(1);
  });
});
