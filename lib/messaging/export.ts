// ---------------------------------------------------------------------------
// Chat exporteren (Chats → ⋯ → "Chat exporteren"), zoals bij WhatsApp: het
// gesprek als gewoon tekstbestand, één regel per bericht met de Nederlandse
// tijd. Bijlagen (foto's, spraakberichten, bestanden) gaan niet mee; hun regel
// zegt wat er stond. Puur bestand (geen kv/prisma): de route
// (app/api/inbox/[threadId]/export) haalt de berichten en namen op.
// ---------------------------------------------------------------------------

import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import type { ChatMessage } from "@/lib/messaging/store";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "04-11-2026 09:05" in Nederlandse tijd (de server draait in UTC). */
export function exportTijd(at: string | Date): string {
  const p = amsterdamParts(new Date(at));
  return `${pad2(p.day)}-${pad2(p.month)}-${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

const duur = (sec: number) => `${Math.floor(sec / 60)}:${pad2(Math.round(sec % 60))}`;

const GESPREK: Record<NonNullable<ChatMessage["call"]>["status"], string> = {
  started: "gestart",
  ended: "beëindigd",
  missed: "gemist",
  declined: "geweigerd",
};

/** De inhoud van één bericht als tekst (zonder tijd en naam). */
export function berichtTekst(m: ChatMessage): string {
  if (m.deleted) return "Dit bericht is verwijderd";
  const onderschrift = m.text.trim() ? `\n${m.text.trim()}` : "";
  let tekst: string;
  switch (m.kind) {
    case "image":
      tekst = `📷 Foto${m.attachment ? `: ${m.attachment.filename}` : ""} (niet meegenomen)${onderschrift}`;
      break;
    case "file":
      tekst = `📎 Bestand${m.attachment ? `: ${m.attachment.filename}` : ""} (niet meegenomen)${onderschrift}`;
      break;
    case "voice":
      tekst = `🎤 Spraakbericht${m.attachment?.durationSec ? ` van ${duur(m.attachment.durationSec)}` : ""} (niet meegenomen)`;
      break;
    case "location":
      tekst = m.location
        ? `📍 Locatie${m.location.label ? `: ${m.location.label}` : ""} (${m.location.lat.toFixed(5)}, ${m.location.lng.toFixed(5)})`
        : "📍 Locatie";
      break;
    case "call": {
      const soort = m.call?.mode === "video" ? "📹 Videogesprek" : m.call?.mode === "screen" ? "🖥️ Scherm delen" : "📞 Gesprek";
      const stand = m.call ? ` ${GESPREK[m.call.status]}` : "";
      tekst = `${soort}${stand}${m.call?.durationSec ? ` (${duur(m.call.durationSec)})` : ""}`;
      break;
    }
    case "poll": {
      const keuzes = (m.poll?.options ?? []).map((o) => {
        const n = m.poll?.votes[o.id]?.length ?? 0;
        return `\n  • ${o.text} (${n === 1 ? "1 stem" : `${n} stemmen`})`;
      });
      tekst = `📊 Peiling: ${m.text}${m.poll?.closedAt ? " (gesloten)" : ""}${keuzes.join("")}`;
      break;
    }
    default:
      tekst = m.text;
  }
  if (m.replyTo) tekst = `(antwoord op: "${m.replyTo.excerpt.replace(/\s+/g, " ").slice(0, 60)}") ${tekst}`;
  if (m.forwarded) tekst = `(doorgestuurd) ${tekst}`;
  if (m.auto) tekst += " (automatisch antwoord)";
  if (m.editedAt) tekst += " (bewerkt)";
  return tekst;
}

/**
 * Het hele gesprek als tekst. `namen` geeft per userId de naam; een
 * systeembericht heet "ZekerFlex", een onbekende afzender "Onbekend".
 */
export function chatAlsTekst(berichten: ChatMessage[], namen: Record<string, string>, titel: string, now = new Date()): string {
  const kop = [
    `Chat met ${titel}, geëxporteerd uit ZekerFlex op ${exportTijd(now)}`,
    "Foto's, spraakberichten en bestanden staan niet in dit bestand.",
    "",
  ];
  const regels = berichten.map((m) => {
    const naam = m.from === "system" ? "ZekerFlex" : (namen[m.from] ?? "Onbekend");
    return `[${exportTijd(m.at)}] ${naam}: ${berichtTekst(m)}`;
  });
  if (regels.length === 0) regels.push("Er staan geen berichten in deze chat.");
  return [...kop, ...regels, ""].join("\n");
}

/** "ZekerFlex-chat-jan-de-vries-2026-11-04.txt": alleen veilige tekens in de bestandsnaam. */
export function exportBestandsnaam(titel: string, now = new Date()): string {
  const deel =
    titel
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "gesprek";
  return `ZekerFlex-chat-${deel}-${amsterdamDayKey(now)}.txt`;
}
