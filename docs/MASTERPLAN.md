# ZekerFlex masterplan (11 nov 2026)

Voor de eigenaar en voor elke sessie die aan het platform bouwt. Alles in gewoon Nederlands.
Wat onder "Stand" staat komt uit de code; de rest is een voorstel, tenzij de eigenaar het bevestigde.

## De stelling

Eén merk. Eén account en één bedrijfsprofiel. Daaronder vijf producten met elk een eigen dashboard,
en uitbreidingen die je erbij kiest (zoals de apps bij Shopify). Iedereen begint bij één voordeur,
kiest wat hij wil en komt in een dashboard dat daarvoor is ingericht.

## De drie lagen

1. **Merk en account:** ZekerFlex. Eén inlog, één bedrijf (naam, KvK, adres, team), één factuur, één scherm
   Abonnement en uitbreidingen. Bedrijfsgegevens vul je één keer in (gedeeld).
2. **Producten, elk een eigen dashboard** (`lib/werkgever/werkruimte.ts`): Personeel, Website, Webshop, Horeca,
   Rijschool. Werkers zijn de andere kant van het merk (hun app blijft apart). Administratie is geen zesde
   product maar zit in elk dashboard op dezelfde plek.
3. **Uitbreidingen, per product aan te zetten:** netwerk (wifi, VPN, 5G), op locatie (portofoon, kenteken, kluis,
   badges), domein en e-mail, telefonie, hardware (kassa, printers, schermen), Google-reviews, sociale media en
   advertenties, uitzend (ABU/StiPP), e-facturen, partners en verkopers (`lib/marketing/aanbod.ts`).

## De weg van een nieuwe klant (voor elk product gelijk)

1. Voordeur: voor werkers is dat de homepage (sinds 11 nov is zekerflex.com voor werkzoekenden en staat de bedrijvenpagina op /bedrijven). Voor bedrijven één plek "Wat wil je doen?" bovenaan /bedrijven met vijf tegels met foto (personeel, website, webshop, horeca, rijschool).
2. Account: e-mail en wachtwoord (Google en Apple alleen voor werkers).
3. Bedrijf en product: KvK invullen, de rest wordt voorgesteld; daarna 2 tot 3 vragen alleen voor dit product.
4. Meteen iets moois: een voorbeeld staat klaar (site, winkel met proefproducten, menukaart, lesagenda).
5. Aan de slag: het dashboard opent met een korte checklist met voortgang; elke stap is één klik.

Extra vragen per product: personeel (branche, vestiging, testklus), website (soort bedrijf, naam, stijl, pagina's),
webshop (wat verkoop je, betalen, verzending, btw), horeca (soort zaak, tafels, menukaart, modules),
rijschool (rijbewijzen, instructeurs, lestijden, tegoedkaarten).

## Elk dashboard hetzelfde skelet

Wisselaar bovenaan; "Aan de slag" (verdwijnt als alles klaar is); vier cijfers; "Nu aan de beurt" met één knop per
regel; zijbalk: Start, eigen onderdelen, Klanten of bestellingen, Marketing, Facturen, Instellingen. Onder Instellingen
altijd Bedrijf (gedeeld), Team, Abonnement en uitbreidingen. Een product heeft een eigen accentkleur, maar alleen voor
zijn icoon in de wisselaar; de kleuren voor probleem, geld en "wacht op jou" blijven overal hetzelfde.

## Stand (uit de code, 11 nov)

| Onderdeel | Stand |
|---|---|
| Vijf dashboards met wisselaar, gedeelde bedrijfsgegevens | staat (sinds 10 nov) |
| Aanmelden per product (`/register?type=bedrijf&dashboard=<soort>`) | staat |
| Aanbod en productpagina's (30 onderdelen in vier groepen) | staat |
| Homepage gesplitst: / voor werkzoekenden, /bedrijven voor bedrijven | staat (11 nov) |
| Voordeur voor bedrijven "Wat wil je doen?" | ontbreekt |
| "Aan de slag"-checklist per product (`lib/onboarding/voortgang.ts`) | deels |
| Eén vast dashboardskelet | deels |
| Eén scherm Abonnement en uitbreidingen | ontbreekt |
| Voorbeeld klaar bij aanmelden | deels |
| Prijzen per product (horeca en netwerk wel; website, webshop, rijschool niet) | deels |
| Oude site-bouwer (`/werkgever/website/bouwer`) naast de studio | dubbel |
| Pagina Abonnementen noemde de bank | hersteld in dezelfde bundel als dit bestand |

## Eén prijslogica

1. Beginnen: gratis. Bij personeel alleen € 3,50 per gewerkt uur (staffel in `lib/pricing/tiers.ts`).
2. Basis per product, per maand. Horeca heeft dit al (Basis € 19). Voorstel: website, webshop en rijschool ook één Basis.
3. Uitbreidingen per module of als bundel (horeca: modules vanaf € 19, Alles-in-één € 69 per maand; wifi € 49 per vestiging;
   VPN € 4 per gebruiker). De bedragen voor website, webshop en rijschool bepaalt de eigenaar.

## Volgorde

- **Fase 0 (nu, klein):** de bank uit Abonnementen; één site-bouwer (de studio, de oude verwijst door); de compacte homepage afmaken.
- **Fase 1:** de bedrijvenvoordeur (bovenaan /bedrijven); één checklist "Aan de slag" voor elk product; één indeling voor elk dashboard.
- **Fase 2:** één scherm Abonnement en uitbreidingen; prijzen per product vastleggen en tonen.
- **Fase 3:** voorbeeldgegevens per product bij aanmelden; een korte reeks mails (dag 0, 2, 7).
- **Fase 4:** per product een openbare pagina met demo, foto's en prijs; sociale media en advertenties per product; partners en eigen merk.

## Afspraken voor het bouwen

- Een nieuw dashboardonderdeel: sleutel in `werkruimte.ts` plus adres, label en icoon in `app/werkgever/layout.tsx`.
- Nooit verbergen wat iemand al gebruikt (klussen houden alle personeelsonderdelen in het menu).
- Nieuwe tekst gewoon Nederlands; nooit iets beloven over de gestopte ZekerFlex Bank.
- Eén ding per keer uitrollen via de poortwachter; kleine stukken, geen schema's zonder droge proef.
