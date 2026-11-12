// ---------------------------------------------------------------------------
// Bank-koppeling: Enable Banking (https://enablebanking.com/docs/api/reference/) als aanbieder. De aanvraag wordt
// ondertekend met een JWT (RS256) met de eigen sleutel van de applicatie: wij hebben zelf geen eIDAS-certificaat nodig,
// Enable Banking is de erkende aanbieder (TPP) tegenover de bank.
//
// LET OP, nog niet tegen de echte API geprobeerd (er is bewust geen account en geen echte aanroep gedaan): de vormen
// hieronder komen uit de openbare documentatie en moeten bij de eerste echte koppeling met een testrekening worden
// bevestigd. De netwerkaanroep en de klok worden doorgegeven, zodat de tests niets van buiten halen.
// Nooit loggen: de url's (bevatten een code), het sessie-id, tokens of het antwoord van de bank.
// ---------------------------------------------------------------------------

import { createSign } from "node:crypto";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { BankKoppelingFout, type BankKoppeling } from "./kern";
import type { BankRegel } from "../types";

export const ENABLE_BANKING_BASIS = "https://api.enablebanking.com";
export const AANBIEDER_ENABLE_BANKING = "enable-banking";

/** Zoveel pagina's en transacties lezen we hooguit per ophaling (zelfde grens als een bestand). */
const MAX_PAGINAS = 40;
const MAX_TRANSACTIES = 20_000;

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface EnableBankingSleutels {
  /** het id van de applicatie in het Control Panel van Enable Banking (ook de "kid" in de JWT) */
  appId: string;
  /** de privésleutel (PEM) van de applicatie; \n-tekens in een omgevingsvariabele zijn toegestaan */
  privateKey: string;
}

export interface EnableBankingOpties extends EnableBankingSleutels {
  fetch?: FetchFn;
  /** de klok, voor de tests */
  nu?: () => Date;
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString("base64url");

/** De JWT voor één aanvraag (geldig 1 uur, het maximum van Enable Banking). */
export function maakJwt(s: EnableBankingSleutels, nu: Date): string {
  const iat = Math.floor(nu.getTime() / 1000);
  const kop = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: s.appId }));
  const inhoud = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat, exp: iat + 3600 }));
  const sign = createSign("RSA-SHA256");
  sign.update(`${kop}.${inhoud}`);
  return `${kop}.${inhoud}.${sign.sign(s.privateKey.replace(/\\n/g, "\n")).toString("base64url")}`;
}

// ---- afbeelden van een transactie -------------------------------------------

interface EbPartij {
  name?: unknown;
}
interface EbRekening {
  iban?: unknown;
}

const tekst = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** "12.50" -> 1250 (exact, zonder drijvende komma). Null als het geen bedrag met hooguit twee decimalen is. */
export function bedragNaarCentenApi(ruw: unknown): number | null {
  const s = typeof ruw === "number" ? String(ruw) : typeof ruw === "string" ? ruw.trim() : "";
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const c = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(c) ? c : null;
}

/**
 * Eén transactie van Enable Banking naar onze BankRegel. Geeft null voor wat niet geboekt is (status ≠ BOOK) of niet te
 * lezen is; het aantal overgeslagen regels telt de aanroeper. Bij een uitgaande betaling (DBIT) is de tegenpartij de
 * begunstigde, bij een inkomende (CRDT) de betaler.
 */
