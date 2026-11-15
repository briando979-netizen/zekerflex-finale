import { DAGDELEN, DAGEN, RASTER_LENGTE, UREN_PER_DAGDEEL, plekNaam, type BedrijfInKaart, type Ruimte } from "@/lib/inkaart/model";

// ---------------------------------------------------------------------------
// De berekeningen van "Bedrijf in kaart" (lib/inkaart/model.ts): puur, zonder opslag en klok, en uitlegbaar. Elk getal volgt uit wat het bedrijf zelf
// invulde; elk signaal zegt met die cijfers waarom het er staat. Er zijn geen eigen richtcijfers per branche: vergelijken doen we met het eigen doel
// (doelPersoneelPct, doelBezettingPct) of met de eigen cijfers (drukste moment tegen het aantal ruimtes). Waar een standaard nodig is (een ruimte die
// minder dan 40% bezet is), staat dat in het signaal en is hij in te stellen via het doel voor de bezetting.
// Een getal dat niet te berekenen is (er is niets ingevuld), is null, nooit 0.
// ---------------------------------------------------------------------------

/** Zonder eigen doel telt een ruimte met minder bezetting dan dit als rustig. Het signaal zegt dat, en het doel is in te stellen. */
export const STANDAARD_LAGE_BEZETTING = 40;
/** Vanaf dit percentage op het drukste moment is er nauwelijks ruimte over. */
export const DRUKTE_GRENS = 90;
/** Zoveel procentpunten verschil tussen het drukste en het rustigste dagdeel noemen we een ongelijke spreiding. */
export const SPREIDING_GRENS = 40;

export interface Signaal {
  id: string;
  niveau: "aandacht" | "info";
  titel: string;
  /** de uitleg met de eigen cijfers */
  waarom: string;
  actie?: { label: string; href: string };
}

export interface RuimteUitkomst {
  id: string;
  naam: string;
  soort: string;
  aantal: number;
  m2Totaal: number | null;
  /** gemiddeld % bezet over de dagdelen waarop het bedrijf open is en waarvoor iets is ingevuld */
  gemiddeld: number | null;
  /** het drukste dagdeel */
  piek: { index: number; pct: number } | null;
  /** hoeveel ruimtes er op het drukste moment echt nodig zijn (afgerond omhoog) */
  nodigBijPiek: number | null;
  /** hoeveel ruimtes er op het drukste moment leeg staan */
  leegBijPiek: number | null;
  /** uren per week dat de ruimtes (samen) leeg staan, binnen de open dagdelen met gegevens */
  ongebruiktUrenPerWeek: number | null;
}

export interface Analyse {
  financieel: {
    fte: number;
    personeelskosten: number | null;
    personeelPct: number | null;
    kostenPerFte: number | null;
    omzetPerFte: number | null;
    huurPct: number | null;
    omzetPerM2: number | null;
    huurPerM2: number | null;
  };
  ruimtes: {
    aantal: number;
    m2Totaal: number | null;
    m2PerFte: number | null;
    ruimtesPerFte: number | null;
    perSoort: { soort: string; aantal: number; m2: number | null; gemiddeld: number | null }[];
  };
  bezetting: {
    gemiddeld: number | null;
    /** gewogen gemiddelde per dagdeel over alle ruimtes met gegevens; null = niets ingevuld of gesloten */
    raster: (number | null)[];
    piek: { index: number; pct: number } | null;
    dal: { index: number; pct: number } | null;
    spreiding: number | null;
    ruimtesMetGegevens: number;
  };
  perRuimte: RuimteUitkomst[];
  signalen: Signaal[];
  /** 0 tot 100: hoeveel van wat we nodig hebben is ingevuld */
  volledigheid: number;
}

const rond = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d;
const som = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function eurotekst(n: number): string {
  return `€ ${Math.round(n).toLocaleString("nl-NL")}`;
}

/** De bezette dagdelen van één ruimte: alleen waar het bedrijf open is en iets is ingevuld. */
function bezetteDagdelen(r: Ruimte, open: boolean[]): { index: number; pct: number }[] {
  const uit: { index: number; pct: number }[] = [];
  for (let i = 0; i < RASTER_LENGTE; i += 1) {
    const pct = r.bezetting[i];
    if (open[i] && typeof pct === "number") uit.push({ index: i, pct });
  }
  return uit;
}

