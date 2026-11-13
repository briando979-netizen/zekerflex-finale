import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mediaOverzicht } from "@/components/chat/media-overzicht";
import type { Msg } from "@/components/chat/shared";

// WhatsApp-uitbouw stap 5 (13 nov): "Media, links en documenten" van een gesprek, uit de berichten die al geladen
// zijn (dus dezelfde toegang en "verwijderen voor mij" als het gesprek zelf).

const bericht = (over: Partial<Msg>): Msg => ({ id: "m", threadId: "t1", from: "a", at: "2026-11-13T10:00:00+01:00", text: "", kind: "text", ...over }) as Msg;
const bijlage = (mimeType: string, filename: string) => ({ mediaId: `med-${filename}`, filename, mimeType, sizeBytes: 2048 });

describe("mediaOverzicht", () => {
  it("foto's en video's bij media, andere bestanden bij documenten, links uit de tekst; nieuwste eerst", () => {
    const o = mediaOverzicht([
      bericht({ id: "1", kind: "image", attachment: bijlage("image/jpeg", "a.jpg") }),
      bericht({ id: "2", kind: "file", attachment: bijlage("video/mp4", "klus.mp4") }),
      bericht({ id: "3", kind: "file", attachment: bijlage("application/pdf", "contract.pdf") }),
      bericht({ id: "4", text: "Kijk op www.zekerflex.com en https://example.org/x." }),
      bericht({ id: "5", kind: "voice", attachment: bijlage("audio/webm", "spraak.webm") }),
    ]);
    expect(o.media.map((m) => [m.id, m.soort])).toEqual([
      ["2", "video"],
      ["1", "foto"],
    ]);
    expect(o.docs.map((d) => d.filename)).toEqual(["contract.pdf"]);
    expect(o.links.map((l) => l.href)).toEqual(["https://www.zekerflex.com", "https://example.org/x"]);
  });

  it("laat verwijderde, nog niet verstuurde en mislukte berichten en systeemregels weg", () => {
    const o = mediaOverzicht([
      bericht({ id: "1", kind: "image", attachment: bijlage("image/png", "weg.png"), deleted: true }),
      bericht({ id: "2", kind: "image", attachment: bijlage("image/png", "bezig.png"), pending: true }),
      bericht({ id: "3", kind: "file", attachment: bijlage("application/pdf", "mislukt.pdf"), failed: "netwerk" }),
      bericht({ id: "4", kind: "system", text: "zie https://zekerflex.com" }),
    ]);
    expect(o).toEqual({ media: [], docs: [], links: [] });
  });
});

describe("waar het in de code zit", () => {
  const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

  it("het gespreksmenu opent het overzicht; foto's klein in het raster, een tik opent het origineel", () => {
    expect(lees("components/chat/ThreadMenu.tsx")).toContain('<Item icon="🖼" label={t.mediaLinksDocs} onClick={() => done({ action: "media" })} />');
    const paneel = lees("components/chat/MediaOverzicht.tsx");
    expect(paneel).toContain("<img src={`${url(m.mediaId)}?klein=1`}");
    expect(paneel).toContain("onClick={() => onOpenImage(url(m.mediaId), m.filename)}");
    expect(paneel).toContain('<a href={`${url(d.mediaId)}?dl=1`}');
    expect(lees("components/chat/InboxPage.tsx")).toContain('if (a.action === "media") {');
  });
});