export function mapTransactie(t: unknown): BankRegel | null {
  if (typeof t !== "object" || t === null) return null;
  const o = t as Record<string, unknown>;
  if (o.status !== undefined && o.status !== "BOOK") return null;
  const bedrag = typeof o.transaction_amount === "object" && o.transaction_amount !== null ? (o.transaction_amount as Record<string, unknown>) : null;
  const centen = bedrag ? bedragNaarCentenApi(bedrag.amount) : null;
  const valuta = bedrag ? tekst(bedrag.currency) : null;
  if (centen === null || !valuta) return null;
  const uit = o.credit_debit_indicator === "DBIT";
  if (!uit && o.credit_debit_indicator !== "CRDT") return null;
  const dag = (v: unknown): string | null => {
    const s = tekst(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  const boekdag = dag(o.booking_date) ?? dag(o.value_date) ?? dag(o.transaction_date);
  if (!boekdag) return null;
  const tegen = (uit ? o.creditor : o.debtor) as EbPartij | undefined;
  const tegenRek = (uit ? o.creditor_account : o.debtor_account) as EbRekening | undefined;
  const info = Array.isArray(o.remittance_information) ? o.remittance_information.map(tekst).filter((x): x is string => x !== null) : [];
  const ref = tekst(o.entry_reference) ?? tekst(o.transaction_id);
  return {
    boekdag,
    valutadag: dag(o.value_date),
    bedragCents: uit ? -centen : centen,
    valuta: valuta.toUpperCase(),
    tegenIban: tekst(tegenRek?.iban)?.replace(/\s+/g, "").toUpperCase() ?? null,
    tegenNaam: tekst(tegen?.name),
    omschrijving: info.length > 0 ? info.join(" ").slice(0, 500) : null,
    endToEndId: tekst(o.end_to_end_id),
    bankReferentie: ref ? ref.slice(0, 100) : null,
  };
}

// ---- de aanroepen ---------------------------------------------------------------

export class EnableBanking {
  private readonly fetchFn: FetchFn;
  private readonly nu: () => Date;
  constructor(private readonly o: EnableBankingOpties) {
    this.fetchFn = o.fetch ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchFn>);
    this.nu = o.nu ?? (() => new Date());
  }

  private async aanroep(method: "GET" | "POST", pad: string, body?: unknown): Promise<unknown> {
    let antwoord: Awaited<ReturnType<FetchFn>>;
    try {
      antwoord = await this.fetchFn(`${ENABLE_BANKING_BASIS}${pad}`, {
        method,
        headers: { Authorization: `Bearer ${maakJwt(this.o, this.nu())}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new BankKoppelingFout("tijdelijk", "De bankkoppeling is even niet bereikbaar. De volgende ronde probeert het opnieuw.");
    }
    if (antwoord.status === 401 || antwoord.status === 403) {
      throw new BankKoppelingFout("toestemming-verlopen", "De toestemming bij de bank is verlopen of ingetrokken. Geef opnieuw toestemming via Beheer, Boekhouding, Bank.");
    }
    if (antwoord.status === 429 || antwoord.status >= 500) {
      throw new BankKoppelingFout("tijdelijk", "De bank of de koppeling is even overbelast of niet bereikbaar. De volgende ronde probeert het opnieuw.");
    }
    if (antwoord.status < 200 || antwoord.status >= 300) {
      throw new BankKoppelingFout("afgewezen", `De bankkoppeling wees de aanvraag af (status ${antwoord.status}). Controleer de instellingen van de koppeling.`);
    }
    try {
      return await antwoord.json();
    } catch {
      throw new BankKoppelingFout("afgewezen", "De bankkoppeling gaf een antwoord dat we niet kunnen lezen.");
    }
  }

  /** Stap 1: de link waar de eigenaar naartoe gaat om bij de bank toestemming te geven. `state` komt terug bij de redirect. */
  async startToestemming(o: { bank: string; geldigDagen: number; redirectUrl: string; state: string }): Promise<{ url: string }> {
    const geldigTot = new Date(this.nu().getTime() + o.geldigDagen * 86_400_000).toISOString();
    const r = (await this.aanroep("POST", "/auth", {
      access: { valid_until: geldigTot },
      aspsp: { name: o.bank, country: "NL" },
      state: o.state,
      redirect_url: o.redirectUrl,
      psu_type: "business",
    })) as { url?: unknown };
    const url = tekst(r.url);
    if (!url || !/^https:\/\//.test(url)) throw new BankKoppelingFout("afgewezen", "De bankkoppeling gaf geen geldige link terug.");
    return { url };
  }

  /** Stap 2: de code uit de redirect omzetten in een sessie. Geeft het sessie-id, de rekeningen en de einddatum. */
  async rondToestemmingAf(code: string): Promise<{ sessieId: string; geldigTot: string; rekeningen: { uid: string; iban: string | null }[] }> {
    const r = (await this.aanroep("POST", "/sessions", { code })) as { session_id?: unknown; accounts?: unknown; access?: { valid_until?: unknown } };
    const sessieId = tekst(r.session_id);
    const geldigTot = tekst(r.access?.valid_until);
    if (!sessieId || !geldigTot || !Array.isArray(r.accounts)) throw new BankKoppelingFout("afgewezen", "De bankkoppeling gaf geen bruikbare sessie terug.");
    const rekeningen = r.accounts.flatMap((a: unknown) => {
      if (typeof a !== "object" || a === null) return [];
      const ao = a as { uid?: unknown; account_id?: { iban?: unknown } };
      const uid = tekst(ao.uid);
      return uid ? [{ uid, iban: tekst(ao.account_id?.iban)?.replace(/\s+/g, "").toUpperCase() ?? null }] : [];
    });
    return { sessieId, geldigTot, rekeningen };
  }

  /** Een BankKoppeling voor één rekening (de uid van de aanbieder). */
  voorRekening(rekeningUid: string): BankKoppeling {
    return {
      aanbieder: AANBIEDER_ENABLE_BANKING,
      haalTransacties: async (sinds: string): Promise<BankRegel[]> => {
        const uit: BankRegel[] = [];
        let sleutel: string | null = null;
        for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
          const q = new URLSearchParams({ date_from: sinds, date_to: amsterdamDayKey(this.nu()), transaction_status: "BOOK" });
          if (sleutel) q.set("continuation_key", sleutel);
          const r = (await this.aanroep("GET", `/accounts/${encodeURIComponent(rekeningUid)}/transactions?${q.toString()}`)) as { transactions?: unknown; continuation_key?: unknown };
          if (!Array.isArray(r.transactions)) throw new BankKoppelingFout("afgewezen", "De bankkoppeling gaf geen lijst met transacties terug.");
          for (const t of r.transactions) {
            const regel = mapTransactie(t);
            if (regel) uit.push(regel);
          }
          if (uit.length > MAX_TRANSACTIES) throw new BankKoppelingFout("afgewezen", "Er kwamen meer dan 20.000 transacties terug: haal een kortere periode op.");
          sleutel = tekst(r.continuation_key);
          if (!sleutel) return uit;
        }
        throw new BankKoppelingFout("afgewezen", "De bankkoppeling bleef pagina's geven: gestopt na 40 pagina's.");
      },
    };
  }
}