export function analyseer(b: BedrijfInKaart): Analyse {
  const fte = som(b.groepen.map((g) => g.fte));
  const groepKosten = b.groepen.filter((g) => g.kostenJaar !== null);
  // per groep ingevuld telt mee; anders het totaal dat het bedrijf zelf opgaf
  const personeelskosten = groepKosten.length > 0 ? som(groepKosten.map((g) => g.kostenJaar ?? 0)) : b.personeelskostenJaar;
  const personeelPct = personeelskosten !== null && b.omzetJaar !== null && b.omzetJaar > 0 ? rond((personeelskosten / b.omzetJaar) * 100) : null;

  // ruimtes
  const aantalRuimtes = som(b.ruimtes.map((r) => r.aantal));
  const regelsMetM2 = b.ruimtes.filter((r) => r.m2 !== null && r.m2 > 0);
  const m2Totaal = regelsMetM2.length > 0 ? rond(som(regelsMetM2.map((r) => (r.m2 ?? 0) * r.aantal)), 0) : null;

  const perRuimte: RuimteUitkomst[] = b.ruimtes.map((r) => {
    const cellen = bezetteDagdelen(r, b.open);
    const gemiddeld = cellen.length > 0 ? rond(som(cellen.map((c) => c.pct)) / cellen.length) : null;
    const piekCel = cellen.reduce<{ index: number; pct: number } | null>((m, c) => (m === null || c.pct > m.pct ? c : m), null);
    const nodig = piekCel ? Math.min(r.aantal, Math.ceil((r.aantal * piekCel.pct) / 100 - 1e-9)) : null;
    return {
      id: r.id,
      naam: r.naam,
      soort: r.soort,
      aantal: r.aantal,
      m2Totaal: r.m2 !== null && r.m2 > 0 ? rond(r.m2 * r.aantal, 0) : null,
      gemiddeld,
      piek: piekCel,
      nodigBijPiek: nodig,
      leegBijPiek: nodig === null ? null : r.aantal - nodig,
      ongebruiktUrenPerWeek: cellen.length > 0 ? rond(som(cellen.map((c) => r.aantal * (1 - c.pct / 100) * UREN_PER_DAGDEEL)), 0) : null,
    };
  });

  // per soort
  const soorten = [...new Set(b.ruimtes.map((r) => r.soort.trim() || "Overig"))];
  const perSoort = soorten.map((soort) => {
    const regels = b.ruimtes.filter((r) => (r.soort.trim() || "Overig") === soort);
    const uitk = perRuimte.filter((u) => regels.some((r) => r.id === u.id));
    const metM2 = regels.filter((r) => r.m2 !== null && r.m2 > 0);
    const gewogen = uitk.filter((u) => u.gemiddeld !== null);
    const gewicht = som(gewogen.map((u) => u.aantal));
    return {
      soort,
      aantal: som(regels.map((r) => r.aantal)),
      m2: metM2.length > 0 ? rond(som(metM2.map((r) => (r.m2 ?? 0) * r.aantal)), 0) : null,
      gemiddeld: gewicht > 0 ? rond(som(gewogen.map((u) => (u.gemiddeld ?? 0) * u.aantal)) / gewicht) : null,
    };
  });

  // het raster over alle ruimtes, gewogen naar aantal
  const raster: (number | null)[] = Array.from({ length: RASTER_LENGTE }, (_, i) => {
    if (!b.open[i]) return null;
    let teller = 0;
    let gewicht = 0;
    for (const r of b.ruimtes) {
      const pct = r.bezetting[i];
      if (typeof pct === "number") {
        teller += pct * r.aantal;
        gewicht += r.aantal;
      }
    }
    return gewicht > 0 ? rond(teller / gewicht) : null;
  });
  const gevuld = raster.map((pct, index) => ({ index, pct })).filter((c): c is { index: number; pct: number } => c.pct !== null);
  const piek = gevuld.reduce<{ index: number; pct: number } | null>((m, c) => (m === null || c.pct > m.pct ? c : m), null);
  const dal = gevuld.reduce<{ index: number; pct: number } | null>((m, c) => (m === null || c.pct < m.pct ? c : m), null);
  const metGegevens = perRuimte.filter((u) => u.gemiddeld !== null);
  const gewichtAlle = som(metGegevens.map((u) => u.aantal));
  const gemiddeldAlle = gewichtAlle > 0 ? rond(som(metGegevens.map((u) => (u.gemiddeld ?? 0) * u.aantal)) / gewichtAlle) : null;
  const spreiding = piek && dal ? rond(piek.pct - dal.pct) : null;

  const analyse: Analyse = {
    financieel: {
      fte: rond(fte, 2),
      personeelskosten,
      personeelPct,
      kostenPerFte: personeelskosten !== null && fte > 0 ? Math.round(personeelskosten / fte) : null,
      omzetPerFte: b.omzetJaar !== null && fte > 0 ? Math.round(b.omzetJaar / fte) : null,
      huurPct: b.huurJaar !== null && b.omzetJaar !== null && b.omzetJaar > 0 ? rond((b.huurJaar / b.omzetJaar) * 100) : null,
      omzetPerM2: b.omzetJaar !== null && m2Totaal ? Math.round(b.omzetJaar / m2Totaal) : null,
      huurPerM2: b.huurJaar !== null && m2Totaal ? Math.round(b.huurJaar / m2Totaal) : null,
    },
    ruimtes: {
      aantal: aantalRuimtes,
      m2Totaal,
      m2PerFte: m2Totaal !== null && fte > 0 ? rond(m2Totaal / fte) : null,
      ruimtesPerFte: aantalRuimtes > 0 && fte > 0 ? rond(aantalRuimtes / fte, 2) : null,
      perSoort,
    },
    bezetting: { gemiddeld: gemiddeldAlle, raster, piek, dal, spreiding, ruimtesMetGegevens: metGegevens.length },
    perRuimte,
    signalen: [],
    volledigheid: 0,
  };
  analyse.signalen = signalen(b, analyse);
  analyse.volledigheid = volledigheid(b, analyse);
  return analyse;
}

