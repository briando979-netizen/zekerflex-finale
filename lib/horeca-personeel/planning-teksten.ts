// De tekst van de planning van het eigen personeel (lib/horeca-personeel/planning.ts), in Nederlands en Engels: het beheer van de
// opdrachtgever (components/horeca/beheer/PlanningBeheer.tsx) en de onderdelen op het dashboard van de medewerker
// (components/personeel/PlanningBlok.tsx, VerlofBlok.tsx, UrenBlok.tsx). Hoort bij PersoneelTeksten (teksten.ts). Een tekst met
// een invulling heeft een plaatshouder ({naam}) die de client met vulIn invult.
// Machine-assisted translation (EN): native-speaker review recommended.

export interface PlanningTeksten {
  gemeen: { bezig: string; fout: string; verwijder: string; annuleer: string; bewaar: string; ja: string };
  status: { aangeboden: string; geaccepteerd: string; goedgekeurd: string; afgewezen: string; ingetrokken: string; aangevraagd: string };
  waarschuwing: { verlof: string; "niet-beschikbaar": string; overlap: string };
  beheer: {
    kop: string;
    weekVan: string;
    vorige: string;
    volgende: string;
    dezeWeek: string;
    open: string;
    uren: string;
    geenDiensten: string;
    toevoegenKop: string;
    medewerker: string;
    datum: string;
    van: string;
    tot: string;
    notitie: string;
    plaats: string;
    kopieer: string;
    gekopieerd: string;
    wijzig: string;
    ruilKop: string;
    ruilTekst: string;
    ruilOpenTekst: string;
    geenRuilen: string;
    goedkeuren: string;
    afwijzen: string;
    verlofKop: string;
    verlofTekst: string;
    geenVerlof: string;
    urenKop: string;
    maand: string;
    exportCsv: string;
    geenUren: string;
    nogIngeklokt: string;
    uurToevoegen: string;
    uurIn: string;
    uurUit: string;
    totaalKop: string;
  };
  rooster: {
    kop: string;
    geenDiensten: string;
    openKop: string;
    geenOpen: string;
    neemOpen: string;
    aanbiedingKop: string;
    geenAanbiedingen: string;
    neemAan: string;
    bied: string;
    aanTeam: string;
    ruilKop: string;
    wachtOp: string;
    intrekken: string;
    nietKop: string;
    nietUitleg: string;
    datum: string;
    notitie: string;
    voeg: string;
    geenNiet: string;
    van: string;
  };
  verlof: { kop: string; uitleg: string; van: string; tot: string; reden: string; vraag: string; geen: string; intrekken: string; periode: string };
  uren: { kop: string; klokIn: string; klokUit: string; ingeklokt: string; niet: string; geen: string; totaal: string; lopend: string };
  fooi: { kop: string; uitleg: string; periode: string; van: string; tot: string; bedrag: string; notitie: string; verdeel: string; geen: string; deel: string; totaalPot: string; verdeling: string };
}

