// ---------------------------------------------------------------------------
// Wat een klik in de eigen analytics mag meenemen (12 nov 2026). Puur, en zonder lookbehind: de beacon in de browser
// (components/analytics/AnalyticsBeacon.tsx) en de server (lib/analytics/track.ts) gebruiken precies deze regels, en de
// eenmalige opschoning van bestaande labels ook (veiligLabel / bewaarLabel).
//
// Gemeten (droog, 31.227 labels): de naam van een gekozen bestand, e-mailadressen van afzenders en leads, IBAN-vormen
// in onderwerpregels, en ±165 labels op /admin/beller met het nummer en de naam van een gebelde lead. Daarom:
//  - een label met een bestandsnaam, e-mailadres, IBAN of telefoonnummer/lang getal (9+ cijfers) wordt in zijn
//    geheel vervangen ("bestand", "e-mailadres", "iban", "nummer"): een naam staat er vaak naast;
//  - op /admin en /studio alleen een label in codevorm (data-track, [a-z0-9-]): daar staan namen in de rijen;
//  - ook op elk scherm met berichten of een chat (een padstuk /berichten of /chat: de werker, de werkgever, /berichten,
//    de websitechat met bezoekers; 14 nov): een gespreksrij bevat de naam, de tijd en een stukje van het laatste bericht
//    ("BVJan de Vries14:06Jij: …"), gemeten: 1340 labels op die paden, waarvan 57 met een berichtvoorbeeld (sep–13 nov);
//  - context bij een klik (data-track-ctx="stap=selfie;reden=geen-gezicht") alleen met een vaste lijst sleutels en korte
//    codes [a-z0-9-]; al het andere valt weg. Zo komt er nooit tekst uit een beeld of de MRZ in.
// ---------------------------------------------------------------------------

const BESTAND = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?|pdf|docx?)\s*$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/;
// 9 of meer cijfers, eventueel met spaties of streepjes ertussen (telefoon met + of 0, BSN, rekeningnummer)
const LANG_GETAL = /\d(?:[\s-]?\d){8,}/;
const BEHEER = /^\/(admin|studio)(\/|$)|\/(berichten|chat)(\/|$)/;
const CODE = /^[a-z0-9][a-z0-9-]{0,59}$/;

/** Het label zoals het bewaard mag worden: het hele label vervangen als er iets persoonlijks in staat; null bij leeg. */
export function veiligLabel(label: string | null | undefined): string | null {
  const l = (label ?? "").trim();
  if (!l) return null;
  if (BESTAND.test(l)) return "bestand";
  if (EMAIL.test(l)) return "e-mailadres";
  if (IBAN.test(l)) return "iban";
  if (LANG_GETAL.test(l)) return "nummer";
  return label ?? null;
}

/** Een scherm met namen in de rijen (/admin, /studio, de chat): daar alleen labels in codevorm. */
export function isBeheerPad(pad: string | null | undefined): boolean {
  return BEHEER.test(pad ?? "");
}

/** Het label voor dit pad: op beheerschermen alleen een code (data-track), elders veiligLabel. */
export function bewaarLabel(pad: string | null | undefined, label: string | null | undefined): string | null {
  if (isBeheerPad(pad)) return label && CODE.test(label.trim()) ? label.trim() : null;
  return veiligLabel(label);
}

export const TRACK_CTX_SLEUTELS = ["stap", "kant", "stand", "wijze", "reden", "poging"] as const;
export type TrackCtxSleutel = (typeof TRACK_CTX_SLEUTELS)[number];
export type TrackCtx = Partial<Record<TrackCtxSleutel, string>>;

const SLEUTELS: ReadonlySet<string> = new Set(TRACK_CTX_SLEUTELS);
const WAARDE = /^[a-z0-9-]{1,30}$/;

/** Alleen bekende sleutels met een geldige code; null als er niets overblijft. */
export function schoonTrackCtx(v: unknown): TrackCtx | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const uit: TrackCtx = {};
  for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
    if (SLEUTELS.has(k) && typeof w === "string" && WAARDE.test(w)) uit[k as TrackCtxSleutel] = w;
  }
  return Object.keys(uit).length > 0 ? uit : null;
}

/** "stap=selfie;reden=geen-gezicht" (de waarde van data-track-ctx) naar een geschoonde context. */
export function leesTrackCtx(tekst: string | null | undefined): TrackCtx | null {
  if (!tekst) return null;
  const ruw: Record<string, string> = {};
  for (const deel of tekst.slice(0, 400).split(";")) {
    const i = deel.indexOf("=");
    if (i > 0) ruw[deel.slice(0, i).trim()] = deel.slice(i + 1).trim();
  }
  return schoonTrackCtx(ruw);
}

/** De waarde voor data-track-ctx; lege en ongeldige velden vallen weg. */
export function maakTrackCtx(velden: Partial<Record<TrackCtxSleutel, string | number | null | undefined>>): string {
  const schoon = schoonTrackCtx(Object.fromEntries(Object.entries(velden).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v).toLowerCase()])));
  return schoon ? Object.entries(schoon).map(([k, v]) => `${k}=${v}`).join(";") : "";
}

/** Is dit een code zoals data-track hoort te zijn ([a-z0-9-], hooguit 60 tekens)? */
export function isTrackCode(v: string | null | undefined): v is string {
  return typeof v === "string" && CODE.test(v);
}

/**
 * Een focus op een veld met een data-track-code telt één keer per veld per sessie (12 nov: meten of een gast het eerste
 * veld van /klus-plaatsen aanraakt, zonder dat het aantal events oploopt). Geeft true als deze focus nog niet geteld
 * was, en onthoudt hem in `gezien`. Nooit de ingevulde waarde: alleen pad en code.
 */
export function eersteFocus(gezien: Set<string>, pad: string, code: string | null | undefined): boolean {
  if (!isTrackCode(code)) return false;
  const sleutel = `${pad}|${code}`;
  if (gezien.has(sleutel)) return false;
  gezien.add(sleutel);
  return true;
}