function signalen(b: BedrijfInKaart, a: Analyse): Signaal[] {
  const s: Signaal[] = [];
  const grens = b.doelBezettingPct ?? STANDAARD_LAGE_BEZETTING;
  const grensUitleg = b.doelBezettingPct !== null ? `jouw doel van ${b.doelBezettingPct}%` : `de grens van ${STANDAARD_LAGE_BEZETTING}% die we gebruiken zolang je geen doel instelt`;

  // 1. niets ingevuld
  if (b.ruimtes.length === 0) {
    s.push({ id: "geen-ruimtes", niveau: "info", titel: "Voeg je ruimtes toe", waarom: "Zonder ruimtes kunnen we niets zeggen over bezetting of indeling. Kies bij Ruimtes een voorbeeldset voor jouw soort bedrijf of voeg ze zelf toe." });
  } else if (a.bezetting.ruimtesMetGegevens === 0) {
    s.push({ id: "geen-bezetting", niveau: "info", titel: "Vul in wanneer je ruimtes bezet zijn", waarom: "Je hebt ruimtes, maar nog niet ingevuld hoe vol ze zijn. Zet bij Bezetting per ruimte een percentage per dagdeel (een schatting is genoeg), dan zie je waar capaciteit over is." });
  }

  // 2. personeelskosten
  if (a.financieel.personeelPct !== null) {
    if (b.doelPersoneelPct !== null) {
      if (a.financieel.personeelPct > b.doelPersoneelPct) {
        const teveel = rond(a.financieel.personeelPct - b.doelPersoneelPct);
        const bedrag = b.omzetJaar !== null ? Math.round((teveel / 100) * b.omzetJaar) : null;
        s.push({
          id: "personeel-boven-doel",
          niveau: "aandacht",
          titel: `Personeelskosten liggen ${teveel} procentpunt boven je doel`,
          waarom: `Je personeelskosten zijn ${a.financieel.personeelPct}% van je omzet, je doel is ${b.doelPersoneelPct}%.${bedrag !== null ? ` Dat is ongeveer ${eurotekst(bedrag)} per jaar.` : ""} Kijk naar de momenten waarop er meer mensen zijn dan nodig (zie het rooster hieronder) en zet flexwerkers alleen in op de drukke momenten.`,
          actie: { label: "Klus uitzetten voor een druk moment", href: "/werkgever/diensten/nieuw" },
        });
      } else {
        s.push({ id: "personeel-binnen-doel", niveau: "info", titel: "Personeelskosten binnen je doel", waarom: `${a.financieel.personeelPct}% van je omzet, je doel is ${b.doelPersoneelPct}%.` });
      }
    } else {
      s.push({ id: "personeel-doel", niveau: "info", titel: `Personeelskosten zijn ${a.financieel.personeelPct}% van je omzet`, waarom: "Stel bij Gegevens een doel in voor dit percentage, dan laten we zien of je erboven of eronder zit. Een vergelijking met andere bedrijven geven we niet: de uitkomst hangt te veel af van je soort werk." });
    }
  } else if (b.groepen.length > 0 || b.personeelskostenJaar !== null) {
    s.push({ id: "personeel-omzet", niveau: "info", titel: "Vul je omzet in voor het personeelskostenpercentage", waarom: "We hebben personeel, maar nog geen omzet (of budget) per jaar. Zonder dat kunnen we het percentage niet uitrekenen." });
  }

  // 3. per ruimte: rustig, en te veel ruimtes voor het drukste moment
  for (const u of a.perRuimte) {
    if (u.gemiddeld !== null && u.gemiddeld < grens) {
      s.push({
        id: `rustig-${u.id}`,
        niveau: "aandacht",
        titel: `${u.naam} is gemiddeld ${u.gemiddeld}% bezet`,
        waarom: `Dat is onder ${grensUitleg}. ${u.ongebruiktUrenPerWeek !== null ? `Samen staan deze ruimtes ongeveer ${u.ongebruiktUrenPerWeek} uur per week leeg binnen je openingstijden. ` : ""}Je kunt het gebruik delen met een andere afdeling, er andere activiteiten in plannen of er een andere bestemming aan geven.`,
      });
    }
    if (u.aantal >= 2 && u.nodigBijPiek !== null && u.leegBijPiek !== null && u.leegBijPiek >= 1 && u.piek) {
      s.push({
        id: `minder-nodig-${u.id}`,
        niveau: "info",
        titel: `${u.naam}: op je drukste moment heb je ${u.nodigBijPiek} van de ${u.aantal} nodig`,
        waarom: `Het drukste moment is ${plekNaam(u.piek.index)} (${u.piek.pct}% bezet). Dan staan er ${u.leegBijPiek} leeg. Dat betekent niet dat ze weg moeten: reken na of je de pieken kunt spreiden en of je de ruimte anders kunt gebruiken.`,
      });
    }
    if (u.piek && u.piek.pct >= DRUKTE_GRENS) {
      s.push({
        id: `vol-${u.id}`,
        niveau: "aandacht",
        titel: `${u.naam} zit op ${plekNaam(u.piek.index)} op ${u.piek.pct}%`,
        waarom: "Op dit moment is er bijna geen ruimte over voor uitloop of een extra afspraak. Kijk of je dit moment kunt spreiden over rustiger dagdelen.",
      });
    }
  }

  // 4. de spreiding over de week
  const dal = a.bezetting.dal;
  const piek = a.bezetting.piek;
  if (a.bezetting.spreiding !== null && a.bezetting.spreiding >= SPREIDING_GRENS && piek && dal) {
    s.push({
      id: "spreiding",
      niveau: "aandacht",
      titel: "De drukte is ongelijk verdeeld over de week",
      waarom: `Het drukste dagdeel is ${plekNaam(piek.index)} (${piek.pct}%), het rustigste ${plekNaam(dal.index)} (${dal.pct}%): ${a.bezetting.spreiding} procentpunt verschil. Wie op de piek meer mensen nodig heeft en op het dal minder, kan flexwerkers op de piek inzetten in plaats van vast personeel.`,
      actie: { label: "Klus uitzetten voor de piek", href: "/werkgever/diensten/nieuw" },
    });
  }

  // 5. indeling: oppervlakte per medewerker
  if (a.ruimtes.m2PerFte !== null) {
    s.push({
      id: "m2-per-fte",
      niveau: "info",
      titel: `${a.ruimtes.m2PerFte} m² ruimte per fte`,
      waarom: `Je hebt ${a.ruimtes.m2Totaal} m² aan ruimtes en ${a.financieel.fte} fte. Vergelijk dit getal met een eerder jaar of met een andere locatie van jezelf; een algemene norm geven we niet.`,
    });
  }
  return s;
}

/** Hoeveel van wat we voor een volledig beeld nodig hebben is ingevuld (0 tot 100). */
function volledigheid(b: BedrijfInKaart, a: Analyse): number {
  const stukken = [
    b.omzetJaar !== null,
    a.financieel.personeelskosten !== null,
    b.groepen.length > 0,
    b.ruimtes.length > 0,
    b.ruimtes.length > 0 && b.ruimtes.every((r) => r.m2 !== null),
    a.bezetting.ruimtesMetGegevens > 0,
    b.ruimtes.length > 0 && a.bezetting.ruimtesMetGegevens === b.ruimtes.length,
    b.huurJaar !== null,
  ];
  return Math.round((stukken.filter(Boolean).length / stukken.length) * 100);
}

/** De dagen en dagdelen als rijen voor een rooster op het scherm: elke rij een dag met drie waarden. */
export function roosterRijen(raster: (number | null)[]): { dag: (typeof DAGEN)[number]; waarden: (number | null)[] }[] {
  return DAGEN.map((dag, d) => ({ dag, waarden: DAGDELEN.map((_, k) => raster[d * DAGDELEN.length + k] ?? null) }));
}
