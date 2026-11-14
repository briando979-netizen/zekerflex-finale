// ---------------------------------------------------------------------------
// Terugkaatsers (bounces) herkennen en lezen. Puur bestand: geen IMAP, KV of crypto, zodat het scherm (Beheer → Mail)
// en de tests het ook kunnen gebruiken. De ronde die de postbus leest staat in lib/mail/bounce-ronde.ts.
//
// Waarom (14 nov 2026): sendMail zet MAIL FROM gelijk aan de From (noreply@, nieuwsbrief@); de terugkaatsers komen in
// de INBOX van info@ terecht en niemand las ze. "Afgeleverd" in het mail-log betekende alleen dat TransIP de mail aannam:
// de nieuwsbrief van 7 nov werd 12 keer door Microsoft geweigerd ("5.7.1 … lacks SPF/DKIM/DMARC") zonder dat iemand het zag.
//
// Indeling per ontvanger:
//   hard   — het adres of domein bestaat niet (5.1.x, 5.2.1, 5.4.4/5.4.1): nooit meer outreach, nieuwsbrief of herinnering
//   beleid — de ontvanger weigert om wie wij zijn (5.7.x: SPF/DKIM/DMARC, spam, blokkade): niet de schuld van het adres,
//            dus niet onderdrukken, wel de eigenaar waarschuwen
//   zacht  — tijdelijk (4.x.x, uitgesteld, postbus vol): alleen tellen; drie keer binnen 7 dagen telt als hard
// ---------------------------------------------------------------------------

export type BounceSoort = "hard" | "beleid" | "zacht";

export interface BounceRegel {
  /** het adres dat niet aankwam, in kleine letters */
  ontvanger: string;
  /** RFC 3463-code, bijv. "5.1.1"; "?" als hij ontbreekt */
  code: string;
  soort: BounceSoort;
  /** korte uitleg van de ontvangende server, zonder adressen en IP-nummers */
  diagnose: string;
}

export interface BounceBericht {
  regels: BounceRegel[];
  /** de Message-ID van onze oorspronkelijke mail (zonder < >), als die terugkwam */
  origineelMessageId: string | null;
}

/** Alleen de kop van een bericht: komt het van een mailserver die meldt dat iets niet aankwam? (ook voor de offerte-AI) */
export function isBounceAfzender(van: string | null | undefined, onderwerp: string | null | undefined): boolean {
  const a = (van ?? "").toLowerCase();
  if (/(^|[<\s])(mailer-daemon|postmaster|mail-daemon|mailerdaemon)@/.test(a) || /^(mailer-daemon|postmaster)@/.test(a)) return true;
  return /^(undeliverable|undelivered mail|delivery status notification|mail delivery failed|returned mail|delivery failure|failure notice|onbestelbaar|niet afgeleverd|non remis|unzustellbar)\b/i.test((onderwerp ?? "").trim());
}

const MAANDEN: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Korte, veilige uitleg: zonder adressen, IP-nummers en lange id's; hooguit 160 tekens. */
export function veiligeDiagnose(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<adres>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\[[0-9a-f:.]{6,}\]/gi, "[<ip>]")
    .replace(/\b[A-Z0-9]{16,}\b/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/** Indeling van één code (en de uitleg erbij, voor servers die alleen "5.0.0" geven). */
export function soortVanCode(code: string, diagnose = "", actie = ""): BounceSoort {
  const d = diagnose.toLowerCase();
  if (/^delayed|^relayed|^delivered|^expanded/i.test(actie.trim())) return "zacht";
  if (code.startsWith("4.")) return "zacht";
  if (/^5\.7\./.test(code)) return "beleid";
  if (/^5\.1\.|^5\.2\.1$|^5\.4\.4$|^5\.4\.1$/.test(code)) return "hard";
  if (/^5\.2\.2$|^5\.2\.3$/.test(code)) return "zacht";
  // alleen 5.0.0 of geen code: lees de uitleg
  if (/spf|dkim|dmarc|spam|block ?list|blocklist|blocked|reputation|policy|not authorized|unauthenticated/.test(d)) return "beleid";
  if (/user unknown|unknown user|no such user|does not exist|doesn't exist|address rejected|mailbox unavailable|recipient not found|invalid recipient|no mailbox|bestaat niet|unrouteable|domain not found|host not found|nxdomain/.test(d)) return "hard";
  if (/quota|full|over quota|try again|temporar|later/.test(d)) return "zacht";
  // een onbekende permanente fout: voorzichtig, niet onderdrukken
  return "zacht";
}

/** Een kopregel uit een blok tekst (met vervolgregels die met witruimte beginnen). */
function kop(blok: string, naam: string): string | null {
  const m = new RegExp(`^${naam}:[ \\t]*([^\\r\\n]*(?:\\r?\\n[ \\t]+[^\\r\\n]*)*)`, "im").exec(blok);
  return m?.[1] ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : null;
}

/** Quoted-printable van een stuk tekst terug naar gewone tekst (alleen wat een DSN nodig heeft). */
function zonderQp(s: string): string {
  return /=\r?\n|=[0-9A-F]{2}/.test(s) ? s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))) : s;
}

