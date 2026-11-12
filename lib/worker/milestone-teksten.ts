// ---------------------------------------------------------------------------
// De teksten van de administratie-mijlpalen (lib/worker/milestones.ts), Nederlands: de bron. De andere talen (EN/PL/RO/UK)
// staan in lib/i18n/freelancer.ts onder `milestones` met dezelfde vorm. Puur en zonder imports, zodat zowel de server als
// de woordenlijst het kan laden. Plaatshouders: {pct}, {naam}, {n}, {uren}, {bedrag}, {datum}, … (lib/i18n/vul-in.ts).
// De standaard van de mijlpalen is deze Nederlandse tekst: de dagelijkse push en de tests lezen hem ongewijzigd.
// ---------------------------------------------------------------------------

export const MILESTONE_NL = {
  /** taalcode voor getallen en datums */
  intl: "nl-NL",
  kwartalen: ["jan–mrt", "apr–jun", "jul–sep", "okt–dec"],
  spreiding: {
    titel: "Spreiding over opdrachtgevers",
    teWeinig: "Nog te weinig uren",
    teWeinigDetail: "Zodra je ruim {uren} uur via ZekerFlex hebt gewerkt, zie je hier hoe je omzet over je opdrachtgevers verdeeld is.",
    kop: "{pct}% bij {naam}",
    actie: "{pct}% van je ZekerFlex-omzet van het afgelopen jaar komt van {naam}. Voor de Wet DBA is zo'n sterke afhankelijkheid van één opdrachtgever een signaal van schijnzelfstandigheid; ZekerFlex kan nieuwe diensten bij die opdrachtgever dan beperken.",
    binnenkort: "{pct}% van je ZekerFlex-omzet komt van {naam}. Werk je ook voor andere opdrachtgevers, dan blijf je ruim onder de grens van {max}%.",
    verdeeldEen: "Je omzet is goed verdeeld over {n} opdrachtgever; de grootste is goed voor {pct}%.",
    verdeeldMeer: "Je omzet is goed verdeeld over {n} opdrachtgevers; de grootste is goed voor {pct}%.",
    voortgang: "van je omzet bij je grootste opdrachtgever (grens {max}%)",
    impact: "Alleen je ZekerFlex-werk van de afgelopen 12 maanden telt hier mee; omzet buiten ZekerFlex weegt bij de Belastingdienst ook mee. Afhankelijkheid is één signaal: ook gezag, vervangbaarheid en hoe je feitelijk werkt tellen.",
  },
  abu: {
    titel: "Je ABU-fase",
    fase: { A: "Fase A", B: "Fase B", C: "Fase C" },
    faseVolledig: { A: "Fase A — uitzendbeding, tot 52 gewerkte weken", B: "Fase B — tijdelijke contracten, week 53 t/m 208", C: "Fase C — contract voor onbepaalde tijd" },
    detailEen: "{fase}. Je hebt {weken} week en {uren} uur gewerkt via ZekerFlex.",
    detailMeer: "{fase}. Je hebt {weken} weken en {uren} uur gewerkt via ZekerFlex.",
    impactA: "In fase A kun je per opdracht stoppen. Hoe meer weken je werkt, hoe meer zekerheid je opbouwt: na 52 weken ga je naar fase B met tijdelijke contracten.",
    impactB: "In fase B krijg je tijdelijke contracten — meer zekerheid dan fase A. Na fase B volgt fase C: een vast contract.",
    impactC: "Fase C: je hebt recht op een contract voor onbepaalde tijd. Maximale zekerheid.",
    voortgang: "naar je volgende contractblok",
  },
  stipp: {
    titel: "StiPP-pensioen",
    kop: { geen: "Nog geen pensioenopbouw (start in week 9)", basis: "Basisregeling", plus: "Plusregeling" },
    geenEen: "Pensioenopbouw start automatisch in week 9. Nog {n} week te gaan.",
    geenMeer: "Pensioenopbouw start automatisch in week 9. Nog {n} weken te gaan.",
    basis: "Je bouwt pensioen op in de basisregeling. Na week 78 ga je naar de plusregeling (werkgeversbijdrage) — nog {n} weken.",
    plus: "Je zit in de plusregeling: volledige opbouw met werkgeversbijdrage.",
    impact: "Je hoeft hier niets voor te doen — ZekerFlex regelt de aanmelding en afdracht via StiPP automatisch.",
  },
  belasting: {
    titel: "Belasting",
    kop: "Automatisch geregeld",
    detail: "Als uitzendkracht wordt de loonheffing al op je loon ingehouden en door ZekerFlex afgedragen. Je hoeft zelf geen btw- of inkomstenbelastingaangifte voor dit werk te doen.",
  },
  uren: {
    titel: "Urencriterium (1.225 uur)",
    kop: "{uren} / {max} uur",
    gehaald: "Je hebt de 1.225 uur dit jaar gehaald.",
    opSchema: "Op dit tempo kom je rond {uren} uur uit dit jaar — je ligt op schema.",
    onder: "Op dit tempo kom je rond {uren} uur uit dit jaar — dat is nog onder de grens.",
    voortgang: "gewerkt dit jaar (goedgekeurd)",
    impactGehaald: "Je komt in aanmerking voor de zelfstandigenaftrek (± {bedrag} aftrek, indicatief) plus de MKB-winstvrijstelling — samen al snel enkele honderden euro's minder belasting.",
    impactNiet: "Haal je de 1.225 uur, dan krijg je recht op de zelfstandigenaftrek (± {bedrag} aftrek, indicatief) en de MKB-winstvrijstelling. Alleen ZekerFlex-uren tellen hier mee; uren bij andere opdrachtgevers komen daar nog bij.",
  },
  kor: {
    titel: "KOR-omzetgrens (€ 20.000)",
    kop: "{omzet} / {grens}",
    over: "Je zit boven de KOR-grens van dit jaar. Je valt uit de kleineondernemersregeling en moet btw gaan rekenen en aangifte doen — meld je af bij de Belastingdienst.",
    bijna: "Je nadert de KOR-grens. Kom je erboven, dan verval je uit de regeling en ga je btw rekenen.",
    ruim: "Je blijft ruim onder de KOR-grens — je hoeft geen btw te rekenen of aan te geven.",
    voortgang: "omzet dit jaar (ZekerFlex)",
    impact: "Boven de grens reken je 21% btw. Je zakelijke klanten kunnen die btw aftrekken, dus voor hén verandert er netto weinig — maar jij moet voortaan btw-aangifte doen (en mag je eigen zakelijke btw aftrekken).",
  },
  btw: {
    titel: "Btw-aangifte Q{q}",
    kopBedrag: "± {bedrag} te betalen",
    kopGeen: "Nog geen btw dit kwartaal",
    detailEen: "Je btw over Q{q} ({range}) geef je aan bij de Belastingdienst vóór {datum} — nog {n} dag. Bedrag geschat uit je self-billing-facturen.",
    detailMeer: "Je btw over Q{q} ({range}) geef je aan bij de Belastingdienst vóór {datum} — nog {n} dagen. Bedrag geschat uit je self-billing-facturen.",
    detailVoorbij: "Je btw over Q{q} ({range}) geef je aan bij de Belastingdienst vóór {datum}. Bedrag geschat uit je self-billing-facturen.",
    impact: "Zet dit bedrag opzij in je Belasting-potje zodat je niet voor verrassingen komt te staan. ZekerFlex berekent de btw per factuur al voor je.",
  },
};

export type MilestoneTeksten = typeof MILESTONE_NL;
