import { kvGet, kvSet } from "@/lib/storage/kv";
import { sealSecret, openSecret } from "@/lib/security/sealed-secret";

// ---------------------------------------------------------------------------
// De verkoopmailbox (21 nov 2026). Verkoopmail (categorie "sales-outreach") ging via dezelfde mailbox als de mail van de app
// (SMTP_USER, info@). Na ±1000 ontvangers op een dag weigerde TransIP alles ("550 Sending Prohibited (Max Rcp)"), ook
// inlogcodes en wachtwoord vergeten. Nu logt verkoopmail in met een eigen mailbox (bijv. sales@zekerflex.com), met een eigen
// grens. Is die niet ingesteld of weigert hij, dan gaat verkoopmail NIET via de gewone mailbox: de mail van de app gaat voor
// (lib/mail/index.ts).
//
// De login komt uit Beheer → Mail (KV, verzegeld; de eigenaar typt het wachtwoord daar zelf) of uit de omgeving
// (SALES_SMTP_USER + SALES_SMTP_PASS). Het wachtwoord wordt nooit teruggegeven, afgedrukt of gelogd.
// ---------------------------------------------------------------------------

const KV_KEY = "mail:verkoop-mailbox";
const DOEL = "verkoop-mailbox";

export interface VerkoopLogin {
  adres: string;
  wachtwoord: string;
}

export interface VerkoopMailboxStand {
  ingesteld: boolean;
  /** het adres (geen geheim), of null */
  adres: string | null;
  bron: "beheer" | "omgeving" | null;
}

/** De fout als verkoopmail geen eigen mailbox heeft: het staat in de eigen postbus en in het antwoord aan de verzender. */
export const VERKOOP_NIET_INGESTELD =
  "Geen verkoopmailbox ingesteld (Beheer → Mail). Verkoopmail gaat niet via de gewone mailbox, zodat inlogcodes en andere mail van de app blijven werken.";

/** Alleen een adres op zekerflex.com: anders klopt de afzender niet met SPF en DMARC. */
export function geldigVerkoopAdres(adres: string): boolean {
  return /^[a-z0-9._%+-]+@zekerflex\.com$/i.test(adres.trim());
}

interface Opgeslagen {
  adres: string;
  wachtwoord: string; // verzegeld
}

async function uitBeheer(): Promise<VerkoopLogin | null> {
  try {
    const o = await kvGet<Opgeslagen>(KV_KEY);
    if (o && o.adres && o.wachtwoord) return { adres: o.adres, wachtwoord: openSecret(o.wachtwoord, DOEL) };
  } catch {
    /* onleesbaar (sleutel gewisseld) of opslag weg: dan de omgeving */
  }
  return null;
}

function uitOmgeving(): VerkoopLogin | null {
  const adres = process.env.SALES_SMTP_USER?.trim() ?? "";
  const wachtwoord = process.env.SALES_SMTP_PASS ?? "";
  return adres && wachtwoord ? { adres, wachtwoord } : null;
}

/** De login van de verkoopmailbox: eerst uit Beheer, anders uit de omgeving. Null = niet ingesteld. */
export async function verkoopLogin(): Promise<VerkoopLogin | null> {
  return (await uitBeheer()) ?? uitOmgeving();
}

/** Bewaar de login verzegeld (alleen na een geslaagde proef, zie de route). */
export async function zetVerkoopLogin(adres: string, wachtwoord: string): Promise<void> {
  await kvSet(KV_KEY, { adres: adres.trim().toLowerCase(), wachtwoord: sealSecret(wachtwoord, DOEL) } satisfies Opgeslagen);
}

export async function wisVerkoopLogin(): Promise<void> {
  await kvSet(KV_KEY, null);
}

/** Voor Beheer en de eigenaar-taak: is er een verkoopmailbox, en welk adres (zonder wachtwoord)? */
export async function verkoopMailboxStand(): Promise<VerkoopMailboxStand> {
  const beheer = await uitBeheer();
  if (beheer) return { ingesteld: true, adres: beheer.adres, bron: "beheer" };
  const omgeving = uitOmgeving();
  if (omgeving) return { ingesteld: true, adres: omgeving.adres, bron: "omgeving" };
  return { ingesteld: false, adres: null, bron: null };
}
