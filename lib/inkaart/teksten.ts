import type { Locale } from "@/lib/i18n/config";
import type { SignaalSoort } from "@/lib/inkaart/analyse";

// ---------------------------------------------------------------------------
// Alle tekst van "Bedrijf in kaart" (lib/inkaart), in de twee talen van de werkgeversapp (EMPLOYER_LOCALES: Nederlands en Engels). De server kiest
// de taal (app/werkgever/in-kaart/page.tsx) en geeft alleen die mee; de browser importeert hier alleen typen uit (lib/inkaart/render.ts doet het
// invullen). Puur bestand, zonder functies in de data: de tekst gaat van de server naar een clientcomponent. Een tekst met een invulling heeft een
// plaatshouder ({naam}) die render.ts vult. Menunamen: nav.inkaart in lib/i18n/dictionaries.ts.
// Machine-assisted translation (EN): native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface SignaalSjabloon {
  titel: string;
  waarom: string;
  /** een tweede variant van de uitleg (bijv. met een bedrag, of zonder eigen doel); zie lib/inkaart/render.ts */
  waaromAnders?: string;
  /** een zin die achter de uitleg komt als het cijfer ervoor bekend is */
  erbij?: string;
  actie?: string;
}

export interface InKaartTeksten {
  /** de taalcode voor getallen en bedragen */
  taal: "nl-NL" | "en-GB";
  dagen: readonly [string, string, string, string, string, string, string];
  dagdelen: readonly [{ naam: string; tijd: string }, { naam: string; tijd: string }, { naam: string; tijd: string }];
  /** de naam van een ruimtesoort die niet is ingevuld */
  overig: string;
  /** "{dag}{deel}" bij een plek in het raster, bijvoorbeeld "maandagochtend" */
  plek: string;
  pagina: { titel: string; eyebrow: string; subtitel: string };
  tabs: { label: string; resultaat: string; gegevens: string; personeel: string; ruimtes: string; bezetting: string };
  voortgang: { titel: string; aria: string; hint: string };
  balk: { bewaar: string; bezig: string; gewijzigd: string; klaar: string; bewaard: string; fout: string; alleenLezen: string };
  start: { titel: string; tekst: string; knop: string };
  kpi: {
    personeelPct: string;
    kostenPerFte: string;
    ruimtes: string;
    gemBezetting: string;
    omzetPerFte: string;
    huurPct: string;
    omzetPerM2: string;
    m2PerFte: string;
    perJaar: string;
    doel: string;
    fte: string;
    m2Samen: string;
    vulPersoneelOmzet: string;
    vulFte: string;
    vulOppervlakte: string;
    vulDrukte: string;
    overOpen: string;
    kerncijfers: string;
    meer: string;
  };
  signalen: { kop: string; leeg: string; aandacht: string; info: string; sjablonen: Record<SignaalSoort, SignaalSjabloon> };
  rooster: { kop: string; uitleg: string; piekDal: string; gesloten: string; bezet: string; caption: string };
  perRuimte: { kop: string; caption: string; ruimte: string; aantal: string; gemBezet: string; nodig: string; leeg: string; uren: string; noot: string };
  gegevens: {
    bedrijfKop: string;
    soort: string;
    soortUitleg: string;
    jaar: string;
    voorbeeld: string;
    vervangVraag: string;
    ja: string;
    nee: string;
    geldKop: string;
    geldUitleg: string;
    omzet: string;
    personeelskosten: string;
    personeelskostenUitleg: string;
    huur: string;
    perJaarEenheid: string;
    doelenKop: string;
    doelenUitleg: string;
    doelPersoneel: string;
    doelPersoneelEenheid: string;
    doelBezetting: string;
    doelBezettingEenheid: string;
    doelBezettingUitleg: string;
    openKop: string;
    openUitleg: string;
    openCaption: string;
    openLabel: string;
  };
  personeel: { uitleg: string; groep: string; fte: string; kosten: string; verwijder: string; leeg: string; voeg: string };
  ruimtes: {
    uitleg: string;
    naam: string;
    soort: string;
    soortUitleg: string;
    aantal: string;
    m2: string;
    plekken: string;
    plekkenUitleg: string;
    afdeling: string;
    verdieping: string;
    notitie: string;
    notitieUitleg: string;
    verwijder: string;
    leeg: string;
    voeg: string;
    nieuwNaam: string;
    nieuweGroep: string;
  };
  bezetting: { uitleg: string; eerst: string; ruimte: string; vul: string; vulKnop: string; kopieer: string; geenOpen: string; caption: string; cel: string; gesloten: string };
}

