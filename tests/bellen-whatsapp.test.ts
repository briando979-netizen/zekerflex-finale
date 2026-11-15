import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BEL_NL } from "@/lib/chat/teksten-bel";
import { BEL_EN, BEL_PL, BEL_RO, BEL_UK } from "@/lib/chat/teksten-bel-talen";
import { DOCK_NL } from "@/lib/chat/teksten-dock";
import { DOCK_EN, DOCK_PL, DOCK_RO, DOCK_UK } from "@/lib/chat/teksten-dock-talen";

// Bellen en videobellen met dezelfde knoppen als WhatsApp (15 nov 2026, eigenaar). Eigen vormgeving, geen WhatsApp-merk.
// Het belscherm draait in de browser (WebRTC); hier wordt de bron bewaakt, het gedrag is met de hand en live getest.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
const overlay = lees("components/chat/CallOverlay.tsx");
const dock = lees("components/chat/ChatDock.tsx");
const binnen = lees("components/chat/BinnenkomendGesprek.tsx");

describe("belscherm: video aan midden in een spraakoproep", () => {
  it("een spraakoproep krijgt een lege videolijn, en de ander zet die op zenden en ontvangen", () => {
    expect(overlay).toContain('if (!stream.getVideoTracks().length) peer.addTransceiver("video", { direction: "sendrecv", streams: [stream] });');
    expect(overlay).toContain('if (t.receiver.track?.kind === "video" && t.direction === "recvonly") t.direction = "sendrecv";');
    // scherm delen zonder microfoon: de ander blijft hoorbaar
    expect(overlay).toContain('if (!stream.getAudioTracks().length) peer.addTransceiver("audio", { direction: "recvonly" });');
  });

  it("camera aan/uit gaat via replaceTrack (geen nieuwe onderhandeling) en wordt gemeld met het signaal media", () => {
    expect(overlay).toContain("await sender.replaceTrack(track)");
    expect(overlay).toContain("replaceTrack(null)");
    expect(overlay).toContain('post("media", { camera, scherm: Boolean(screenTrack.current) })');
    expect(overlay).toContain('} else if (s.type === "media") {');
    expect(lees("app/api/inbox/[threadId]/call/route.ts")).toMatch(/type: z\.enum\(\[[^\]]*"media"[^\]]*\]\)/);
  });

  it("camera wisselen: voor- en achtercamera, de oude camera stopt eerst", () => {
    expect(overlay).toContain('facingMode: { ideal: voor ? "user" : "environment" }');
    expect(overlay).toMatch(/for \(const t of stream\.getVideoTracks\(\)\) \{\s*t\.stop\(\);/);
  });
});

describe("belscherm: knoppen en beeld zoals bij WhatsApp", () => {
  it("ronde knoppen met iconen en een naam voor de schermlezer, geen emoji meer", () => {
    for (const icoon of ["IconMic", "IconMicOff", "IconVideo", "IconVideoOff", "IconCameraFlip", "IconPhoneDown", "IconScreenShare"]) expect(overlay).toContain(`<${icoon}`);
    expect(overlay).toContain("aria-pressed={aan}");
    for (const emoji of ["🎙️", "🔇", "📵", "📷", "🖥️"]) expect(overlay, emoji).not.toContain(emoji);
  });

  it("bij video verdwijnen de knoppen na 5 seconden en komen terug bij tikken", () => {
    expect(overlay).toContain("setTimeout(() => setKnoppen(false), 5000)");
    expect(overlay).toContain("aria-label={chat.bel.knoppenTonen}");
  });

  it("het eigen beeld is klein, versleepbaar en wisselt bij tikken met het grote", () => {
    expect(overlay).toContain("aria-label={chat.bel.beeldWisselen}");
    expect(overlay).toContain("onPointerDown={pipDown}");
    expect(overlay).toContain("touch-none");
    expect(overlay).toContain("setGrootIk((g) => !g)");
    // de voorcamera gespiegeld, zoals in een spiegel
    expect(overlay).toContain('-scale-x-100');
  });

  it("camera uit bij de ander: zijn foto en een zin, geen zwart vlak", () => {
    expect(overlay).toContain("vulIn(chat.bel.cameraStaatUit, { naam: peerName })");
  });
});

