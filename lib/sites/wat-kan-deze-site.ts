import { zichtbareProducten, winkelVan } from "@/lib/sites/winkel";
import { reserveerBlokVan } from "@/lib/sites/reserveren";
import type { Block, Page, SiteDoc } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// "Bekijk wat deze site kan" (4 nov 2026): op een ontwerpvoorstel of een
// voorbeeldsite staat in de balk bovenaan een link naar …/wat-kan-deze-site, zoals
// de rondleiding van schwarzwald.zekerflex.com. Daar staat wat bezoekers op déze
// site kunnen (alleen wat er echt op staat, met een link om het te proberen) en wat
// het bedrijf zelf krijgt in het beheer. Puur: de opmaak staat in render.ts.
// ---------------------------------------------------------------------------

export interface Functie {
  titel: string;
  tekst: string;
  /** waar je het kunt proberen: een pagina van de site ("contact#contact", "winkel") of "_zf/chat" */
  link?: string | undefined;
}

type Site = Pick<SiteDoc, "pages" | "bedrijf" | "winkel">;

/** De eerste pagina met een blok van deze soort (en het blok). */
function paginaMet<T extends Block["type"]>(pages: Page[], type: T): { page: Page; block: Extract<Block, { type: T }> } | null {
  for (const page of pages) {
    const block = page.blocks.find((b): b is Extract<Block, { type: T }> => b.type === type);
    if (block) return { page, block };
  }
  return null;
}

const naar = (p: Page, anker = "") => `${p.slug || "home"}${anker}`;

/** Wat bezoekers op deze site kunnen; alleen wat er echt op staat. */
export function functiesVoorBezoekers(site: Site, opties: { chat?: boolean | undefined } = {}): Functie[] {
  const uit: Functie[] = [];
  const c = site.bedrijf;
  const contact = paginaMet(site.pages, "contact");
  if (contact?.block.props.formulier) {
    uit.push({ titel: "Een bericht of aanvraag sturen", tekst: "Via het formulier stuurt een bezoeker een vraag of aanvraag. Die komt meteen bij jou binnen, met naam, e-mail en telefoon.", link: naar(contact.page, "#contact") });
  }
  if (c.whatsapp) uit.push({ titel: "WhatsApp met één tik", tekst: "Een groene knop rechtsonder opent meteen een WhatsApp-gesprek met jou." });
  if (c.telefoon) uit.push({ titel: "Bellen met één tik", tekst: `Op de telefoon belt een tik op "Bel" meteen ${c.telefoon}. Het nummer staat ook in de opening en onderaan elke pagina.` });
  if (opties.chat) {
    uit.push({ titel: "Chatten met een assistent", tekst: "Een assistent beantwoordt vragen met de gegevens van deze site, ook 's avonds. Een medewerker kan het gesprek overnemen, en een bezoeker kan meteen een afspraak aanvragen.", link: "_zf/chat" });
  }
  const reserveren = reserveerBlokVan(site.pages);
  if (reserveren) {
    uit.push({ titel: "Online een tafel reserveren", tekst: `Een gast kiest een dag en met hoeveel hij komt, en ziet meteen welke tijden nog vrij zijn. Is het vol, dan stelt de site de eerstvolgende dagen met plek voor. De gast krijgt direct een bevestiging per mail.`, link: "reserveren" });
  }
  const winkel = winkelVan(site);
  if (zichtbareProducten(winkel).length) {
    uit.push({ titel: "Een echte webshop", tekst: "Zoeken, filteren op categorie, prijs en voorraad, en sorteren. Producten met foto en prijs, maten en kleuren, een winkelmand die blijft staan, en bestellen om af te halen of te laten bezorgen.", link: "winkel" });
  }
  const burger = paginaMet(site.pages, "burger3d");
  if (burger) uit.push({ titel: "Een burger in 3D die je ziet ontstaan", tekst: "Terwijl je scrolt, zweven de lagen uit elkaar en vallen ze samen tot één burger, met stoom en vonken van de grill. Gemaakt zonder video of scripts, dus razendsnel, en stil voor wie minder beweging wil.", link: naar(burger.page) });
  const diensten = paginaMet(site.pages, "diensten");
  if (diensten) uit.push({ titel: "Het aanbod in één oogopslag", tekst: "Alles wat je doet, met een foto en een korte uitleg. Eén tik op de pijl en de bezoeker vraagt ernaar.", link: naar(diensten.page) });
  const uren = paginaMet(site.pages, "openingstijden");
  if (uren?.block.props.regels.length) uit.push({ titel: "Altijd de juiste openingstijden", tekst: "Per dag, ook onderaan elke pagina. Pas je ze aan, dan staan ze overal goed.", link: naar(uren.page) });
  const reviews = paginaMet(site.pages, "reviews");
  if (reviews?.block.props.items.length) uit.push({ titel: "Ervaringen van klanten", tekst: "Wat klanten over je zeggen, op een opvallende plek.", link: naar(reviews.page) });
  const faq = paginaMet(site.pages, "faq");
  if (faq?.block.props.items.length) uit.push({ titel: "Antwoord op veelgestelde vragen", tekst: "De vragen die je vaak krijgt, met het antwoord erbij. Dat scheelt telefoontjes.", link: naar(faq.page) });
  const vacatures = paginaMet(site.pages, "vacatures");
  if (vacatures) uit.push({ titel: "Vacatures die vanzelf kloppen", tekst: "Je open diensten op ZekerFlex staan vanzelf op je site; een werker reageert met één klik.", link: naar(vacatures.page) });
  const galerij = paginaMet(site.pages, "galerij");
  if (galerij?.block.props.fotos.length) uit.push({ titel: "Een indruk in foto's", tekst: "Je eigen foto's groot in beeld, op elk scherm scherp.", link: naar(galerij.page) });
  uit.push(
    { titel: "Snel, ook op de telefoon", tekst: "Geen trage scripts of zware plug-ins: de site staat er in een oogwenk, ook met een zwak netwerk." },
    { titel: "Gemaakt om gevonden te worden", tekst: "Nette paginatitels en omschrijvingen, een sitemap en je gegevens voor Google. Een ontwerpvoorstel staat zelf bewust nog niet in Google." },
    { titel: "Voor iedereen te gebruiken", tekst: "Gebouwd volgens de richtlijnen voor toegankelijkheid (WCAG 2.1 AA): goed leesbaar, met het toetsenbord te bedienen en duidelijk voor schermlezers." },
    { titel: "Geen cookiemelding nodig", tekst: "Geen volgcookies en geen bezoekerssystemen van anderen. Foto's en lettertypes komen van de site zelf." },
  );
  return uit;
}

