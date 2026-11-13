import { isVideoType } from "@/lib/messaging/bijlage";
import { linkParts, type Msg } from "./shared";

// ---------------------------------------------------------------------------
// "Media, links en documenten" van één gesprek, zoals WhatsApp (13 nov 2026). Puur: uit de berichten die de chat al
// geladen heeft (de laatste 400), dus geen eigen API en dezelfde toegang en "verwijderen voor mij" als het gesprek.
// Nieuwste eerst; verwijderde berichten en berichten die nog verstuurd worden tellen niet mee.
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  at: string;
  soort: "foto" | "video";
  mediaId: string;
  filename: string;
}
export interface DocItem {
  id: string;
  at: string;
  mediaId: string;
  filename: string;
  sizeBytes: number;
}
export interface LinkItem {
  id: string;
  at: string;
  href: string;
  tekst: string;
}

export function mediaOverzicht(messages: readonly Msg[]): { media: MediaItem[]; docs: DocItem[]; links: LinkItem[] } {
  const media: MediaItem[] = [];
  const docs: DocItem[] = [];
  const links: LinkItem[] = [];
  for (const m of [...messages].reverse()) {
    if (m.deleted || m.pending || m.failed || m.eenmalig) continue;
    const a = m.attachment;
    if (a && m.kind === "image") media.push({ id: m.id, at: m.at, soort: "foto", mediaId: a.mediaId, filename: a.filename });
    else if (a && m.kind === "file" && isVideoType(a.mimeType)) media.push({ id: m.id, at: m.at, soort: "video", mediaId: a.mediaId, filename: a.filename });
    else if (a && m.kind === "file") docs.push({ id: m.id, at: m.at, mediaId: a.mediaId, filename: a.filename, sizeBytes: a.sizeBytes });
    if (m.text && m.kind !== "system") {
      for (const p of linkParts(m.text)) if (p.link) links.push({ id: m.id, at: m.at, href: p.href, tekst: p.text });
    }
  }
  return { media, docs, links };
}
