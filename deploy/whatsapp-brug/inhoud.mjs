// De gesprekken van de gekoppelde WhatsApp (15 nov 2026, eigenaar: "dat je de code moet scannen vanuit je eigen
// WhatsApp en de gesprekken live komen, zoals WhatsApp Web"). Puur, zonder Baileys: welk gesprek telt mee, wat is de
// tekst van een bericht, en het bijhouden van de laatste berichten per gesprek. brug.mjs gebruikt dit; de tests ook.

export const MAX_GESPREKKEN = 300;
export const MAX_PER_GESPREK = 200;

/** Een gewoon gesprek of een groep; geen status-updates, kanalen of verzendlijsten. */
export function isGesprekJid(jid) {
  return typeof jid === "string" && /^[\d-]{5,40}@(s\.whatsapp\.net|g\.us|lid)$/.test(jid);
}

/** De tekst van een bericht zoals het in de lijst hoort; null voor dingen zonder inhoud (reacties, systeemberichten). */
export function tekstVan(bericht) {
  const m = bericht?.ephemeralMessage?.message ?? bericht?.viewOnceMessage?.message ?? bericht?.viewOnceMessageV2?.message ?? bericht;
  if (!m || typeof m !== "object") return null;
  if (typeof m.conversation === "string" && m.conversation.trim()) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption ? `📷 ${m.imageMessage.caption}` : "📷 Foto";
  if (m.videoMessage) return m.videoMessage.caption ? `🎥 ${m.videoMessage.caption}` : "🎥 Video";
  if (m.audioMessage) return m.audioMessage.ptt ? "🎤 Spraakbericht" : "🎵 Geluid";
  if (m.documentMessage) return `📄 ${m.documentMessage.fileName || "Document"}`;
  if (m.documentWithCaptionMessage?.message?.documentMessage) return `📄 ${m.documentWithCaptionMessage.message.documentMessage.fileName || "Document"}`;
  if (m.stickerMessage) return "Sticker";
  if (m.locationMessage || m.liveLocationMessage) return "📍 Locatie";
  if (m.contactMessage) return `👤 ${m.contactMessage.displayName || "Contact"}`;
  if (m.pollCreationMessage || m.pollCreationMessageV3) return `📊 ${(m.pollCreationMessage ?? m.pollCreationMessageV3).name || "Peiling"}`;
  return null;
}

/** Baileys geeft tijden als getal of als Long; altijd milliseconden. */
export function tijdVan(ts) {
  const n = Number(typeof ts === "object" && ts !== null && typeof ts.toString === "function" ? ts.toString() : ts);
  return Number.isFinite(n) && n > 0 ? n * 1000 : Date.now();
}

/**
 * Een bericht in de gesprekken zetten (geen dubbelen, op tijd gesorteerd, hooguit MAX_PER_GESPREK per gesprek en
 * MAX_GESPREKKEN gesprekken). `nieuw`: binnengekomen terwijl de brug luisterde (telt als ongelezen).
 * Geeft true als er iets veranderde.
 */
export function voegToe(gesprekken, { jid, id, vanMij, tekst, tijd, naam }, nieuw = false) {
  if (!isGesprekJid(jid) || !id || !tekst) return false;
  let g = gesprekken.get(jid);
  if (!g) {
    g = { jid, naam: naam || null, berichten: [], ongelezen: 0, bijgewerkt: 0 };
    gesprekken.set(jid, g);
  }
  if (naam && !g.naam) g.naam = naam;
  if (g.berichten.some((b) => b.id === id)) return false;
  g.berichten.push({ id, vanMij: Boolean(vanMij), tekst: String(tekst).slice(0, 4000), tijd });
  g.berichten.sort((a, b) => a.tijd - b.tijd);
  if (g.berichten.length > MAX_PER_GESPREK) g.berichten.splice(0, g.berichten.length - MAX_PER_GESPREK);
  if (nieuw && !vanMij) g.ongelezen += 1;
  if (vanMij) g.ongelezen = 0;
  g.bijgewerkt = Math.max(g.bijgewerkt, tijd);
  if (gesprekken.size > MAX_GESPREKKEN) {
    const oudste = [...gesprekken.values()].sort((a, b) => a.bijgewerkt - b.bijgewerkt).slice(0, gesprekken.size - MAX_GESPREKKEN);
    for (const o of oudste) gesprekken.delete(o.jid);
  }
  return true;
}

/** De lijst voor het scherm: nieuwste eerst, met het laatste bericht. */
export function lijstVan(gesprekken, limiet = 200) {
  return [...gesprekken.values()]
    .filter((g) => g.berichten.length > 0)
    .sort((a, b) => b.bijgewerkt - a.bijgewerkt)
    .slice(0, limiet)
    .map((g) => {
      const l = g.berichten.at(-1);
      return { jid: g.jid, naam: g.naam, groep: g.jid.endsWith("@g.us"), ongelezen: g.ongelezen, bijgewerkt: g.bijgewerkt, laatste: l ? { tekst: l.tekst.slice(0, 160), tijd: l.tijd, vanMij: l.vanMij } : null };
    });
}
