import { envelopDatum } from "@/lib/mail/bounce";
import { INFO_MAPPEN, antwoordOnderwerp, antwoordTekst, deelIn, heeftBijlageKop, isTerugkaatser, kort, maskeerAdres, type InfoSoort } from "@/lib/mail/info-indeling";
import { bedrijfsConcept } from "@/lib/mail/info-antwoorden";

// ---------------------------------------------------------------------------
// De info-ronde (elke 5 minuten, deploy/cron/entrypoint.sh): de postbus info@ naloopt en indeelt
// (lib/mail/info-indeling.ts). Alles via `InfoAfhankelijkheden`, zodat de kern zonder postbus te testen is; de echte
// afhankelijkheden staan in lib/mail/info-ronde-db.ts.
//   vlag uit (standaard, "info-mail-afhandelen") = PROEF: indelen en opschrijven wat hij ZOU doen. Niets verplaatst,
//             niets verstuurd, niets gemeld, niets op gelezen.
//   vlag aan = ECHT:
//     terugkaatser → map Terugkaatsers, maar pas als de bounce-ronde hem verwerkt heeft (anders mist die hem)
//     automatisch  → map Automatisch; met een bijlage blijft hij staan (kan een factuur of bon zijn)
//     werkzoekend  → één eerste antwoord met de aanmeldlink, daarna naar de map Beantwoord
//     bedrijf      → nooit automatisch beantwoorden; een melding aan de eigenaar
//     rest         → blijft staan
// Grenzen: nooit iets verwijderen; nooit een mail ouder dan 3 dagen (dus niet de achterstand); hooguit 25 nieuwe
// mails per ronde; hooguit 20 antwoorden per uur; één antwoord per adres per 30 dagen.
// In de stand en het logboek staat nooit een volledig adres.
// ---------------------------------------------------------------------------

export const INFO_MAIL_VLAG = "info-mail-afhandelen";
export const INFO_MAIL_JOB = "info-mail";
export const KV_INFO_STAND = "meting:info-mail";
export const MAX_NIEUW_PER_RONDE = 25;
export const MAX_ANTWOORDEN_PER_UUR = 20;
export const MAX_LEEFTIJD_DAGEN = 3;
export const ANTWOORD_VENSTER_DAGEN = 30;
export const BESLISSINGEN_BEWAREN = 20;
const DAG = 86_400_000;

export interface InfoEnvelop {
  uid: number;
  date: string | null;
  fromAddress: string | null;
  fromName: string | null;
  replyToAddress: string | null;
  subject: string | null;
  messageId: string | null;
  /** de eigenaar (of een mailprogramma) heeft deze mail al beantwoord */
  answered?: boolean | undefined;
}

export interface InfoMerk {
  at: string;
  soort: InfoSoort;
  /** true = in de echte stand afgehandeld; false = alleen bekeken in de proefstand */
  echt: boolean;
}

export interface InfoBeslissing {
  at: string;
  soort: InfoSoort;
  /** wat er gedaan is, of in de proefstand: wat hij zou doen */
  actie: string;
  echt: boolean;
  /** gemaskeerd: "j***@gmail.com" */
  van: string;
  onderwerp: string;
}

export interface InfoAntwoord {
  aan: string;
  onderwerp: string;
  tekst: string;
  /** Message-ID van de mail waarop dit een antwoord is (zonder < >) */
  inReplyTo: string | null;
}

export interface InfoStand {
  at: string;
  proef: boolean;
  /** mails die deze ronde voor het eerst bekeken zijn */
  nieuw: number;
  perSoort: Record<InfoSoort, number>;
  /** echt gedaan (in de proefstand: wat hij zou doen) */
  gedaan: { verplaatst: number; beantwoord: number; gemeld: number };
  beslissingen: InfoBeslissing[];
  /** de tekst van het eerste antwoord, zodat de eigenaar hem vooraf kan lezen */
  voorbeeld: { onderwerp: string; tekst: string };
  fout?: string;
}