/**
 * Lees een terugkaatser (het hele ruwe bericht). Geeft null als het geen terugkaatser is: een gewone mail (bijv. een
 * offerteaanvraag) heeft geen "Final-Recipient"/"Status"-blok en geen afzender als mailer-daemon.
 */
export function leesBounce(ruw: string): BounceBericht | null {
  const tekst = zonderQp(ruw.slice(0, 400_000));
  // de kop van de terugkaatser zelf: tot de eerste lege regel (daarna kunnen de kopregels van onze eigen mail staan)
  const eind = tekst.search(/\r?\n\r?\n/);
  const eigenKop = eind >= 0 ? tekst.slice(0, eind) : tekst.slice(0, 20_000);
  const isRapport = /content-type:\s*multipart\/report[^]*?report-type=["']?delivery-status/i.test(eigenKop);
  const van = kop(eigenKop, "From");
  const onderwerp = kop(eigenKop, "Subject");
  if (!isRapport && !isBounceAfzender(van, onderwerp)) return null;

  const regels: BounceRegel[] = [];
  // per ontvanger een blok dat begint met Final-Recipient (RFC 3464)
  const blokken = tekst.split(/(?=^Final-Recipient:)/im).slice(1);
  for (const b of blokken) {
    const ontvanger = (/rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/i.exec(kop(b, "Final-Recipient") ?? "")?.[1] ?? "").toLowerCase();
    if (!ontvanger) continue;
    const status = /([245])\.(\d{1,3})\.(\d{1,3})/.exec(kop(b, "Status") ?? "");
    const diagRuw = kop(b, "Diagnostic-Code") ?? "";
    const code = status ? `${status[1]}.${status[2]}.${status[3]}` : (/\b([45])\.(\d{1,3})\.(\d{1,3})\b/.exec(diagRuw)?.slice(1, 4).join(".") ?? "?");
    const actie = kop(b, "Action") ?? "";
    const diagnose = veiligeDiagnose(diagRuw.replace(/^smtp;\s*/i, ""));
    if (!regels.some((r) => r.ontvanger === ontvanger)) regels.push({ ontvanger, code, soort: soortVanCode(code, diagnose, actie), diagnose });
  }
  // geen RFC 3464-blok (een oude of eigenwijze server): het adres uit de tekst, alleen als er precies één staat
  if (regels.length === 0) {
    const adressen = [...new Set([...tekst.matchAll(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>\s*[:\r\n]/g)].map((m) => (m[1] ?? "").toLowerCase()))].filter((a) => !/^(mailer-daemon|postmaster)@/.test(a) && !/@zekerflex\.(com|nl)$/.test(a));
    const code = /\b([45])\.(\d{1,3})\.(\d{1,3})\b/.exec(tekst)?.slice(1, 4).join(".") ?? "?";
    const uitleg = /\b(5\d\d|4\d\d)[ -][^\r\n]{0,200}/.exec(tekst)?.[0] ?? "";
    if (adressen.length === 1 && adressen[0]) regels.push({ ontvanger: adressen[0], code, soort: soortVanCode(code, uitleg), diagnose: veiligeDiagnose(uitleg) });
  }
  if (regels.length === 0) return null;

  // de Message-ID van onze mail staat in het teruggestuurde deel (na het rapport), niet in de kop van de terugkaatser zelf
  const eigenId = kop(eigenKop, "Message-ID")?.replace(/^<|>$/g, "") ?? null;
  const ids = [...tekst.matchAll(/^Message-ID:\s*<([^>\s]+)>/gim)].map((m) => m[1] ?? "").filter((id) => id && id !== eigenId);
  const origineel = ids.find((id) => /@zekerflex\.(com|nl)$/i.test(id)) ?? null;
  return { regels, origineelMessageId: origineel };
}

/** Ons record-id uit de Message-ID van sendMail (`<id>@zekerflex.com`, lib/mail/index.ts); null als het niet de onze is. */
export function recordIdUitMessageId(messageId: string | null | undefined): string | null {
  const m = /^([a-f0-9-]{8,40})@zekerflex\.(com|nl)$/i.exec((messageId ?? "").trim());
  return m?.[1] ?? null;
}

/**
 * Mail die niet meer naar een adres met een harde terugkaatser gaat: outreach, nieuwsbrief en herinneringen.
 * Verificatie, wachtwoord, beveiliging, facturen en andere noodzakelijke mail gaan altijd door.
 */
export const BOUNCE_BLOK_SOORTEN: readonly string[] = [
  "sales-outreach",
  "nieuwsbrief",
  "onboarding-reminder",
  "onboarding",
  "reminder",
  "herinnering",
  "timesheet-reminder",
  "tip",
  "tips",
];

export function blokBijBounce(soort: string | null | undefined): boolean {
  return Boolean(soort && BOUNCE_BLOK_SOORTEN.includes(soort));
}

/** De datum van een IMAP-envelop ("Sat, 07 Nov 2026 16:50:48 +0100") als tijd; null als hij niet te lezen is. */
export function envelopDatum(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  const m = /(\d{1,2})[ -]([A-Za-z]{3})[ -](\d{4})/.exec(s);
  const maand = m?.[2] ? MAANDEN[m[2].toLowerCase()] : undefined;
  return m && maand !== undefined ? Date.UTC(Number(m[3]), maand, Number(m[1])) : null;
}

/** Welke grote aanbieder weigerde (voor de melding aan de eigenaar); alleen het soort, nooit het adres. */
export function aanbiederVan(adres: string): "microsoft" | "google" | "apple" | "yahoo" | "anders" {
  const d = adres.split("@")[1] ?? "";
  if (/(^|\.)(outlook|hotmail|live|msn)\.[a-z.]+$/.test(d)) return "microsoft";
  if (/(^|\.)(gmail|googlemail)\.com$/.test(d)) return "google";
  if (/(^|\.)(icloud|me|mac)\.com$/.test(d)) return "apple";
  if (/(^|\.)yahoo\.[a-z.]+$/.test(d)) return "yahoo";
  return "anders";
}

/** De status in Beheer → Mail: wat er met een verstuurde mail gebeurde. */
export function mailStatusLabel(m: { delivered: boolean; transport: string; suppressed?: string | undefined; bounce?: { soort: BounceSoort } | undefined }): { label: string; toon: "ok" | "warn" | "crit" | "neutral" } {
  if (m.suppressed) return /teruggekaatst/.test(m.suppressed) ? { label: "niet verstuurd (kaatst terug)", toon: "warn" } : { label: "afgemeld", toon: "warn" };
  if (m.bounce?.soort === "hard") return { label: "teruggekaatst", toon: "crit" };
  if (m.bounce?.soort === "beleid") return { label: "geweigerd", toon: "crit" };
  if (m.bounce?.soort === "zacht") return { label: "vertraagd", toon: "warn" };
  if (m.delivered) return { label: "afgeleverd", toon: "ok" };
  return m.transport === "smtp" ? { label: "mislukt", toon: "crit" } : { label: "lokaal", toon: "neutral" };
}
