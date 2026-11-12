import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { fetchInboxList, fetchKop, imapCommandoInMelding } from "@/lib/mail/imap";

// Een mislukte IMAP-login gaf "IMAP command failed: LOGIN "gebruiker" "wachtwoord" -> …" en die tekst komt in logs en
// API-antwoorden (Admin → Mailbox, agenda-scan, offerte-sweep). Het wachtwoord mag daar nooit in staan.

const WACHTWOORD = "Geheim-Wachtwoord-123";
const GEBRUIKER = "info@example.test";

let server: net.Server | null = null;

afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

/** Een nep-IMAP-server die elke LOGIN weigert, zoals TransIP doet bij een fout wachtwoord of te veel pogingen. */
async function weigerendeServer(): Promise<number> {
  server = net.createServer((s) => {
    s.write("* OK nep-IMAP klaar\r\n");
    s.on("data", (d) => {
      const tag = d.toString().split(" ")[0] ?? "x";
      s.write(`${tag} NO [AUTHENTICATIONFAILED] Authentication failed.\r\n`);
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
  return (server!.address() as net.AddressInfo).port;
}

describe("imapCommandoInMelding", () => {
  it("laat van LOGIN alleen het woord over", () => {
    expect(imapCommandoInMelding(`LOGIN "${GEBRUIKER}" "${WACHTWOORD}"`)).toBe("LOGIN");
    expect(imapCommandoInMelding(`login "${GEBRUIKER}" "${WACHTWOORD}"`)).toBe("LOGIN");
    expect(imapCommandoInMelding("AUTHENTICATE PLAIN AGluZm8AZ2VoZWlt")).toBe("AUTHENTICATE");
  });

  it("laat andere commando's heel (nuttig bij het zoeken naar fouten)", () => {
    expect(imapCommandoInMelding("SELECT INBOX")).toBe("SELECT INBOX");
    expect(imapCommandoInMelding("UID FETCH 12 (BODY.PEEK[HEADER])")).toBe("UID FETCH 12 (BODY.PEEK[HEADER])");
  });
});

describe("een geweigerde IMAP-login", () => {
  for (const [naam, lees] of [
    ["fetchInboxList", (port: number) => fetchInboxList({ host: "127.0.0.1", port, secure: false, user: GEBRUIKER, pass: WACHTWOORD, timeout: 5 }, 5)],
    ["fetchKop", (port: number) => fetchKop({ host: "127.0.0.1", port, secure: false, user: GEBRUIKER, pass: WACHTWOORD, timeout: 5 }, 1)],
  ] as const) {
    it(`${naam}: de fout noemt LOGIN en het antwoord, nooit het wachtwoord of de gebruikersnaam`, async () => {
      const port = await weigerendeServer();
      const fout = await lees(port).then(
        () => null,
        (e: unknown) => e,
      );
      expect(fout).toBeInstanceOf(Error);
      const melding = (fout as Error).message;
      expect(melding).toContain("LOGIN");
      expect(melding).toContain("AUTHENTICATIONFAILED");
      expect(melding).not.toContain(WACHTWOORD);
      expect(melding).not.toContain(GEBRUIKER);
    });
  }
});