export interface InfoAfhankelijkheden {
  aan(): Promise<boolean>;
  /** de nieuwste berichten in de INBOX (alleen de envelop) */
  lijst(): Promise<InfoEnvelop[]>;
  kop(uid: number): Promise<string | null>;
  tekst(uid: number): Promise<string | null>;
  merk(uid: number): Promise<InfoMerk | null>;
  zetMerk(uid: number, merk: InfoMerk): Promise<void>;
  /** heeft de bounce-ronde deze terugkaatser al verwerkt? */
  bounceVerwerkt(uid: number): Promise<boolean>;
  /** verplaatst naar een map (maakt hem zo nodig aan); false als de server dat niet kan */
  verplaats(uid: number, map: string): Promise<boolean>;
  /** op gelezen en beantwoord zetten (als verplaatsen niet lukt) */
  markeerBeantwoord(uid: number): Promise<void>;
  alGeantwoord(adres: string, nu: number): Promise<boolean>;
  onthoudAntwoord(adres: string, nu: Date): Promise<void>;
  /** het aantal antwoorden in dit uur */
  antwoordenDitUur(nu: Date): Promise<number>;
  telAntwoord(nu: Date): Promise<void>;
  stuur(antwoord: InfoAntwoord): Promise<boolean>;
  /** melding aan de eigenaar over een mail van een bedrijf */
  meld(afzender: string, onderwerp: string, uid: number): Promise<boolean>;
  /** een concept-antwoord klaarzetten op jouw goedkeuring (Beheer, AI-teams); nooit iets versturen. Zonder deze functie: geen concept. */
  bewaarConcept?(antwoord: InfoAntwoord, uid: number): Promise<boolean>;
  /** is dit adres een lead die een verkoopmail kreeg? Geeft het id van de lead, of null. Zonder deze functie: niet herkend. */
  herkenReactie?(adres: string): Promise<string | null>;
  /** zet de lead op "gereageerd" en stopt de verkoopreeks (markLeadReplied) */
  markeerReactie?(leadId: string): Promise<boolean>;
  vorigeStand(): Promise<InfoStand | null>;
  bewaar(stand: InfoStand): Promise<void>;
  ruimOp(nu: number): Promise<void>;
  /** de postbus netjes afsluiten (één sessie per ronde); altijd aangeroepen, ook na een fout */
  sluit?(): Promise<void>;
}

const leegPerSoort = (): Record<InfoSoort, number> => ({ terugkaatser: 0, automatisch: 0, bedrijf: 0, werkzoekend: 0, rest: 0 });
const ADRES = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

export async function loopInfoNa(d: InfoAfhankelijkheden, nu: Date = new Date()): Promise<InfoStand> {
  try {
    return await ronde(d, nu);
  } finally {
    await d.sluit?.().catch(() => undefined);
  }
}

