// Meldingen, blokkades en cijfers. Alles gaat over de sleutel van een adres (zie net.js), nooit over het adres zelf.
// Regels in gewone taal:
//  - Een gewone melding telt als 1. Drie tellende meldingen van drie verschillende melders binnen 24 uur = 1 uur blok.
//  - "Naaktheid/seksueel" en "minderjarige" zijn zwaar: één tellende melding blokkeert meteen 24 uur.
//  - Wie binnen 30 dagen opnieuw geblokkeerd wordt, krijgt langer: gewoon 24 uur, zwaar 7 dagen.
//  - Dezelfde melder telt per gemelde maar één keer per 24 uur, en een melder mag niet onbeperkt melden.
import crypto from 'node:crypto';

export const REDENEN = {
  naakt: { label: 'Naaktheid of seksueel gedrag', zwaar: true },
  minderjarig: { label: 'Lijkt minderjarig', zwaar: true },
  bedreiging: { label: 'Bedreiging, haat of intimidatie', zwaar: false },
  spam: { label: 'Oplichting, reclame of spam', zwaar: false },
  anders: { label: 'Iets anders', zwaar: false },
};
const UUR = 60 * 60 * 1000, DAG = 24 * UUR;
export const REGELS = {
  gewoonNodig: 3, gewoonBlok: UUR, zwaarBlok: DAG, herhaaldGewoon: DAG, herhaaldZwaar: 7 * DAG, herhaalBinnen: 30 * DAG,
  melderPer10Min: 3, melderPerDag: 10, bewaarMeldingen: 90 * DAG, maxMeldingen: 5000, maxBerichten: 20,
};

// De dag in Nederland (de server draait in UTC).
export const dagSleutel = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

export class Moderatie {
  constructor({ opslag, nu = Date.now } = {}) {
    this.opslag = opslag || null; this.nu = nu;
    const m = opslag?.lees('meldingen', []) ?? [], b = opslag?.lees('blokkades', {}) ?? {}, c = opslag?.lees('cijfers', {}) ?? {};
    this.meldingen = Array.isArray(m) ? m : [];
    this.blokkades = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    this.cijfersPerDag = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
    this.vermijd = new Map(); // "melder|gemeld" -> tot wanneer die twee niet aan elkaar gekoppeld worden (alleen in het geheugen)
    this.ruimOp();
  }
  bewaar(wat) {
    if (!this.opslag) return;
    if (wat === 'meldingen') this.opslag.schrijf('meldingen', () => this.meldingen);
    if (wat === 'blokkades') this.opslag.schrijf('blokkades', () => this.blokkades);
    if (wat === 'cijfers') this.opslag.schrijf('cijfers', () => this.cijfersPerDag);
  }
  ruimOp() {
    const t = this.nu();
    const voor = this.meldingen.length;
    this.meldingen = this.meldingen.filter((m) => t - m.tijd < REGELS.bewaarMeldingen).slice(-REGELS.maxMeldingen);
    if (this.meldingen.length !== voor) this.bewaar('meldingen');
    let weg = false;
    // Een afgelopen blokkade blijft nog 30 dagen staan, alleen om een herhaling te herkennen.
    for (const [k, b] of Object.entries(this.blokkades)) if (t - b.tot > REGELS.herhaalBinnen) { delete this.blokkades[k]; weg = true; }
    if (weg) this.bewaar('blokkades');
    const dagen = Object.keys(this.cijfersPerDag).sort();
    if (dagen.length > 60) { for (const d of dagen.slice(0, dagen.length - 60)) delete this.cijfersPerDag[d]; this.bewaar('cijfers'); }
    for (const [k, tot] of this.vermijd) if (tot < t) this.vermijd.delete(k);
  }

  // ---------------------------------------------------------------- blokkades
  blokkade(sleutel) { const b = this.blokkades[sleutel]; return b && b.tot > this.nu() ? b : null; }
  blokkeer(sleutel, duurMs, reden, door = 'auto') {
    const t = this.nu(), oud = this.blokkades[sleutel];
    const keer = oud && t - oud.tot < REGELS.herhaalBinnen ? (oud.keer || 1) + 1 : 1;
    this.blokkades[sleutel] = { sinds: t, tot: t + duurMs, reden, door, keer };
    this.bewaar('blokkades');
    return this.blokkades[sleutel];
  }
  deblokkeer(sleutel) {
    const b = this.blokkades[sleutel]; if (!b) return false;
    // De blokkade stopt nu; het spoor blijft, zodat een herhaling nog steeds zwaarder telt.
    b.tot = Math.min(b.tot, this.nu()); b.opgeheven = true; this.bewaar('blokkades'); return true;
  }

