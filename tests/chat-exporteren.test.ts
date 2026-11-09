import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { berichtTekst, chatAlsTekst, exportBestandsnaam, exportTijd } from "@/lib/messaging/export";
import type { ChatMessage } from "@/lib/messaging/store";

// maandag 9 november 2026, 14:03 Nederlandse tijd (13:03 UTC)
const NU = new Date("2026-11-09T14:03:00+01:00");

const bericht = (deel: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage => ({
  threadId: "t1",
  from: "a",
  at: "2026-11-04T09:00:00+01:00",
  text: "",
  kind: "text",
  ...deel,
});

describe("chat exporteren: tijden", () => {
  it("schrijft de Nederlandse tijd, ook als het in UTC nog de vorige dag is", () => {
    expect(exportTijd("2026-11-03T23:30:00Z")).toBe("04-11-2026 00:30");
    expect(exportTijd("2026-07-01T07:05:00Z")).toBe("01-07-2026 09:05"); // zomertijd
  });
});

describe("chat exporteren: berichten", () => {
  it("tekst, bewerkt, doorgestuurd, antwoord en automatisch antwoord", () => {
    expect(berichtTekst(bericht({ id: "1", text: "Ik ben er om 9 uur" }))).toBe("Ik ben er om 9 uur");
    expect(berichtTekst(bericht({ id: "2", text: "Om half 10", editedAt: "2026-11-04T09:15:00+01:00" }))).toBe("Om half 10 (bewerkt)");
    expect(berichtTekst(bericht({ id: "3", text: "Kijk", forwarded: true }))).toBe("(doorgestuurd) Kijk");
    expect(berichtTekst(bericht({ id: "4", text: "Prima", replyTo: { id: "1", from: "b", excerpt: "Kun je\nmorgen?", kind: "text" } }))).toBe(
      '(antwoord op: "Kun je morgen?") Prima',
    );
    expect(berichtTekst(bericht({ id: "5", text: "Ik ben op vakantie", auto: true }))).toBe("Ik ben op vakantie (automatisch antwoord)");
  });

  it("een verwijderd bericht toont geen inhoud meer", () => {
    expect(berichtTekst(bericht({ id: "1", text: "", deleted: true, editedAt: "2026-11-04T09:15:00+01:00" }))).toBe("Dit bericht is verwijderd");
  });

  it("bijlagen gaan niet mee, maar de regel zegt wat er stond", () => {
    const bijlage = { mediaId: "m1", filename: "rooster.pdf", mimeType: "application/pdf", sizeBytes: 1000 };
    expect(berichtTekst(bericht({ id: "1", kind: "file", attachment: bijlage, text: "Het rooster" }))).toBe("📎 Bestand: rooster.pdf (niet meegenomen)\nHet rooster");
    expect(berichtTekst(bericht({ id: "2", kind: "image", attachment: { ...bijlage, filename: "foto.webp", mimeType: "image/webp" } }))).toBe(
      "📷 Foto: foto.webp (niet meegenomen)",
    );
    expect(berichtTekst(bericht({ id: "3", kind: "voice", attachment: { ...bijlage, durationSec: 72 } }))).toBe("🎤 Spraakbericht van 1:12 (niet meegenomen)");
  });

  it("locatie, gesprek en peiling", () => {
    expect(berichtTekst(bericht({ id: "1", kind: "location", location: { lat: 52.3731, lng: 4.8922, label: "Dam" } }))).toBe("📍 Locatie: Dam (52.37310, 4.89220)");
    expect(berichtTekst(bericht({ id: "2", kind: "call", call: { mode: "video", status: "ended", durationSec: 185 } }))).toBe("📹 Videogesprek beëindigd (3:05)");
    expect(berichtTekst(bericht({ id: "3", kind: "call", call: { mode: "audio", status: "missed" } }))).toBe("📞 Gesprek gemist");
    const poll = {
      options: [
        { id: "x", text: "Ik" },
        { id: "y", text: "Niet" },
      ],
      multi: false,
      votes: { x: ["a"], y: ["b", "c"] },
    };
    expect(berichtTekst(bericht({ id: "4", kind: "poll", text: "Wie kan zaterdag?", poll }))).toBe("📊 Peiling: Wie kan zaterdag?\n  • Ik (1 stem)\n  • Niet (2 stemmen)");
  });
});

describe("chat exporteren: het bestand", () => {
  it("kop, één regel per bericht met tijd en naam, systeembericht als ZekerFlex", () => {
    const tekst = chatAlsTekst(
      [
        bericht({ id: "1", from: "a", text: "Hoi Jan" }),
        bericht({ id: "2", from: "system", kind: "system", text: "De dienst is verzet naar 10:00", at: "2026-11-04T09:01:00+01:00" }),
        bericht({ id: "3", from: "weg", text: "Hallo", at: "2026-11-04T09:02:00+01:00" }),
      ],
      { a: "Piet Bakker", b: "Jan de Vries" },
      "Jan de Vries",
      NU,
    );
    expect(tekst.split("\n")).toEqual([
      "Chat met Jan de Vries, geëxporteerd uit ZekerFlex op 09-11-2026 14:03",
      "Foto's, spraakberichten en bestanden staan niet in dit bestand.",
      "",
      "[04-11-2026 09:00] Piet Bakker: Hoi Jan",
      "[04-11-2026 09:01] ZekerFlex: De dienst is verzet naar 10:00",
      "[04-11-2026 09:02] Onbekend: Hallo",
      "",
    ]);
  });

  it("een lege chat zegt dat er niets in staat", () => {
    expect(chatAlsTekst([], {}, "ZekerFlex Support", NU)).toContain("Er staan geen berichten in deze chat.");
  });

  it("bestandsnaam: alleen veilige tekens, met de Nederlandse datum", () => {
    expect(exportBestandsnaam("Jan de Vries", NU)).toBe("ZekerFlex-chat-jan-de-vries-2026-11-09.txt");
    expect(exportBestandsnaam('Café "Zeeël" / Groep', NU)).toBe("ZekerFlex-chat-cafe-zeeel-groep-2026-11-09.txt");
    expect(exportBestandsnaam("🙂", NU)).toBe("ZekerFlex-chat-gesprek-2026-11-09.txt");
    expect(exportBestandsnaam("x", new Date("2026-11-09T23:30:00Z"))).toBe("ZekerFlex-chat-x-2026-11-10.txt");
  });
});

describe("chat exporteren: bereikbaar in de chat", () => {
  const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

  it("het ⋯-menu van een chat heeft 'Chat exporteren' en de chat haalt het bestand op met de pincode", () => {
    expect(lees("components/chat/ThreadMenu.tsx")).toContain('label="Chat exporteren" onClick={() => done({ action: "export" })}');
    const inbox = lees("components/chat/InboxPage.tsx");
    expect(inbox).toContain("/api/inbox/${threadId}/export`, { cache: \"no-store\", headers: pinHeaders() }");
  });

  it("de route controleert toegang, vergrendeling en wat je zelf wiste", () => {
    const route = lees("app/api/inbox/[threadId]/export/route.ts");
    expect(route).toContain("canAccess(thread, p.userId, admin)");
    expect(route).toContain("checkChatPin(p.userId");
    expect(route).toContain("visibleFrom(prefs, thread.id)");
    expect(route).toContain("disappearCutoff(thread)");
  });
});