const nl: InKaartTeksten = {
  taal: "nl-NL",
  dagen: ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
  dagdelen: [
    { naam: "ochtend", tijd: "6 tot 12 uur" },
    { naam: "middag", tijd: "12 tot 18 uur" },
    { naam: "avond", tijd: "18 tot 24 uur" },
  ],
  overig: "Overig",
  plek: "{dag}{deel}",
  pagina: {
    titel: "Bedrijf in kaart",
    eyebrow: "Inzicht",
    subtitel: "Zet je personeel, kosten en ruimtes in een paar minuten neer. Je ziet wat je personeel kost, hoeveel ruimtes je echt nodig hebt, wanneer het druk is en wat je kunt verbeteren.",
  },
  tabs: { label: "Onderdelen van Bedrijf in kaart", resultaat: "Resultaat", gegevens: "Gegevens", personeel: "Personeel", ruimtes: "Ruimtes", bezetting: "Bezetting" },
  voortgang: { titel: "Hoe compleet is je beeld?", aria: "Volledigheid van de ingevulde gegevens", hint: "Een schatting is genoeg. Hoe meer je invult, hoe preciezer wat we kunnen zeggen." },
  balk: {
    bewaar: "Bewaren",
    bezig: "Bewaren…",
    gewijzigd: "Je hebt wijzigingen die nog niet bewaard zijn.",
    klaar: "Alles is bewaard.",
    bewaard: "Bewaard.",
    fout: "Bewaren lukte niet. Probeer het zo nog eens.",
    alleenLezen: "Je kunt deze gegevens bekijken. Een beheerder of lokale manager past ze aan.",
  },
  start: {
    titel: "Begin met je soort bedrijf",
    tekst: "Kies bij Gegevens wat voor bedrijf je hebt en laad een voorbeeldset: dan staan de ruimtes en groepen personeel die erbij horen er al in. Jij vult de aantallen en cijfers in; wij rekenen uit wat eruit volgt.",
    knop: "Naar Gegevens",
  },
  kpi: {
    personeelPct: "Personeelskosten, % van de omzet",
    kostenPerFte: "Kosten per fte",
    ruimtes: "Ruimtes",
    gemBezetting: "Gemiddelde bezetting",
    omzetPerFte: "Omzet per fte",
    huurPct: "Huur, % van de omzet",
    omzetPerM2: "Omzet per m²",
    m2PerFte: "m² per fte",
    perJaar: "{bedrag} per jaar",
    doel: "doel {pct}%",
    fte: "{n} fte",
    m2Samen: "{n} m² samen",
    vulPersoneelOmzet: "Vul personeel en omzet in",
    vulFte: "Vul bij Personeel de fte in",
    vulOppervlakte: "Vul de oppervlakte in voor m²",
    vulDrukte: "Vul bij Bezetting de drukte in",
    overOpen: "over de open dagdelen, {n} ruimtesoort(en) ingevuld",
    kerncijfers: "Kerncijfers",
    meer: "Meer cijfers",
  },
  signalen: {
    kop: "Wat valt op",
    leeg: "Nog niets bijzonders. Vul meer in, dan kijken we mee.",
    aandacht: "Aandacht",
    info: "Info",
    sjablonen: {
      "geen-ruimtes": { titel: "Voeg je ruimtes toe", waarom: "Zonder ruimtes kunnen we niets zeggen over bezetting of indeling. Kies bij Ruimtes een voorbeeldset voor jouw soort bedrijf of voeg ze zelf toe." },
      "geen-bezetting": { titel: "Vul in wanneer je ruimtes bezet zijn", waarom: "Je hebt ruimtes, maar nog niet ingevuld hoe vol ze zijn. Zet bij Bezetting per ruimte een percentage per dagdeel (een schatting is genoeg), dan zie je waar capaciteit over is." },
      "personeel-boven-doel": {
        titel: "Personeelskosten liggen {teveel} procentpunt boven je doel",
        waarom: "Je personeelskosten zijn {pct}% van je omzet, je doel is {doel}%. Kijk naar de momenten waarop er meer mensen zijn dan nodig (zie het rooster hieronder) en zet flexwerkers alleen in op de drukke momenten.",
        waaromAnders: "Je personeelskosten zijn {pct}% van je omzet, je doel is {doel}%. Dat is ongeveer {bedrag} per jaar. Kijk naar de momenten waarop er meer mensen zijn dan nodig (zie het rooster hieronder) en zet flexwerkers alleen in op de drukke momenten.",
        actie: "Klus uitzetten voor een druk moment",
      },
      "personeel-binnen-doel": { titel: "Personeelskosten binnen je doel", waarom: "{pct}% van je omzet, je doel is {doel}%." },
      "personeel-doel": { titel: "Personeelskosten zijn {pct}% van je omzet", waarom: "Stel bij Gegevens een doel in voor dit percentage, dan laten we zien of je erboven of eronder zit. Een vergelijking met andere bedrijven geven we niet: de uitkomst hangt te veel af van je soort werk." },
      "personeel-omzet": { titel: "Vul je omzet in voor het personeelskostenpercentage", waarom: "We hebben personeel, maar nog geen omzet (of budget) per jaar. Zonder dat kunnen we het percentage niet uitrekenen." },
      rustig: {
        titel: "{naam} is gemiddeld {gemiddeld}% bezet",
        waarom: "Dat is onder de grens van {grens}% die we gebruiken zolang je geen doel instelt. Je kunt het gebruik delen met een andere afdeling, er andere activiteiten in plannen of er een andere bestemming aan geven.",
        waaromAnders: "Dat is onder jouw doel van {grens}%. Je kunt het gebruik delen met een andere afdeling, er andere activiteiten in plannen of er een andere bestemming aan geven.",
        erbij: "Samen staan deze ruimtes ongeveer {uren} uur per week leeg binnen je openingstijden.",
      },
      "minder-nodig": {
        titel: "{naam}: op je drukste moment heb je {nodig} van de {aantal} nodig",
        waarom: "Het drukste moment is {plek} ({pct}% bezet). Dan staan er {leeg} leeg. Dat betekent niet dat ze weg moeten: reken na of je de pieken kunt spreiden en of je de ruimte anders kunt gebruiken.",
      },
      vol: { titel: "{naam} zit op {plek} op {pct}%", waarom: "Op dit moment is er bijna geen ruimte over voor uitloop of een extra afspraak. Kijk of je dit moment kunt spreiden over rustiger dagdelen." },
      spreiding: {
        titel: "De drukte is ongelijk verdeeld over de week",
        waarom: "Het drukste dagdeel is {piekPlek} ({piekPct}%), het rustigste {dalPlek} ({dalPct}%): {verschil} procentpunt verschil. Wie op de piek meer mensen nodig heeft en op het dal minder, kan flexwerkers op de piek inzetten in plaats van vast personeel.",
        actie: "Klus uitzetten voor de piek",
      },
      "m2-per-fte": { titel: "{m2fte} m² ruimte per fte", waarom: "Je hebt {m2} m² aan ruimtes en {fte} fte. Vergelijk dit getal met een eerder jaar of met een andere locatie van jezelf; een algemene norm geven we niet." },
    },
  },
  rooster: {
    kop: "Wanneer is het druk",
    uitleg: "Gemiddelde bezetting van al je ruimtes per dagdeel. Donkerder is drukker; een streepje betekent gesloten of niet ingevuld.",
    piekDal: "Het drukste moment is {piek} ({piekPct}%), het rustigste {dal} ({dalPct}%).",
    gesloten: "gesloten of niet ingevuld",
    bezet: "{pct}% bezet",
    caption: "Gemiddelde bezetting per dag en dagdeel",
  },
  perRuimte: {
    kop: "Per ruimte",
    caption: "Bezetting en capaciteit per ruimte",
    ruimte: "Ruimte",
    aantal: "Aantal",
    gemBezet: "Gem. bezet",
    nodig: "Nodig bij piek",
    leeg: "Leeg bij piek",
    uren: "Uren leeg per week",
    noot: "Alles hierboven komt uit wat je zelf invulde; we vergelijken niet met andere bedrijven.",
  },
  gegevens: {
    bedrijfKop: "Wat voor bedrijf is het?",
    soort: "Soort bedrijf",
    soortUitleg: "Hiermee vullen we de namen van de ruimtes en de groepen personeel alvast in. De aantallen en cijfers vul jij in.",
    jaar: "Over welk jaar gaan de cijfers?",
    voorbeeld: "Voorbeeldset laden voor {soort}",
    vervangVraag: "Dit vervangt je huidige ruimtes en groepen personeel door de namen uit de voorbeeldset. Je ingevulde aantallen en bezetting gaan verloren. Doorgaan?",
    ja: "Ja, vervangen",
    nee: "Nee, laat het zoals het is",
    geldKop: "Geld",
    geldUitleg: "Per jaar, in hele euro. Een schatting is genoeg.",
    omzet: "Omzet of budget",
    personeelskosten: "Totale personeelskosten",
    personeelskostenUitleg: "Alleen als je ze niet per groep bij Personeel invult. Neem de werkgeverslasten mee.",
    huur: "Huur van de ruimtes",
    perJaarEenheid: "€ per jaar",
    doelenKop: "Je eigen doelen",
    doelenUitleg: "Waar wil je naartoe? We vergelijken met je eigen doel, niet met andere bedrijven. Leeg laten mag.",
    doelPersoneel: "Doel voor personeelskosten",
    doelPersoneelEenheid: "% van de omzet",
    doelBezetting: "Doel voor bezetting van ruimtes",
    doelBezettingEenheid: "% bezet",
    doelBezettingUitleg: "Ruimtes die gemiddeld lager zitten, krijgen een signaal. Zonder doel gebruiken we 40%.",
    openKop: "Wanneer ben je open?",
    openUitleg: "Vink de dagdelen aan waarin je ruimtes in gebruik zijn. Alleen die tellen mee in de bezetting.",
    openCaption: "Open dagdelen per dag",
    openLabel: "{dag} {deel} open",
  },
  personeel: {
    uitleg: "Groepen personeel met hun fte (voltijdsequivalenten) en wat ze per jaar kosten, werkgeverslasten inbegrepen. Weet je alleen het totaal? Vul dat bij Gegevens in.",
    groep: "Groep",
    fte: "Aantal fte",
    kosten: "Kosten",
    verwijder: "Groep {naam} verwijderen",
    leeg: "Nog geen groepen. Voeg er een toe, of laad bij Gegevens een voorbeeldset.",
    voeg: "+ Groep toevoegen",
  },
  ruimtes: {
    uitleg: "Eén regel per soort ruimte. Heb je 12 gelijke spreekkamers? Dan één regel met aantal 12. De oppervlakte is die van één ruimte. Afdeling en verdieping helpen om te zien hoe alles is ingedeeld.",
    naam: "Naam",
    soort: "Soort",
    soortUitleg: "Bijvoorbeeld spreekkamer of lokaal",
    aantal: "Aantal",
    m2: "Oppervlakte per ruimte",
    plekken: "Plekken per ruimte",
    plekkenUitleg: "Stoelen, bedden of werkplekken",
    afdeling: "Afdeling",
    verdieping: "Verdieping",
    notitie: "Notitie",
    notitieUitleg: "Bijvoorbeeld: grenst aan de wachtruimte",
    verwijder: "Ruimte {naam} verwijderen",
    leeg: "Nog geen ruimtes. Voeg er een toe, of laad bij Gegevens een voorbeeldset voor jouw soort bedrijf.",
    voeg: "+ Ruimte toevoegen",
    nieuwNaam: "Nieuwe ruimte",
    nieuweGroep: "Nieuwe groep",
  },
  bezetting: {
    uitleg: "Hoeveel procent van de ruimtes (van deze soort) is er gemiddeld bezet in elk dagdeel? Een schatting is genoeg. Dagdelen waarin je niet open bent, vul je niet in; zet ze bij Gegevens open als dat niet klopt.",
    eerst: "Voeg eerst ruimtes toe bij Ruimtes.",
    ruimte: "Ruimte",
    vul: "Alle open dagdelen vullen met (%)",
    vulKnop: "Vullen",
    kopieer: "Kopieer naar alle ruimtes",
    geenOpen: "Er is geen dagdeel open gezet. Zet bij Gegevens aan wanneer je open bent.",
    caption: "Bezetting van {naam} per dag en dagdeel, in procenten",
    cel: "{naam}, {dag} {deel}, procent bezet{gesloten}",
    gesloten: " (gesloten)",
  },
};

