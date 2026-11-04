import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Bewerkbare site-teksten zonder code. Een register van tekst-sleutels met hun
// standaardwaarde; de eigenaar kan ze overschrijven (Admin → Huisstijl →
// Teksten). Overrides staan in de KeyValueStore; leeg of gelijk aan de default
// = geen override (dus exact de oorspronkelijke tekst).
// ---------------------------------------------------------------------------

export interface ContentItem {
  key: string;
  label: string;
  default: string;
  group?: string;
  multiline?: boolean;
}

export const CONTENT_REGISTRY: ContentItem[] = [
  // ─────────────────────────────────────────────────────────── Hero
  { key: "hero.eyebrow", group: "Homepage — hero", label: "Bovenregel", default: "Personeel · website · branchesoftware · administratie" },
  { key: "hero.titleLine1", group: "Homepage — hero", label: "Titel regel 1", default: "Zeker van je werk." },
  { key: "hero.titleLine2", group: "Homepage — hero", label: "Titel regel 2 (accent)", default: "Zeker van je mensen." },
  {
    key: "hero.lead",
    group: "Homepage — hero",
    label: "Introtekst",
    default:
      "Eén plek voor je hele bedrijf: personeel, een eigen website, software voor jouw branche en je administratie. Zoek je werk? Hier vind je diensten bij jou in de buurt.",
    multiline: true,
  },
  { key: "hero.ctaPrimary", group: "Homepage — hero", label: "Knop 1 (werk zoeken)", default: "Ik zoek werk" },
  { key: "hero.ctaSecondary", group: "Homepage — hero", label: "Knop 2 (mensen zoeken)", default: "Ik zoek mensen" },

  // ─────────────────────────────────────────────────────────── Trust band
  { key: "trust.label", group: "Homepage — vertrouwensbalk", label: "Label", default: "Gebouwd op" },

  // ─────────────────────────────────────────────────────────── Hoe het werkt
  { key: "how.eyebrow", group: "Homepage — hoe het werkt", label: "Bovenregel", default: "Hoe het werkt" },
  { key: "how.title", group: "Homepage — hoe het werkt", label: "Titel", default: "Van aanmelding tot uitbetaling in drie stappen" },
  { key: "how.lead", group: "Homepage — hoe het werkt", label: "Introtekst", default: "Geen mailwisselingen, geen losse facturen, geen wachten op je geld.", multiline: true },

  // ─────────────────────────────────────────────────────────── Split: freelancers
  { key: "fl.eyebrow", group: "Homepage — blok freelancers", label: "Bovenregel", default: "Voor freelancers" },
  { key: "fl.title", group: "Homepage — blok freelancers", label: "Titel", default: "Werk dat bij je past. Geld dat op tijd komt." },
  { key: "fl.body", group: "Homepage — blok freelancers", label: "Introtekst", default: "Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling.", multiline: true },

  // ─────────────────────────────────────────────────────────── Split: bedrijven
  { key: "emp.eyebrow", group: "Homepage — blok bedrijven", label: "Bovenregel", default: "Voor bedrijven" },
  { key: "emp.title", group: "Homepage — blok bedrijven", label: "Titel", default: "Betrouwbare mensen, precies wanneer je ze nodig hebt." },
  { key: "emp.body", group: "Homepage — blok bedrijven", label: "Introtekst", default: "Zet een dienst uit en ZekerFlex regelt de rest: match, overeenkomst, check-in, facturatie en compliance.", multiline: true },

  // ─────────────────────────────────────────────────────────── Drie werkvormen
  { key: "work.eyebrow", group: "Homepage — drie werkvormen", label: "Bovenregel", default: "Drie manieren om te werken" },
  { key: "work.title", group: "Homepage — drie werkvormen", label: "Titel", default: "Zzp'er, flexwerker — of via ons uitzendbureau" },

  // ─────────────────────────────────────────────────────────── Features
  { key: "feat.eyebrow", group: "Homepage — het platform", label: "Bovenregel", default: "Het platform" },
  { key: "feat.title", group: "Homepage — het platform", label: "Titel", default: "Alles wat flexibel werk betrouwbaar maakt, in één systeem" },

  // ─────────────────────────────────────────────────────────── Compliance
  { key: "comp.eyebrow", group: "Homepage — compliance", label: "Bovenregel", default: "Zeker zit het goed" },
  { key: "comp.title", group: "Homepage — compliance", label: "Titel", default: "Compliance is geen bijzaak — het zit in de kern" },
  { key: "comp.lead", group: "Homepage — compliance", label: "Introtekst", default: "ZekerFlex controleert doorlopend of een samenwerking binnen de regels blijft, en grijpt in vóór het misgaat.", multiline: true },

  // ─────────────────────────────────────────────────────────── Testimonial
  {
    key: "quote.text",
    group: "Homepage — quote",
    label: "Citaat",
    default:
      "Ik plaats 's ochtends een dienst en heb binnen tien minuten een bekende kracht die komt. De uren keur ik 's avonds goed, de factuur staat er automatisch. Zo hoort het.",
    multiline: true,
  },
  { key: "quote.author", group: "Homepage — quote", label: "Naam / functie", default: "Merel — vestigingsmanager, supermarktketen Amsterdam" },

  // ─────────────────────────────────────────────────────────── FAQ
  { key: "faq.eyebrow", group: "Homepage — veelgestelde vragen", label: "Bovenregel", default: "Veelgestelde vragen" },
  { key: "faq.title", group: "Homepage — veelgestelde vragen", label: "Titel", default: "Goed om te weten" },

  // ─────────────────────────────────────────────────────────── Slot-CTA
  { key: "cta.title", group: "Homepage — slot-oproep", label: "Titel", default: "Klaar om zeker te werken?" },
  { key: "cta.lead", group: "Homepage — slot-oproep", label: "Introtekst", default: "Maak in een paar minuten een account aan. Gratis voor freelancers, geen opstartkosten voor bedrijven.", multiline: true },
  { key: "cta.primary", group: "Homepage — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "cta.secondary", group: "Homepage — slot-oproep", label: "Knop 2", default: "Bekijk de prijzen" },

  // ─────────────────────────────────────────────────────────── Voor bedrijven (/voor-bedrijven)
  { key: "vb.eyebrow", group: "Voor bedrijven — hero", label: "Bovenregel", default: "Voor bedrijven" },
  { key: "vb.title", group: "Voor bedrijven — hero", label: "Titel", default: "Betrouwbare mensen, precies wanneer je ze nodig hebt." },
  { key: "vb.lead", group: "Voor bedrijven — hero", label: "Introtekst", default: "Zet een dienst uit en ZekerFlex regelt de rest: de match, de overeenkomst, de check-in, de facturatie en de compliance.", multiline: true },
  { key: "vb.cta1", group: "Voor bedrijven — hero", label: "Knop 1", default: "Organisatie aanmelden" },
  { key: "vb.cta2", group: "Voor bedrijven — hero", label: "Knop 2", default: "Bekijk de prijzen" },
  { key: "vb.sys.eyebrow", group: "Voor bedrijven — secties", label: "Het systeem: bovenregel", default: "Het systeem" },
  { key: "vb.sys.title", group: "Voor bedrijven — secties", label: "Het systeem: titel", default: "Van dienst uitzetten tot factuur — één doorlopend proces" },
  { key: "vb.tools.eyebrow", group: "Voor bedrijven — secties", label: "Rekentools: bovenregel", default: "Reken het zelf uit" },
  { key: "vb.tools.title", group: "Voor bedrijven — secties", label: "Rekentools: titel", default: "Twee gratis rekentools voor werkgevers" },
  { key: "vb.tools.intro", group: "Voor bedrijven — secties", label: "Rekentools: introtekst", default: "Zonder account, en alles wordt in je eigen browser berekend." },
  { key: "vb.faq.eyebrow", group: "Voor bedrijven — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "vb.faq.title", group: "Voor bedrijven — secties", label: "Vragen: titel", default: "Goed om te weten" },
  { key: "vb.cta.title", group: "Voor bedrijven — slot-oproep", label: "Titel", default: "Zet vandaag je eerste dienst uit" },
  { key: "vb.cta.body", group: "Voor bedrijven — slot-oproep", label: "Tekst", default: "Meld je organisatie aan, richt je vestigingen in en nodig je managers uit. Binnen een uur operationeel.", multiline: true },
  { key: "vb.cta.primary", group: "Voor bedrijven — slot-oproep", label: "Knop 1", default: "Organisatie aanmelden" },
  { key: "vb.cta.secondary", group: "Voor bedrijven — slot-oproep", label: "Knop 2", default: "Voor freelancers" },

  // ─────────────────────────────────────────────────────────── Voor freelancers (/voor-freelancers)
  { key: "vf.eyebrow", group: "Voor freelancers — hero", label: "Bovenregel", default: "Voor freelancers" },
  { key: "vf.title", group: "Voor freelancers — hero", label: "Titel", default: "Werk dat bij je past. Geld dat op tijd komt." },
  { key: "vf.lead", group: "Voor freelancers — hero", label: "Introtekst", default: "Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling — zodat jij je op je werk kunt richten.", multiline: true },
  { key: "vf.cta1", group: "Voor freelancers — hero", label: "Knop 1", default: "Maak je profiel aan" },
  { key: "vf.cta2", group: "Voor freelancers — hero", label: "Knop 2", default: "Bekijk de voorwaarden" },
  { key: "vf.got.eyebrow", group: "Voor freelancers — secties", label: "Wat je krijgt: bovenregel", default: "Wat je krijgt" },
  { key: "vf.got.title", group: "Voor freelancers — secties", label: "Wat je krijgt: titel", default: "Alles geregeld, behalve het werk zelf" },
  { key: "vf.how.eyebrow", group: "Voor freelancers — secties", label: "Zo werkt het: bovenregel", default: "Zo werkt het" },
  { key: "vf.how.title", group: "Voor freelancers — secties", label: "Zo werkt het: titel", default: "Van aanmelding tot eerste uitbetaling" },
  { key: "vf.faq.eyebrow", group: "Voor freelancers — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "vf.faq.title", group: "Voor freelancers — secties", label: "Vragen: titel", default: "Goed om te weten" },
  { key: "vf.cta.title", group: "Voor freelancers — slot-oproep", label: "Titel", default: "Klaar om aan de slag te gaan?" },
  { key: "vf.cta.body", group: "Voor freelancers — slot-oproep", label: "Tekst", default: "Je profiel staat in een paar minuten. Gratis, geen verplichtingen.", multiline: true },
  { key: "vf.cta.primary", group: "Voor freelancers — slot-oproep", label: "Knop 1", default: "Profiel aanmaken" },
  { key: "vf.cta.secondary", group: "Voor freelancers — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },

  // ─────────────────────────────────────────────────────────── Prijzen (/prijzen)
  // Alleen tekst: de bedragen en de staffel komen uit lib/pricing/tiers.ts en zijn hier niet te wijzigen.
  { key: "pr.eyebrow", group: "Prijzen — hero", label: "Bovenregel", default: "Prijzen" },
  { key: "pr.title", group: "Prijzen — hero", label: "Titel", default: "Eerlijk en voorspelbaar" },
  { key: "pr.lead", group: "Prijzen — hero", label: "Introtekst", default: "Geen abonnement. Je betaalt alleen voor daadwerkelijk gewerkte uren; bij meer uren daalt je platformfee volgens een vaste, vooraf zichtbare staffel.", multiline: true },
  { key: "pr.fl.label", group: "Prijzen — kaarten", label: "Kaart freelancers: bovenregel", default: "Freelancers" },
  { key: "pr.fl.sub", group: "Prijzen — kaarten", label: "Kaart freelancers: onder de prijs", default: "Voor altijd. Meedoen kost je niets." },
  { key: "pr.fl.knop", group: "Prijzen — kaarten", label: "Kaart freelancers: knop", default: "Profiel aanmaken" },
  { key: "pr.bv.label", group: "Prijzen — kaarten", label: "Kaart bedrijven: bovenregel", default: "Bedrijven" },
  { key: "pr.bv.badge", group: "Prijzen — kaarten", label: "Kaart bedrijven: label rechtsboven", default: "Populair" },
  { key: "pr.bv.sub", group: "Prijzen — kaarten", label: "Kaart bedrijven: onder de prijs", default: "Platformkosten per gewerkt uur. Alleen wanneer er iemand werkt — met staffelkorting bij veel uren.", multiline: true },
  { key: "pr.bv.knop", group: "Prijzen — kaarten", label: "Kaart bedrijven: knop", default: "Organisatie aanmelden" },
  { key: "pr.api.eyebrow", group: "Prijzen — secties", label: "API: bovenregel", default: "Los van de klusprijs" },
  { key: "pr.api.title", group: "Prijzen — secties", label: "API: titel", default: "API-toegang voor ontwikkelaars" },
  { key: "pr.api.intro", group: "Prijzen — secties", label: "API: introtekst", default: "Een eigen systeem koppelen aan ZekerFlex (diensten lezen/aanmaken, uren ophalen, webhooks) is een los product met eigen abonnementen — de klusprijs hierboven blijft ongewijzigd.", multiline: true },
  { key: "pr.api.knop", group: "Prijzen — secties", label: "API: knop", default: "Bekijk API-abonnementen" },
  { key: "pr.faq.eyebrow", group: "Prijzen — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "pr.faq.title", group: "Prijzen — secties", label: "Vragen: titel", default: "Over de kosten" },
  { key: "pr.cta.title", group: "Prijzen — slot-oproep", label: "Titel", default: "Begin vandaag" },
  { key: "pr.cta.body", group: "Prijzen — slot-oproep", label: "Tekst", default: "Aanmelden is gratis en kost een paar minuten. Je zit nergens aan vast.", multiline: true },
  { key: "pr.cta.primary", group: "Prijzen — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "pr.cta.secondary", group: "Prijzen — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },

  // ─────────────────────────────────────────────────────────── Over ons (/over-ons)
  { key: "oo.eyebrow", group: "Over ons — hero", label: "Bovenregel", default: "Over ons" },
  { key: "oo.title", group: "Over ons — hero", label: "Titel", default: "Flexibel werk hoort eerlijk, snel en zeker te zijn." },
  {
    key: "oo.verhaal1",
    group: "Over ons — ons verhaal",
    label: "Alinea 1",
    default:
      "ZekerFlex is ontstaan uit een simpele frustratie: flexibel werken in Nederland is omslachtig geworden. Zzp'ers wachten weken op hun geld en verdrinken in facturen. Werkgevers puzzelen met bezetting en lopen risico op de Wet DBA. En tussen beide partijen staat een groeiend aantal bemiddelaars die vooral zichzelf bedienen.",
    multiline: true,
  },
  {
    key: "oo.verhaal2",
    group: "Over ons — ons verhaal",
    label: "Alinea 2",
    default:
      "Wij bouwen het alternatief: één systeem dat de match maakt, de overeenkomst regelt, de uren verwerkt, de facturen opstelt en de uitbetaling laat kiezen — met compliance ingebouwd in plaats van erbij bedacht.",
    multiline: true,
  },
  {
    key: "oo.verhaal3",
    group: "Over ons — ons verhaal",
    label: "Alinea 3",
    default:
      "We bouwen ZekerFlex voor de Nederlandse arbeidsmarkt. Voor hosting, betalingen, e-mail en identiteitscontroles werken we met gespecialiseerde dienstverleners. Onze AI-assistent kan draaien op een eigen modelserver. We leggen in ons privacybeleid uit welke gegevens we gebruiken en met wie we die delen.",
    multiline: true,
  },
  { key: "oo.opr.eyebrow", group: "Over ons — de oprichter", label: "Bovenregel", default: "De oprichter" },
  { key: "oo.opr.title", group: "Over ons — de oprichter", label: "Titel", default: "Gebouwd door één persoon" },
  {
    key: "oo.opr.tekst",
    group: "Over ons — de oprichter",
    label: "Tweede alinea (de eerste, met de naam, staat vast)",
    default:
      "De overtuiging erachter is nuchter: flexibel werk hoort voor iedereen bereikbaar te zijn. Of je nu studeert, er een baan naast hebt, of je leven even anders loopt — je moet er werk bij kunnen pakken dat zich voegt naar jóuw agenda, snel uitbetaalt en je niet opzadelt met rompslomp. Dat is waar ZekerFlex voor is gebouwd: werk dat meebeweegt met je leven, niet andersom.",
    multiline: true,
  },
  { key: "oo.punten.eyebrow", group: "Over ons — secties", label: "Uitgangspunten: bovenregel", default: "Waar we voor staan" },
  { key: "oo.punten.title", group: "Over ons — secties", label: "Uitgangspunten: titel", default: "Drie uitgangspunten" },
  { key: "oo.werk.eyebrow", group: "Over ons — secties", label: "Werken bij ons: bovenregel", default: "Werken bij ons" },
  { key: "oo.werk.title", group: "Over ons — secties", label: "Werken bij ons: titel", default: "Bouw mee aan ZekerFlex" },
  {
    key: "oo.werk.intro",
    group: "Over ons — secties",
    label: "Werken bij ons: introtekst",
    default: "We hebben niet altijd een vacature openstaan, maar goede mensen zijn altijd welkom. Stuur een open sollicitatie — vertel wat je meebrengt en waar je energie van krijgt.",
    multiline: true,
  },
  { key: "oo.cta.title", group: "Over ons — slot-oproep", label: "Titel", default: "Doe mee" },
  { key: "oo.cta.body", group: "Over ons — slot-oproep", label: "Tekst", default: "Als freelancer of als werkgever — aanmelden is gratis.", multiline: true },
  { key: "oo.cta.primary", group: "Over ons — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "oo.cta.secondary", group: "Over ons — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },

  // ─────────────────────────────────────────────────────────── Homepage: de lijsten en kaarten
  // Een lijst is één veld met één punt per regel (lijstRegels). De grote cijfers in de cijferbalk
  // (€ 3,50, € 0 …) staan niet in het register: bedragen komen uit lib/pricing/tiers.ts.
  { key: "trust.items", group: "Homepage — vertrouwensbalk", label: "Punten (één per regel)", default: "KVK Handelsregister\nGeverifieerde identiteit (KYC)\nSEPA-uitbetaling\nWet DBA-monitor", multiline: true },
  {
    key: "marquee.items",
    group: "Homepage — vertrouwensbalk",
    label: "Lopende band (één per regel)",
    default:
      "Sneller uitbetalen als optie\nSoftware voor horeca en rijscholen\nEen eigen website op je domein\nMeer Google-reviews\nGebouwd voor flexibel werk in Nederland\nModelovereenkomst inbegrepen\nWet DBA-risicosignalering\nReverse billing\nGeen tussenpartijen\nWekelijkse verloning",
    multiline: true,
  },
  { key: "how.s1.title", group: "Homepage — hoe het werkt", label: "Stap 1: titel", default: "Meld je aan en verifieer" },
  { key: "how.s1.body", group: "Homepage — hoe het werkt", label: "Stap 1: tekst", default: "Werknemers koppelen hun KVK en doorlopen een korte identiteitscheck. Bedrijven registreren hun organisatie en vestigingen.", multiline: true },
  { key: "how.s2.title", group: "Homepage — hoe het werkt", label: "Stap 2: titel", default: "Word slim gematcht" },
  { key: "how.s2.body", group: "Homepage — hoe het werkt", label: "Stap 2: tekst", default: "Bij een nieuwe dienst rangschikt ZekerFlex kandidaten op reistijd, betrouwbaarheid en vakmatch. De beste match wordt direct toegewezen.", multiline: true },
  { key: "how.s3.title", group: "Homepage — hoe het werkt", label: "Stap 3: titel", default: "Werk en word betaald" },
  { key: "how.s3.body", group: "Homepage — hoe het werkt", label: "Stap 3: tekst", default: "Check in op locatie en werk je dienst. Zodra de uren zijn goedgekeurd kies je zelf hoe snel je uitbetaald wilt worden — gratis wachten of sneller tegen een fee.", multiline: true },
  { key: "fl.points", group: "Homepage — blok freelancers", label: "Voordelen (één per regel)", default: "Aanbod afgestemd op je reistijd, skills en beschikbaarheid\nZelf kiezen hoe snel je uitbetaald wordt — geen facturen sturen\nAfspraken vastgelegd, risico's gesignaleerd\nBouw badges op van Brons tot Platina", multiline: true },
  { key: "fl.cta", group: "Homepage — blok freelancers", label: "Knop", default: "Voor freelancers" },
  { key: "emp.points", group: "Homepage — blok bedrijven", label: "Voordelen (één per regel)", default: "Automatische matching en toewijzing per vestiging\nUren goedkeuren met GPS check-in — facturen volgen vanzelf\nWet DBA-risico's zichtbaar vóór ze een probleem worden\nAlleen betalen bij gebruik: € 3,50 platformkosten per gewerkt uur", multiline: true },
  { key: "emp.cta", group: "Homepage — blok bedrijven", label: "Knop", default: "Voor bedrijven" },
  { key: "work.f1.kind", group: "Homepage — drie werkvormen", label: "Kaart 1: titel", default: "Via ons uitzendbureau" },
  { key: "work.f1.who", group: "Homepage — drie werkvormen", label: "Kaart 1: voor wie", default: "Geen KVK nodig. ZekerFlex is je werkgever." },
  { key: "work.f1.points", group: "Homepage — drie werkvormen", label: "Kaart 1: punten (één per regel)", default: "Wekelijkse verloning met loonstrook\nVakantiegeld (8,33%) en vakantie-uren\nPensioen via StiPP vanaf week 9\nABU-fasensysteem: zekerheid die meegroeit", multiline: true },
  { key: "work.f1.cta", group: "Homepage — drie werkvormen", label: "Kaart 1: link", default: "Werken via het uitzendbureau" },
  { key: "work.f2.kind", group: "Homepage — drie werkvormen", label: "Kaart 2: titel", default: "Als flexwerker" },
  { key: "work.f2.who", group: "Homepage — drie werkvormen", label: "Kaart 2: voor wie", default: "Af en toe zelfstandig, soms met de KOR." },
  { key: "work.f2.points", group: "Homepage — drie werkvormen", label: "Kaart 2: punten (één per regel)", default: "Btw optioneel of kleineondernemersregeling\nSelf-invoice of reverse billing\nJe eigen tarief en ritme\nLichte fiscale administratie", multiline: true },
  { key: "work.f2.cta", group: "Homepage — drie werkvormen", label: "Kaart 2: link", default: "Meer over flexwerk" },
  { key: "work.f3.kind", group: "Homepage — drie werkvormen", label: "Kaart 3: titel", default: "Als zzp'er" },
  { key: "work.f3.who", group: "Homepage — drie werkvormen", label: "Kaart 3: voor wie", default: "Eigen bedrijf met KVK en btw-nummer." },
  { key: "work.f3.points", group: "Homepage — drie werkvormen", label: "Kaart 3: punten (één per regel)", default: "Reverse billing — geen facturen sturen\nZelf je uitbetaalsnelheid kiezen\nModelovereenkomst per opdrachtgever\nWet DBA-monitor bewaakt je risico", multiline: true },
  { key: "work.f3.cta", group: "Homepage — drie werkvormen", label: "Kaart 3: link", default: "Meer voor zzp'ers" },
  { key: "cijfers.1", group: "Homepage — cijfers", label: "Onder cijfer 1 (€ 3,50)", default: "standaard platformkosten per gewerkt uur, lager bij volume" },
  { key: "cijfers.2", group: "Homepage — cijfers", label: "Onder cijfer 2 (€ 0)", default: "abonnement en opstartkosten" },
  { key: "cijfers.3", group: "Homepage — cijfers", label: "Onder cijfer 3 (GPS)", default: "check-in en urengoedkeuring op locatie" },
  { key: "cijfers.4", group: "Homepage — cijfers", label: "Onder cijfer 4 (Na uren)", default: "automatische factuur na goedkeuring" },
  { key: "feat.f1.title", group: "Homepage — het platform", label: "Kaart 1: titel", default: "Slimme matching" },
  { key: "feat.f1.body", group: "Homepage — het platform", label: "Kaart 1: tekst", default: "Gewogen score op reistijd, reviews, vakmatch en badge-niveau — niet wie het eerst klikt.", multiline: true },
  { key: "feat.f2.title", group: "Homepage — het platform", label: "Kaart 2: titel", default: "Uitbetaling naar keuze" },
  { key: "feat.f2.body", group: "Homepage — het platform", label: "Kaart 2: tekst", default: "Gratis wachten op de reguliere termijn, of sneller uitbetaald worden tegen een fee — jij kiest per dienst.", multiline: true },
  { key: "feat.f3.title", group: "Homepage — het platform", label: "Kaart 3: titel", default: "Wet DBA-monitor" },
  { key: "feat.f3.body", group: "Homepage — het platform", label: "Kaart 3: tekst", default: "Urenconcentratie, opeenvolgende weken en omzetafhankelijkheid worden live bewaakt.", multiline: true },
  { key: "feat.f4.title", group: "Homepage — het platform", label: "Kaart 4: titel", default: "Automatische facturatie" },
  { key: "feat.f4.body", group: "Homepage — het platform", label: "Kaart 4: tekst", default: "Reverse billing: de dienst- en platformfactuur worden voor je aangemaakt, btw-correct.", multiline: true },
  { key: "feat.f5.title", group: "Homepage — het platform", label: "Kaart 5: titel", default: "GPS check-in" },
  { key: "feat.f5.body", group: "Homepage — het platform", label: "Kaart 5: tekst", default: "Check-ins worden gegeofenced tegen de vestiging. Afwijkingen openen automatisch een dispuut.", multiline: true },
  { key: "feat.f6.title", group: "Homepage — het platform", label: "Kaart 6: titel", default: "Meldingen die kloppen" },
  { key: "feat.f6.body", group: "Homepage — het platform", label: "Kaart 6: tekst", default: "Je krijgt alleen een push als het relevant is — en nooit tijdens je rust-uren.", multiline: true },
  { key: "comp.c1.title", group: "Homepage — compliance", label: "Kaart 1: titel", default: "Opdrachtsovereenkomst" },
  { key: "comp.c1.body", group: "Homepage — compliance", label: "Kaart 1: tekst", default: "ZekerFlex zet afspraken per relatie klaar. De feitelijke werkwijze blijft bepalend voor de beoordeling van de arbeidsrelatie.", multiline: true },
  { key: "comp.c2.title", group: "Homepage — compliance", label: "Kaart 2: titel", default: "KVK-validatie" },
  { key: "comp.c2.body", group: "Homepage — compliance", label: "Kaart 2: tekst", default: "Inschrijving en btw-nummer worden bij aanmelding gecontroleerd tegen het Handelsregister.", multiline: true },
  { key: "comp.c3.title", group: "Homepage — compliance", label: "Kaart 3: titel", default: "Identiteitsverificatie" },
  { key: "comp.c3.body", group: "Homepage — compliance", label: "Kaart 3: tekst", default: "Een geverifieerde identiteit (KYC) is verplicht voordat je een dienst kunt aannemen.", multiline: true },
  { key: "comp.c4.title", group: "Homepage — compliance", label: "Kaart 4: titel", default: "Auditspoor" },
  { key: "comp.c4.body", group: "Homepage — compliance", label: "Kaart 4: tekst", default: "Elke gevoelige handeling wordt onwisbaar vastgelegd en is terug te zien voor beheerders.", multiline: true },
];

/** De punten van een lijsttekst (één per regel; lege regels tellen niet). */
export const lijstRegels = (waarde: string) =>
  waarde
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);

/** Alle sleutels van één groep-voorvoegsel (bv. "vb." voor /voor-bedrijven), voor getContentMap op die pagina. */
export const contentKeys = (prefix: string) => CONTENT_REGISTRY.filter((c) => c.key.startsWith(prefix)).map((c) => c.key);

const KEY = "content:overrides";
type Overrides = Record<string, string>;

function publicValue(key: string, value: string | undefined): string {
  const fallback = defaultFor(key);
  if (!value) return fallback;

  // Older CMS overrides can outlive a copy correction in the registry. Avoid
  // continuing to publish the specific hosting and DBA guarantees we removed.
  if (
    (key === "hero.eyebrow" && /lokaal gehost|100%.*nederland/i.test(value)) ||
    (key === "hero.lead" && /wet dba.?proof|goedgekeurde modelovereenkomst|volledig in nederland gehost/i.test(value))
  ) {
    return fallback;
  }

  return value;
}

export async function getContentOverrides(): Promise<Overrides> {
  return (await kvGet<Overrides>(KEY).catch(() => null)) ?? {};
}

const defaultFor = (key: string) => CONTENT_REGISTRY.find((c) => c.key === key)?.default ?? "";

/** Alle geregistreerde teksten met de huidige waarde (override of standaard). */
export async function getContentValues(): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const c of CONTENT_REGISTRY) out[c.key] = publicValue(c.key, o[c.key]);
  return out;
}

/** Alleen de gevraagde sleutels (voor een pagina). */
export async function getContentMap(keys: string[]): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = publicValue(k, o[k]);
  return out;
}

export async function setContent(key: string, value: string): Promise<void> {
  if (!CONTENT_REGISTRY.some((c) => c.key === key)) return;
  const o = await getContentOverrides();
  const trimmed = value.trim();
  if (!trimmed || trimmed === defaultFor(key)) delete o[key];
  else o[key] = trimmed.slice(0, 2000);
  await kvSet(KEY, o);
}