describe("gebeld worden", () => {
  it("volledig scherm op de telefoon met Weiger, Bericht en Opnemen; een kaart op de computer", () => {
    expect(dock).toContain("<BinnenkomendGesprek");
    expect(binnen).toContain('className="fixed inset-0 z-[2100]');
    expect(binnen).toContain("sm:right-4 sm:top-4 sm:w-[22rem]");
    for (const k of ["aria-label={chat.dock.weiger}", "aria-label={chat.dock.weigerMetBericht}", "aria-label={chat.dock.opnemen}"]) expect(binnen).toContain(k);
    // groen = doen, rood = probleem (één kleur, één betekenis)
    expect(binnen).toContain("bg-ok");
    expect(binnen).toContain("bg-crit");
  });

  it("weigeren met een bericht stuurt het antwoord in de chat en weigert de oproep", () => {
    expect(binnen).toContain("chat.dock.snelAntwoord1");
    expect(dock).toContain("const answerIncomingWithText = (text: string) => {");
    expect(dock).toContain("JSON.stringify({ text })");
    expect(dock).toContain("window.location.assign(`/berichten?thread=${encodeURIComponent(threadId)}`)");
  });
});

describe("teksten in vijf talen", () => {
  const nieuwBel = ["terugNaarChat", "videoAan", "videoUit", "cameraWisselen", "cameraStaatUit", "beeldWisselen", "knoppenTonen", "spraakoproep", "videooproep", "schermoproep", "cameraGeenToegang"] as const;
  const nieuwDock = ["bericht", "weigerMetBericht", "snelAntwoord1", "snelAntwoord2", "snelAntwoord3", "eigenBericht", "annuleren"] as const;
  it("elke nieuwe tekst is ingevuld in NL, EN, PL, RO en UK", () => {
    for (const t of [BEL_NL, BEL_EN, BEL_PL, BEL_RO, BEL_UK]) for (const k of nieuwBel) expect(t[k].trim().length, k).toBeGreaterThan(0);
    for (const t of [DOCK_NL, DOCK_EN, DOCK_PL, DOCK_RO, DOCK_UK]) for (const k of nieuwDock) expect(t[k].trim().length, k).toBeGreaterThan(0);
    for (const t of [BEL_NL, BEL_EN, BEL_PL, BEL_RO, BEL_UK]) expect(t.cameraStaatUit).toContain("{naam}");
  });
});

describe("tabblad dicht tijdens een oproep", () => {
  it("stuurt toch ophangen, zodat het bij de ander niet blijft overgaan", () => {
    expect(overlay).toContain('window.addEventListener("pagehide", weg);');
    expect(overlay).toContain("navigator.sendBeacon?.(`/api/inbox/${threadId}/call`, body);");
    expect(overlay).toContain('type: "end"');
  });
});

describe("een oproep ligt boven alles", () => {
  // 15 nov 2026, belproef met twee browsers: bij een nieuwe werker dekte de cookiebalk (z-[90]) de knop Opnemen af.
  it("het belscherm en gebeld worden liggen hoger dan elke andere laag in de app", () => {
    const loop = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? loop(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
    const bel = new Set(["components/chat/CallOverlay.tsx", "components/chat/BinnenkomendGesprek.tsx"]);
    let hoogste = 0;
    for (const f of [...loop(path.join(process.cwd(), "components")), ...loop(path.join(process.cwd(), "app"))]) {
      const rel = path.relative(process.cwd(), f).split(path.sep).join("/");
      if (bel.has(rel)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/\bz-\[(\d+)\]/g)) hoogste = Math.max(hoogste, Number(m[1]));
    }
    for (const f of bel) {
      const lagen = [...lees(f).matchAll(/\bfixed\b[^"`]*?\bz-\[(\d+)\]/g)].map((m) => Number(m[1]));
      expect(lagen.length, f).toBeGreaterThan(0);
      for (const z of lagen) expect(z, f).toBeGreaterThan(hoogste);
    }
  });
});