async function ronde(d: InfoAfhankelijkheden, nu: Date): Promise<InfoStand> {
  const aan = await d.aan();
  const vorige = await d.vorigeStand().catch(() => null);
  const gedaan = { verplaatst: 0, beantwoord: 0, gemeld: 0 };
  const perSoort = leegPerSoort();
  const nieuweBeslissingen: InfoBeslissing[] = [];
  const voorbeeld = { onderwerp: antwoordOnderwerp("Ik zoek werk"), tekst: antwoordTekst() };
  let nieuw = 0;
  const stand = (extra: Partial<InfoStand> = {}): InfoStand => ({
    at: nu.toISOString(),
    proef: !aan,
    nieuw,
    perSoort,
    gedaan,
    beslissingen: [...[...nieuweBeslissingen].reverse(), ...(vorige?.beslissingen ?? [])].slice(0, BESLISSINGEN_BEWAREN),
    voorbeeld,
    ...extra,
  });

  let lijst: InfoEnvelop[];
  try {
    lijst = await d.lijst();
  } catch (err) {
    const s = stand({ fout: `postbus niet te lezen (${(err as Error).name})` });
    await d.bewaar(s).catch(() => undefined);
    return s;
  }

  const grens = nu.getTime() - MAX_LEEFTIJD_DAGEN * DAG;
  // oudste eerst, zodat wie het eerst schreef het eerst antwoord krijgt; een mail zonder leesbare datum slaan we over
  const kandidaten = lijst
    .filter((e) => {
      const t = envelopDatum(e.date);
      return t !== null && t >= grens && t <= nu.getTime() + DAG;
    })
    .sort((a, b) => a.uid - b.uid);
  let antwoordenDitUur = aan ? await d.antwoordenDitUur(nu).catch(() => MAX_ANTWOORDEN_PER_UUR) : 0;

  for (const e of kandidaten) {
    if (nieuw >= MAX_NIEUW_PER_RONDE) break;
    // een fout bij één bericht (postbus, KV, mail) houdt de rest niet tegen; dat bericht komt de volgende ronde terug
    try {
      const merk = await d.merk(e.uid);
      // al echt afgehandeld, of al bekeken in de proefstand en die staat nog steeds: niet opnieuw
      if (merk && (merk.echt || !aan)) continue;

      const schrijf = (soort: InfoSoort, actie: string) => {
        perSoort[soort] += 1;
        nieuweBeslissingen.push({ at: nu.toISOString(), soort, actie, echt: aan, van: maskeerAdres(e.fromAddress), onderwerp: kort(e.subject) });
      };
      const klaar = (soort: InfoSoort) => d.zetMerk(e.uid, { at: nu.toISOString(), soort, echt: aan });

      // 1. terugkaatser: aan de envelop te zien, zonder iets op te halen
      if (isTerugkaatser(e.fromAddress, e.subject)) {
        if (!aan) {
          nieuw += 1;
          schrijf("terugkaatser", `zou naar de map ${INFO_MAPPEN.terugkaatsers} gaan`);
          await klaar("terugkaatser");
          continue;
        }
        // de bounce-ronde (elk uur) leest terugkaatsers in de INBOX: eerst die laten werken, dan pas verplaatsen
        if (!(await d.bounceVerwerkt(e.uid))) continue;
        nieuw += 1;
        const ok = await d.verplaats(e.uid, INFO_MAPPEN.terugkaatsers);
        if (ok) gedaan.verplaatst += 1;
        schrijf("terugkaatser", ok ? `naar de map ${INFO_MAPPEN.terugkaatsers}` : "blijft staan (verplaatsen lukte niet)");
        await klaar("terugkaatser");
        continue;
      }

      const kop = await d.kop(e.uid);
      if (kop === null) continue;
      nieuw += 1;
      const basis = { vanAdres: e.fromAddress, replyTo: e.replyToAddress, onderwerp: e.subject, kop };
      let indeling = deelIn(basis);

      if (indeling.soort === "terugkaatser") {
        // pas aan de kop te zien (multipart/report): zelfde regel als hierboven
        if (aan && !(await d.bounceVerwerkt(e.uid))) {
          nieuw -= 1;
          continue;
        }
        const ok = aan ? await d.verplaats(e.uid, INFO_MAPPEN.terugkaatsers) : false;
        if (ok) gedaan.verplaatst += 1;
        schrijf("terugkaatser", !aan ? `zou naar de map ${INFO_MAPPEN.terugkaatsers} gaan` : ok ? `naar de map ${INFO_MAPPEN.terugkaatsers}` : "blijft staan (verplaatsen lukte niet)");
        await klaar("terugkaatser");
        continue;
      }

      if (indeling.soort === "automatisch") {
        if (heeftBijlageKop(kop)) {
          schrijf("automatisch", `blijft staan: ${indeling.reden} met een bijlage (kan een factuur zijn)`);
        } else if (!aan) {
          schrijf("automatisch", `zou naar de map ${INFO_MAPPEN.automatisch} gaan (${indeling.reden})`);
        } else {
          const ok = await d.verplaats(e.uid, INFO_MAPPEN.automatisch);
          if (ok) gedaan.verplaatst += 1;
          schrijf("automatisch", ok ? `naar de map ${INFO_MAPPEN.automatisch} (${indeling.reden})` : "blijft staan (verplaatsen lukte niet)");
        }
        await klaar("automatisch");
        continue;
      }

      // een reactie op een verkoopmail (18 nov): het adres is een lead die een mail kreeg. Dan stopt de verkoopreeks en krijgt de
      // eigenaar een melding; nooit een automatisch antwoord. Alleen als de afhankelijkheden dit kunnen (anders gedraagt alles zich als vroeger).
      const afzender = (e.fromAddress ?? "").trim().toLowerCase();
      if (d.herkenReactie && ADRES.test(afzender)) {
        const leadId = await d.herkenReactie(afzender).catch(() => null);
        if (leadId) {
          if (!aan) {
            schrijf("bedrijf", "zou de lead op 'gereageerd' zetten en jou melden (reactie op een verkoopmail)");
          } else {
            const gezet = (await d.markeerReactie?.(leadId).catch(() => false)) === true;
            const gemeld = await d.meld(kort(e.fromName, 60) || maskeerAdres(e.fromAddress), kort(e.subject, 90), e.uid).catch(() => false);
            if (gemeld) gedaan.gemeld += 1;
            schrijf("bedrijf", gezet ? "reactie op een verkoopmail: de lead staat op 'gereageerd' en de verkoopreeks is gestopt" : "blijft staan: de lead bijwerken lukte niet");
          }
          await klaar("bedrijf");
          continue;
        }
      }

      // een mens: nu pas de tekst ophalen
      const tekst = await d.tekst(e.uid).catch(() => null);
      indeling = deelIn({ ...basis, tekst });

      if (indeling.soort === "bedrijf") {
        // een concept-antwoord uit het antwoordenpakket (lib/mail/info-antwoorden.ts), alleen als dat kan en het adres klopt; het
        // gaat pas uit als de eigenaar het uitvoert
        const concept = d.bewaarConcept ? bedrijfsConcept(e.subject, tekst) : null;
        const conceptAdres = (e.replyToAddress ?? e.fromAddress ?? "").trim().toLowerCase();
        const kanConcept = concept !== null && ADRES.test(conceptAdres);
        if (!aan) {
          schrijf("bedrijf", kanConcept ? "zou een melding aan jou sturen en een concept-antwoord klaarzetten (niets wordt vanzelf verstuurd)" : "zou een melding aan jou sturen (geen automatisch antwoord)");
        } else {
          const ok = await d.meld(kort(e.fromName, 60) || maskeerAdres(e.fromAddress), kort(e.subject, 90), e.uid).catch(() => false);
          if (ok) gedaan.gemeld += 1;
          let conceptOk = false;
          if (kanConcept && concept && d.bewaarConcept) {
            conceptOk = await d.bewaarConcept({ aan: conceptAdres, onderwerp: concept.onderwerp, tekst: concept.tekst, inReplyTo: e.messageId }, e.uid).catch(() => false);
          }
          schrijf(
            "bedrijf",
            conceptOk
              ? "melding aan jou gestuurd en een concept-antwoord klaargezet (Beheer, AI-teams); niets is vanzelf verstuurd"
              : ok
                ? "melding aan jou gestuurd (geen automatisch antwoord)"
                : "blijft staan (melding al gestuurd of mislukt)",
          );
        }
        await klaar("bedrijf");
        continue;
      }

      if (indeling.soort === "werkzoekend") {
        const adres = (e.fromAddress ?? "").trim().toLowerCase();
        if (!ADRES.test(adres)) {
          schrijf("werkzoekend", "blijft staan: geen bruikbaar adres");
        } else if (e.answered) {
          schrijf("werkzoekend", "blijft staan: al door jou beantwoord");
        } else if (await d.alGeantwoord(adres, nu.getTime())) {
          schrijf("werkzoekend", `blijft staan: kreeg in de laatste ${ANTWOORD_VENSTER_DAGEN} dagen al een antwoord`);
        } else if (!aan) {
          gedaan.beantwoord += 1;
          schrijf("werkzoekend", "zou het eerste antwoord met de aanmeldlink krijgen");
        } else if (antwoordenDitUur >= MAX_ANTWOORDEN_PER_UUR) {
          // niet afvinken: de volgende ronde (of het volgende uur) is hij weer aan de beurt
          schrijf("werkzoekend", `wacht: de grens van ${MAX_ANTWOORDEN_PER_UUR} antwoorden per uur is bereikt`);
          continue;
        } else {
          // eerst onthouden, dan versturen: liever één antwoord te weinig dan twee keer hetzelfde
          await d.onthoudAntwoord(adres, nu);
          await d.telAntwoord(nu).catch(() => undefined);
          antwoordenDitUur += 1;
          const ok = await d.stuur({ aan: adres, onderwerp: antwoordOnderwerp(e.subject), tekst: antwoordTekst(), inReplyTo: e.messageId });
          if (ok) {
            gedaan.beantwoord += 1;
            const verplaatst = await d.verplaats(e.uid, INFO_MAPPEN.beantwoord).catch(() => false);
            if (verplaatst) gedaan.verplaatst += 1;
            else await d.markeerBeantwoord(e.uid).catch(() => undefined);
            schrijf("werkzoekend", verplaatst ? `eerste antwoord verstuurd, naar de map ${INFO_MAPPEN.beantwoord}` : "eerste antwoord verstuurd");
          } else {
            schrijf("werkzoekend", "blijft staan: het antwoord kon niet worden verstuurd");
          }
        }
        await klaar("werkzoekend");
        continue;
      }

      schrijf("rest", `blijft staan (${indeling.reden})`);
      await klaar("rest");
    } catch {
      continue;
    }
  }

  const s = stand();
  await d.bewaar(s).catch(() => undefined);
  await d.ruimOp(nu.getTime()).catch(() => undefined);
  return s;
}