/** Wat het bedrijf zelf krijgt achter de login (functies van ZekerFlex die er nu zijn). */
export function functiesVoorJou(site: Site): Functie[] {
  const winkel = zichtbareProducten(winkelVan(site)).length > 0;
  const reserveren = reserveerBlokVan(site.pages)
    ? [{ titel: "Je reserveringsboek", tekst: "Alle reserveringen per dag, met aangekomen, niet gekomen of geannuleerd. Belt er iemand, dan voer je het zelf in. Tijden, plaatsen en de grootste groep stel je zelf in; dubbel boeken kan niet." }]
    : [];
  return [
    ...reserveren,
    { titel: "Zelf aanpassen", tekst: "Teksten, foto's, kleuren en blokken pas je zelf aan in de Websitestudio. Je ziet het eerst als voorbeeld, en zet het live wanneer jij wilt." },
    { titel: "Geen bericht meer missen", tekst: "Aanvragen via het formulier komen binnen bij Berichten en in je mail. Chatgesprekken volg je live, en een gesprek neem je met één klik over." },
    { titel: "Zien hoeveel bezoekers je hebt", tekst: "Het aantal bezoekers per dag, zonder cookies en zonder iemand te volgen." },
    { titel: "Je eigen domeinnaam", tekst: "Koppel je eigen adres, of vraag een nieuwe domeinnaam aan via ZekerFlex. Het beveiligde slotje regelen wij." },
    winkel
      ? { titel: "Je webshop beheren", tekst: "Producten, maten en kleuren, voorraad die vanzelf afneemt, alle bestellingen met hun status, en een klantenlijst die zich vanzelf vult: wie bestelde, hoe vaak en voor hoeveel." }
      : { titel: "Een webshop, als je wilt", tekst: "Verkoop je producten? Zet er een webshop bij, met maten, kleuren en voorraad. Geen webshop nodig, dan blijft hij gewoon uit." },
    { titel: "Google-reviews verzamelen", tekst: "Vraag klanten na een klus of bezoek met één klik om een review op Google." },
    { titel: "Personeel via ZekerFlex", tekst: "Extra handen nodig? Plaats een dienst op ZekerFlex; hij staat vanzelf als vacature op je site." },
  ];
}
