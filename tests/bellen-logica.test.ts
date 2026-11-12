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

const VOOR_DE_VERTALING = {
  "components/chat/CallOverlay.tsx": { regels: 117, sha1: "62ae7bd09c69e92e0e6717e2f11a2f2cdbc5172d" },
  "components/chat/ChatDock.tsx": { regels: 102, sha1: "958571128663b72435ed35fa72ec0250a26e1b6c" },
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