export const PLANNING_NL: PlanningTeksten = {
  gemeen: { bezig: "Bezig…", fout: "Dat lukte niet. Probeer het zo nog eens.", verwijder: "Verwijderen", annuleer: "Annuleren", bewaar: "Bewaren", ja: "Ja" },
  status: { aangeboden: "Aangeboden", geaccepteerd: "Wacht op goedkeuring", goedgekeurd: "Goedgekeurd", afgewezen: "Afgewezen", ingetrokken: "Ingetrokken", aangevraagd: "Aangevraagd" },
  waarschuwing: {
    verlof: "Let op: deze medewerker heeft op deze dag goedgekeurd verlof.",
    "niet-beschikbaar": "Let op: deze medewerker heeft aangegeven niet beschikbaar te zijn.",
    overlap: "Let op: deze medewerker heeft op dit tijdstip al een dienst.",
  },
  beheer: {
    kop: "Planning",
    weekVan: "Week van {datum}",
    vorige: "Vorige week",
    volgende: "Volgende week",
    dezeWeek: "Deze week",
    open: "Open dienst",
    uren: "{uren} uur",
    geenDiensten: "Geen diensten.",
    toevoegenKop: "Dienst plannen",
    medewerker: "Medewerker",
    datum: "Datum",
    van: "Van",
    tot: "Tot",
    notitie: "Notitie (optioneel)",
    plaats: "Dienst plannen",
    kopieer: "Kopieer deze week naar volgende week",
    gekopieerd: "{n} diensten gekopieerd.",
    wijzig: "Wijzigen",
    ruilKop: "Ruilverzoeken",
    ruilTekst: "{van} geeft de dienst van {datum} ({tijd}) aan {naar}.",
    ruilOpenTekst: "{naar} wil de open dienst van {datum} ({tijd}) nemen.",
    geenRuilen: "Er wachten geen ruilverzoeken op je besluit.",
    goedkeuren: "Goedkeuren",
    afwijzen: "Afwijzen",
    verlofKop: "Verlofaanvragen",
    verlofTekst: "{naam}: {van} t/m {tot}",
    geenVerlof: "Er wachten geen verlofaanvragen op je besluit.",
    urenKop: "Gewerkte uren",
    maand: "Maand",
    exportCsv: "Download als csv",
    geenUren: "Geen uren in deze maand.",
    nogIngeklokt: "nog ingeklokt",
    uurToevoegen: "Uren toevoegen of corrigeren",
    uurIn: "Van",
    uurUit: "Tot",
    totaalKop: "Totaal per medewerker",
  },
  rooster: {
    kop: "Mijn rooster",
    geenDiensten: "Je hebt de komende weken geen diensten.",
    openKop: "Open diensten",
    geenOpen: "Er zijn geen open diensten.",
    neemOpen: "Ik neem deze dienst",
    aanbiedingKop: "Aangeboden door collega's",
    geenAanbiedingen: "Geen aangeboden diensten.",
    neemAan: "Overnemen",
    bied: "Aanbieden",
    aanTeam: "Aan het team aanbieden",
    ruilKop: "Mijn verzoeken",
    wachtOp: "Wacht op goedkeuring van je werkgever",
    intrekken: "Intrekken",
    nietKop: "Niet beschikbaar",
    nietUitleg: "Geef door op welke dagen je niet kunt werken. Je werkgever ziet dit bij het plannen.",
    datum: "Datum",
    notitie: "Reden (optioneel)",
    voeg: "Doorgeven",
    geenNiet: "Je hebt geen dagen doorgegeven.",
    van: "van {naam}",
  },
  verlof: { kop: "Verlof", uitleg: "Vraag verlof aan; je werkgever keurt het goed of af.", van: "Eerste dag", tot: "Laatste dag", reden: "Reden (optioneel)", vraag: "Aanvragen", geen: "Je hebt geen verlofaanvragen.", intrekken: "Intrekken", periode: "{van} t/m {tot}" },
  uren: { kop: "Mijn uren", klokIn: "Inklokken", klokUit: "Uitklokken", ingeklokt: "Ingeklokt sinds {tijd}", niet: "Je bent niet ingeklokt.", geen: "Nog geen uren.", totaal: "Deze maand: {uren} uur", lopend: "bezig" },
  fooi: {
    kop: "Fooi",
    uitleg: "De fooienpot wordt verdeeld naar het aantal uren dat iedereen in die periode heeft gewerkt. De verdeling ligt vast zodra je hem maakt.",
    periode: "{van} t/m {tot}",
    van: "Eerste dag",
    tot: "Laatste dag",
    bedrag: "Bedrag in de pot (in euro)",
    notitie: "Notitie (optioneel)",
    verdeel: "Verdelen",
    geen: "Nog geen fooi verdeeld.",
    deel: "€ {bedrag}",
    totaalPot: "Pot: € {bedrag}",
    verdeling: "Jouw deel",
  },
};

