// ---------------------------------------------------------------------------
// Pure hulpjes voor chatbijlagen, voor de server (lib/messaging/media.ts) én de chat zelf (Composer, MessageBubble):
// geen sharp, kv of prisma. Sinds 12 nov 2026 mag elk bestandstype in de chat (eigenaar: "zorg dat ik bij chat van
// zekerflex elke bestand type kan uploaden"). Veilig blijft het doordat alleen echte foto's, audio, video en platte tekst
// in de browser openen (opensInline in media.ts); al het andere wordt een download met nosniff en een sandbox-CSP.
// ---------------------------------------------------------------------------

/** Foto's die de chat als foto toont (en die de server opnieuw opslaat zonder GPS). Geen SVG: dat kan script bevatten. */
export const FOTO_TYPE = /^image\/(?:jpeg|png|gif|webp|avif|bmp|heic|heif)$/i;

export function isFotoType(mime: string): boolean {
  return FOTO_TYPE.test((mime || "").trim());
}

/** Video die de chat in de bubbel afspeelt (een gewone bijlage van het soort "file"; kan de browser hem niet, dan de downloadkaart). */
export function isVideoType(mime: string): boolean {
  return /^video\/[a-z0-9.+-]+$/i.test((mime || "").trim());
}

/** Soorten die een browser als pagina of script kan uitvoeren (html, svg, xml, javascript, php). */
const UITVOERBAAR_IN_BROWSER =
  /^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/(?:x-)?javascript|application\/(?:x-)?javascript|application\/ecmascript|text\/ecmascript|application\/x-httpd-php|text\/x-php)(?:\s*;|$)/i;

/**
 * Het type waaronder een chatbijlage wordt bewaard en geserveerd. Leeg, onzin of iets wat een browser kan uitvoeren
 * wordt `application/octet-stream`: zo toont geen enkel scherm het ooit als pagina of beeld, het blijft een download.
 */
export function chatOpslagType(mime: string): string {
  const m = (mime || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;.*)?$/.test(m)) return "application/octet-stream";
  if (UITVOERBAAR_IN_BROWSER.test(m)) return "application/octet-stream";
  return m;
}

/** Programma's en installatiebestanden: die mogen, maar de chat waarschuwt erbij (zoals een mailprogramma doet). */
const PROGRAMMA =
  /\.(?:exe|msi|msix|bat|cmd|com|scr|pif|vbs|vbe|js|jse|wsf|wsh|hta|ps1|psm1|reg|lnk|cpl|msc|jar|apk|aab|xapk|ipa|app|dmg|pkg|deb|rpm|run|sh|bin|iso|appimage)$/i;

export function isProgramma(filename: string): boolean {
  return PROGRAMMA.test((filename || "").trim());
}