const en: InKaartTeksten = {
  taal: "en-GB",
  dagen: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  dagdelen: [
    { naam: "morning", tijd: "6 am to 12 noon" },
    { naam: "afternoon", tijd: "12 noon to 6 pm" },
    { naam: "evening", tijd: "6 pm to midnight" },
  ],
  overig: "Other",
  plek: "{dag} {deel}",
  pagina: {
    titel: "Business overview",
    eyebrow: "Insight",
    subtitel: "Enter your staff, costs and rooms in a few minutes. You see what your staff costs, how many rooms you really need, when it is busy and what you can improve.",
  },
  tabs: { label: "Sections of Business overview", resultaat: "Result", gegevens: "Details", personeel: "Staff", ruimtes: "Rooms", bezetting: "Occupancy" },
  voortgang: { titel: "How complete is your picture?", aria: "Completeness of the data entered", hint: "An estimate is enough. The more you fill in, the more precisely we can say something." },
  balk: {
    bewaar: "Save",
    bezig: "Saving…",
    gewijzigd: "You have changes that are not saved yet.",
    klaar: "Everything is saved.",
    bewaard: "Saved.",
    fout: "Saving failed. Please try again in a moment.",
    alleenLezen: "You can view this data. An administrator or local manager can change it.",
  },
  start: {
    titel: "Start with your type of business",
    tekst: "Under Details, choose what kind of business you have and load an example set: the rooms and staff groups that go with it are then filled in. You enter the numbers; we work out what follows.",
    knop: "Go to Details",
  },
  kpi: {
    personeelPct: "Staff costs, % of revenue",
    kostenPerFte: "Cost per fte",
    ruimtes: "Rooms",
    gemBezetting: "Average occupancy",
    omzetPerFte: "Revenue per fte",
    huurPct: "Rent, % of revenue",
    omzetPerM2: "Revenue per m²",
    m2PerFte: "m² per fte",
    perJaar: "{bedrag} per year",
    doel: "target {pct}%",
    fte: "{n} fte",
    m2Samen: "{n} m² in total",
    vulPersoneelOmzet: "Enter staff and revenue",
    vulFte: "Enter the fte under Staff",
    vulOppervlakte: "Enter the floor area for m²",
    vulDrukte: "Enter occupancy under Occupancy",
    overOpen: "over the open parts of the day, {n} room type(s) entered",
    kerncijfers: "Key figures",
    meer: "More figures",
  },
  signalen: {
    kop: "What stands out",
    leeg: "Nothing special yet. Fill in more and we will take a look.",
    aandacht: "Attention",
    info: "Info",
    sjablonen: {
      "geen-ruimtes": { titel: "Add your rooms", waarom: "Without rooms we cannot say anything about occupancy or layout. Under Rooms, choose an example set for your type of business or add them yourself." },
      "geen-bezetting": { titel: "Enter when your rooms are occupied", waarom: "You have rooms, but have not yet entered how busy they are. Under Occupancy, enter a percentage per part of the day for each room (an estimate is enough) to see where capacity is left." },
      "personeel-boven-doel": {
        titel: "Staff costs are {teveel} percentage points above your target",
        waarom: "Your staff costs are {pct}% of your revenue, your target is {doel}%. Look at the moments when there are more people than needed (see the schedule below) and use flexible workers only at the busy moments.",
        waaromAnders: "Your staff costs are {pct}% of your revenue, your target is {doel}%. That is roughly {bedrag} per year. Look at the moments when there are more people than needed (see the schedule below) and use flexible workers only at the busy moments.",
        actie: "Post a job for a busy moment",
      },
      "personeel-binnen-doel": { titel: "Staff costs within your target", waarom: "{pct}% of your revenue, your target is {doel}%." },
      "personeel-doel": { titel: "Staff costs are {pct}% of your revenue", waarom: "Set a target for this percentage under Details and we will show whether you are above or below it. We do not compare with other companies: the outcome depends too much on your kind of work." },
      "personeel-omzet": { titel: "Enter your revenue for the staff cost percentage", waarom: "We have staff, but no revenue (or budget) per year yet. Without it we cannot calculate the percentage." },
      rustig: {
        titel: "{naam} is {gemiddeld}% occupied on average",
        waarom: "That is below the limit of {grens}% we use as long as you do not set a target. You can share the use with another department, plan other activities in it or give it another purpose.",
        waaromAnders: "That is below your target of {grens}%. You can share the use with another department, plan other activities in it or give it another purpose.",
        erbij: "Together these rooms are empty for roughly {uren} hours a week within your opening hours.",
      },
      "minder-nodig": {
        titel: "{naam}: at your busiest moment you need {nodig} of the {aantal}",
        waarom: "The busiest moment is {plek} ({pct}% occupied). Then {leeg} are empty. That does not mean they have to go: check whether you can spread the peaks and whether you can use the room differently.",
      },
      vol: { titel: "{naam} is at {pct}% on {plek}", waarom: "At this moment there is almost no room left for overrun or an extra appointment. See whether you can spread this moment over quieter parts of the day." },
      spreiding: {
        titel: "Busyness is unevenly spread over the week",
        waarom: "The busiest part of the day is {piekPlek} ({piekPct}%), the quietest {dalPlek} ({dalPct}%): a difference of {verschil} percentage points. If you need more people at the peak and fewer in the lull, you can use flexible workers at the peak instead of permanent staff.",
        actie: "Post a job for the peak",
      },
      "m2-per-fte": { titel: "{m2fte} m² of space per fte", waarom: "You have {m2} m² of rooms and {fte} fte. Compare this figure with an earlier year or with another location of your own; we do not give a general norm." },
    },
  },
  rooster: {
    kop: "When is it busy",
    uitleg: "Average occupancy of all your rooms per part of the day. Darker is busier; a dash means closed or not entered.",
    piekDal: "The busiest moment is {piek} ({piekPct}%), the quietest {dal} ({dalPct}%).",
    gesloten: "closed or not entered",
    bezet: "{pct}% occupied",
    caption: "Average occupancy per day and part of the day",
  },
  perRuimte: {
    kop: "Per room",
    caption: "Occupancy and capacity per room",
    ruimte: "Room",
    aantal: "Number",
    gemBezet: "Avg. occupied",
    nodig: "Needed at peak",
    leeg: "Empty at peak",
    uren: "Hours empty per week",
    noot: "Everything above comes from what you entered yourself; we do not compare with other companies.",
  },
  gegevens: {
    bedrijfKop: "What kind of business is it?",
    soort: "Type of business",
    soortUitleg: "We use this to fill in the names of the rooms and the staff groups. You enter the numbers.",
    jaar: "Which year do the figures cover?",
    voorbeeld: "Load example set for {soort}",
    vervangVraag: "This replaces your current rooms and staff groups with the names from the example set. The numbers and occupancy you entered will be lost. Continue?",
    ja: "Yes, replace",
    nee: "No, keep it as it is",
    geldKop: "Money",
    geldUitleg: "Per year, in whole euros. An estimate is enough.",
    omzet: "Revenue or budget",
    personeelskosten: "Total staff costs",
    personeelskostenUitleg: "Only if you do not enter them per group under Staff. Include employer costs.",
    huur: "Rent for the rooms",
    perJaarEenheid: "€ per year",
    doelenKop: "Your own targets",
    doelenUitleg: "Where do you want to get to? We compare with your own target, not with other companies. You can leave it empty.",
    doelPersoneel: "Target for staff costs",
    doelPersoneelEenheid: "% of revenue",
    doelBezetting: "Target for room occupancy",
    doelBezettingEenheid: "% occupied",
    doelBezettingUitleg: "Rooms with a lower average occupancy get a signal. Without a target we use 40%.",
    openKop: "When are you open?",
    openUitleg: "Tick the parts of the day in which your rooms are in use. Only those count towards occupancy.",
    openCaption: "Open parts of the day per day",
    openLabel: "{dag} {deel} open",
  },
  personeel: {
    uitleg: "Staff groups with their fte (full-time equivalents) and what they cost per year, employer costs included. Do you only know the total? Enter it under Details.",
    groep: "Group",
    fte: "Number of fte",
    kosten: "Costs",
    verwijder: "Remove group {naam}",
    leeg: "No groups yet. Add one, or load an example set under Details.",
    voeg: "+ Add group",
  },
  ruimtes: {
    uitleg: "One line per type of room. Do you have 12 identical consulting rooms? Then one line with number 12. The floor area is that of one room. Department and floor help to see how everything is laid out.",
    naam: "Name",
    soort: "Type",
    soortUitleg: "For example consulting room or classroom",
    aantal: "Number",
    m2: "Floor area per room",
    plekken: "Places per room",
    plekkenUitleg: "Chairs, beds or workstations",
    afdeling: "Department",
    verdieping: "Floor",
    notitie: "Note",
    notitieUitleg: "For example: next to the waiting room",
    verwijder: "Remove room {naam}",
    leeg: "No rooms yet. Add one, or load an example set for your type of business under Details.",
    voeg: "+ Add room",
    nieuwNaam: "New room",
    nieuweGroep: "New group",
  },
  bezetting: {
    uitleg: "What percentage of the rooms (of this type) is occupied on average in each part of the day? An estimate is enough. Do not fill in parts of the day when you are not open; open them under Details if that is wrong.",
    eerst: "First add rooms under Rooms.",
    ruimte: "Room",
    vul: "Fill all open parts of the day with (%)",
    vulKnop: "Fill",
    kopieer: "Copy to all rooms",
    geenOpen: "No part of the day is set to open. Under Details, set when you are open.",
    caption: "Occupancy of {naam} per day and part of the day, in percent",
    cel: "{naam}, {dag} {deel}, percent occupied{gesloten}",
    gesloten: " (closed)",
  },
};

export const INKAART_TEKSTEN = { nl, en } as const;

/** De teksten in de taal van de werkgeversapp (nl of en); elke andere taal valt terug op Nederlands. */
export function inkaartTeksten(locale: Locale): InKaartTeksten {
  return locale === "en" ? en : nl;
}