export const PLANNING_EN: PlanningTeksten = {
  gemeen: { bezig: "Working…", fout: "That did not work. Please try again in a moment.", verwijder: "Delete", annuleer: "Cancel", bewaar: "Save", ja: "Yes" },
  status: { aangeboden: "Offered", geaccepteerd: "Waiting for approval", goedgekeurd: "Approved", afgewezen: "Declined", ingetrokken: "Withdrawn", aangevraagd: "Requested" },
  waarschuwing: {
    verlof: "Careful: this staff member has approved leave on this day.",
    "niet-beschikbaar": "Careful: this staff member said they are not available.",
    overlap: "Careful: this staff member already has a shift at this time.",
  },
  beheer: {
    kop: "Planning",
    weekVan: "Week of {datum}",
    vorige: "Previous week",
    volgende: "Next week",
    dezeWeek: "This week",
    open: "Open shift",
    uren: "{uren} h",
    geenDiensten: "No shifts.",
    toevoegenKop: "Plan a shift",
    medewerker: "Staff member",
    datum: "Date",
    van: "From",
    tot: "To",
    notitie: "Note (optional)",
    plaats: "Plan shift",
    kopieer: "Copy this week to next week",
    gekopieerd: "{n} shifts copied.",
    wijzig: "Edit",
    ruilKop: "Swap requests",
    ruilTekst: "{van} gives the shift on {datum} ({tijd}) to {naar}.",
    ruilOpenTekst: "{naar} wants to take the open shift on {datum} ({tijd}).",
    geenRuilen: "No swap requests are waiting for your decision.",
    goedkeuren: "Approve",
    afwijzen: "Decline",
    verlofKop: "Leave requests",
    verlofTekst: "{naam}: {van} to {tot}",
    geenVerlof: "No leave requests are waiting for your decision.",
    urenKop: "Hours worked",
    maand: "Month",
    exportCsv: "Download as csv",
    geenUren: "No hours this month.",
    nogIngeklokt: "still clocked in",
    uurToevoegen: "Add or correct hours",
    uurIn: "From",
    uurUit: "To",
    totaalKop: "Total per staff member",
  },
  rooster: {
    kop: "My rota",
    geenDiensten: "You have no shifts in the coming weeks.",
    openKop: "Open shifts",
    geenOpen: "There are no open shifts.",
    neemOpen: "I take this shift",
    aanbiedingKop: "Offered by colleagues",
    geenAanbiedingen: "No shifts offered.",
    neemAan: "Take over",
    bied: "Offer",
    aanTeam: "Offer to the team",
    ruilKop: "My requests",
    wachtOp: "Waiting for your employer's approval",
    intrekken: "Withdraw",
    nietKop: "Not available",
    nietUitleg: "Tell us on which days you cannot work. Your employer sees this when planning.",
    datum: "Date",
    notitie: "Reason (optional)",
    voeg: "Submit",
    geenNiet: "You have not submitted any days.",
    van: "from {naam}",
  },
  verlof: { kop: "Leave", uitleg: "Request leave; your employer approves or declines it.", van: "First day", tot: "Last day", reden: "Reason (optional)", vraag: "Request", geen: "You have no leave requests.", intrekken: "Withdraw", periode: "{van} to {tot}" },
  uren: { kop: "My hours", klokIn: "Clock in", klokUit: "Clock out", ingeklokt: "Clocked in since {tijd}", niet: "You are not clocked in.", geen: "No hours yet.", totaal: "This month: {uren} h", lopend: "in progress" },
  fooi: {
    kop: "Tips",
    uitleg: "The tip pot is shared by the hours everyone worked in that period. The split is fixed as soon as you create it.",
    periode: "{van} to {tot}",
    van: "First day",
    tot: "Last day",
    bedrag: "Amount in the pot (in euros)",
    notitie: "Note (optional)",
    verdeel: "Share out",
    geen: "No tips shared yet.",
    deel: "€ {bedrag}",
    totaalPot: "Pot: € {bedrag}",
    verdeling: "Your share",
  },
};
