import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Bellen is live gedrag (WebRTC, TURN, push bij een oproep). Toen de teksten van ChatDock en het belscherm (CallOverlay) vijftalig
// werden, mocht er niets aan de logica veranderen. Deze test bewaakt dat: alle regels met timers, belstatus/-fase, mediacode
// (RTCPeerConnection, getUserMedia, tracks, ICE), fetch, ringtone, effecten en hooks worden gehasht, op de versie van vóór de
// vertaling (12 nov 2026, 692f6cda). Een regel met een tekstsleutel (`chat.`) telt niet mee: dat is weergave. Verandert hier
// iets, dan is er logica aangeraakt: bekijk dan met `git diff` of dat bedoeld is en werk de hash pas daarna bij.

const RE =
  /RTCPeerConnection|getUserMedia|getDisplayMedia|setTimeout|setInterval|clearTimeout|clearInterval|addTrack|addIceCandidate|iceServers|onicecandidate|ontrack|createOffer|createAnswer|setLocalDescription|setRemoteDescription|getTracks|\.stop\(\)|fetch\(|useEffect|useRef|useCallback|useState|setStatus|setPhase|setCall|setIncoming|makeRingtone|ringtone|vibrate|status|"ringing"|"connecting"|"live"|"ended"|"failed"|phase|dispatchEvent|addEventListener|removeEventListener|\]\);|\], \[/;

const ROOT = process.cwd();
const logica = (f: string) =>
  readFileSync(path.join(ROOT, f), "utf8")
    .split("\r\n")
    .join("\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => RE.test(l) && !l.includes("chat."));
const sha = (a: string[]) => createHash("sha1").update(a.join("\n")).digest("hex");

// Bijgewerkt 15 nov 2026, bewust: belscherm zoals WhatsApp (ronde knoppen, video aan midden in een spraakoproep via een lege
// videolijn + replaceTrack, camera wisselen, signaal "media" voor camera aan/uit, knoppen verbergen bij video) en in ChatDock
// weigeren met een bericht; daarna (zelfde dag) "end" via sendBeacon bij pagehide. Regel voor regel nagelopen met git diff; tests/bellen-whatsapp.test.ts bewaakt het nieuwe gedrag.
//
// Bijgewerkt 28 nov 2026, bewust: ChatDock stopt met pollen bij een verlopen sessie. Gemeten in het Caddy-log: op 23 en 24
// november 17.494 en 15.016 keer een 401 op /api/inbox en twee andere adressen, uit 24 IP's — tabbladen die eeuwig doorvroegen
// terwijl de gebruiker niets meer te zien kreeg. De 401 loopt nu via lib/app/sessie-verlopen.ts en `available` staat in de
// dependency-lijst van drie effecten, zodat hun timers stoppen. 4 van de 103 logicaregels verschillen, alle vier nagerekend met
// git diff tegen 6f0a16cf5: de 401-regel en drie dependency-lijsten. De belcode (RTCPeerConnection, ICE, beltoon) en de poll op
// binnenkomende gesprekken zijn niet aangeraakt; `available` begint op true, dus voor wie ingelogd is verandert niets.
//
// Nog een keer bijgewerkt op 28 nov 2026, bewust: het hulpje heet nu `stopMetPollen` in plaats van `sessieVerlopen`, omdat het
// ook bij een 403 stopt (wel ingelogd, rol of bedrijf gewijzigd — 78 van die 403's op 24 nov; een reeks 403's laat CrowdSec het
// hele IP vier uur blokkeren). Eén van de 103 logicaregels verschilt, nagerekend tegen 357570ad0: alleen de naam in die ene
// regel. Het gedrag van de chat en het bellen is verder niet aangeraakt.
const VOOR_DE_VERTALING = {
  "components/chat/CallOverlay.tsx": { regels: 155, sha1: "7d264f8af5c31cb6511f3d0fee4ba895612221cb" },
  "components/chat/ChatDock.tsx": { regels: 103, sha1: "04ab7c83b32c3278272b9fa747081aa7477dfee1" },
} as const;

describe("bellen: de logica is gelijk gebleven aan vóór de vertaling", () => {
  for (const [bestand, verwacht] of Object.entries(VOOR_DE_VERTALING)) {
    it(`${bestand}: dezelfde ${verwacht.regels} regels met timers, status, media, fetch en effecten`, () => {
      const regels = logica(bestand);
      expect(regels.length).toBe(verwacht.regels);
      expect(sha(regels)).toBe(verwacht.sha1);
    });
  }

  it("de belstatussen en hun volgorde in het belscherm zijn ongewijzigd", () => {
    const src = readFileSync(path.join(ROOT, "components/chat/CallOverlay.tsx"), "utf8").split("\r\n").join("\n");
    for (const s of ["ringing", "connecting", "live", "ended", "failed"]) expect(src, s).toContain(`"${s}"`);
    // de getoonde tekst komt uit de teksten, de statuswaarde zelf blijft de sleutel
    expect(src).toContain("chat.bel.statusVerbinden");
    expect(src).not.toMatch(/setStatus\(chat\./);
  });

  it("alleen de werker-layout geeft vertalingen aan ChatDock; opdrachtgever en beheer blijven Nederlands", () => {
    expect(readFileSync(path.join(ROOT, "app/dashboard/layout.tsx"), "utf8")).toContain("<ChatDock texts={CHAT_TEKSTEN[locale]} />");
    for (const l of ["app/werkgever/layout.tsx", "app/admin/layout.tsx"]) expect(readFileSync(path.join(ROOT, l), "utf8"), l).toContain("<ChatDock />");
  });

  it("de ringtone en de media-/ICE-code staan niet in de tekstbestanden", () => {
    for (const f of ["lib/chat/teksten-dock.ts", "lib/chat/teksten-bel.ts"]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).not.toMatch(/RTCPeerConnection|getUserMedia|setTimeout|fetch\(/);
    }
  });
});