  // ---------------------------------------------------------------- melden
  magNietSamen(a, b) { const t = this.nu(); return (this.vermijd.get(`${a}|${b}`) || 0) > t || (this.vermijd.get(`${b}|${a}`) || 0) > t; }

  // Geeft { ok, code, telt, blok } terug. code: 'gemeld' | 'dubbel' | 'te-veel' | 'ongeldig'.
  meld({ melder, gemeld, reden, toelichting = '', berichten = null, modus = 'text' }) {
    const t = this.nu();
    if (!melder || !gemeld || !Object.hasOwn(REDENEN, reden)) return { ok: false, code: 'ongeldig' };
    // Wie meldt, komt deze persoon hoe dan ook een dag niet meer tegen.
    // (Niet bij hetzelfde adres: anders kan niemand in dat huis nog iemand uit dat huis treffen.)
    if (melder !== gemeld) this.vermijd.set(`${melder}|${gemeld}`, t + DAG);
    const vanMelder = this.meldingen.filter((m) => m.melder === melder);
    if (vanMelder.some((m) => m.gemeld === gemeld && t - m.tijd < DAG)) return { ok: true, code: 'dubbel', telt: false, blok: null };
    if (vanMelder.filter((m) => t - m.tijd < 10 * 60 * 1000).length >= REGELS.melderPer10Min || vanMelder.filter((m) => t - m.tijd < DAG).length >= REGELS.melderPerDag) return { ok: false, code: 'te-veel' };
    const zwaar = REDENEN[reden].zwaar;
    // Een melder die zelf geblokkeerd is, wordt wel bewaard (een beheerder kan ernaar kijken) maar telt niet mee.
    // Hetzelfde geldt voor een melding vanaf hetzelfde adres als de gemelde (twee tabbladen, één huis): zo kan
    // niemand zijn eigen adres of zijn huisgenoten automatisch blokkeren.
    const telt = !this.blokkade(melder) && melder !== gemeld;
    const melding = {
      id: crypto.randomBytes(6).toString('hex'), tijd: t, reden, zwaar, telt, melder, gemeld, modus: modus === 'video' ? 'video' : 'text',
      toelichting: String(toelichting || '').slice(0, 300), berichten: Array.isArray(berichten) ? berichten.slice(-REGELS.maxBerichten) : null, status: 'open',
    };
    this.meldingen.push(melding);
    this.bewaar('meldingen');
    this.tel('meldingen');
    let blok = null;
    if (telt && !this.blokkade(gemeld)) {
      const eerder = this.blokkades[gemeld], herhaald = !!eerder && t - eerder.tot < REGELS.herhaalBinnen;
      if (zwaar) blok = this.blokkeer(gemeld, herhaald ? REGELS.herhaaldZwaar : REGELS.zwaarBlok, reden);
      else {
        const sinds = Math.max(t - DAG, eerder ? eerder.sinds : 0); // meldingen van vóór een eerdere blokkade tellen niet opnieuw
        const melders = new Set(this.meldingen.filter((m) => m.gemeld === gemeld && m.telt && m.tijd > sinds).map((m) => m.melder));
        if (melders.size >= REGELS.gewoonNodig) blok = this.blokkeer(gemeld, herhaald ? REGELS.herhaaldGewoon : REGELS.gewoonBlok, 'meerdere meldingen');
      }
    }
    return { ok: true, code: 'gemeld', telt, blok, id: melding.id };
  }
  zetStatus(id, status) {
    const m = this.meldingen.find((x) => x.id === id);
    if (!m || !['open', 'afgehandeld'].includes(status)) return false;
    m.status = status; this.bewaar('meldingen'); return true;
  }

  // ---------------------------------------------------------------- cijfers
  tel(wat, n = 1) {
    const d = dagSleutel(this.nu());
    const dag = (this.cijfersPerDag[d] ||= { gesprekken: 0, meldingen: 0 });
    dag[wat] = (dag[wat] || 0) + n; this.bewaar('cijfers');
  }
  vandaag() { return this.cijfersPerDag[dagSleutel(this.nu())] || { gesprekken: 0, meldingen: 0 }; }
  overzicht() {
    const t = this.nu();
    return {
      vandaag: this.vandaag(),
      dagen: Object.entries(this.cijfersPerDag).sort().slice(-14).map(([dag, c]) => ({ dag, ...c })),
      openMeldingen: this.meldingen.filter((m) => m.status === 'open').length,
      meldingen: this.meldingen.slice(-200).reverse().map((m) => ({ ...m, redenTekst: REDENEN[m.reden]?.label || m.reden, gemeldGeblokkeerd: !!this.blokkade(m.gemeld) })),
      blokkades: Object.entries(this.blokkades).filter(([, b]) => b.tot > t).map(([sleutel, b]) => ({ sleutel, ...b })).sort((a, b) => b.sinds - a.sinds),
    };
  }
}
