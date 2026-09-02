# Wet DBA & schijnzelfstandigheid — referentie voor ZekerFlex

_Interne kennisbasis, laatst herzien 2026-08. Geen juridisch advies; raadpleeg bij
twijfel een arbeidsrechtjurist of de Belastingdienst._

## Kern van de beoordeling

Of een opdracht een dienstbetrekking (arbeidsovereenkomst) is, hangt af van drie
cumulatieve elementen uit artikel 7:610 BW:

1. **Persoonlijke arbeid** — moet de werkende het werk zelf verrichten?
2. **Loon** — is er een tegenprestatie voor de arbeid?
3. **Gezag (werkgeversgezag)** — kan de opdrachtgever aanwijzingen en instructies
   geven over de inhoud en uitvoering van het werk, en is de werkende ingebed in
   de organisatie?

Ontbreekt één element, dan is er geen dienstbetrekking. In de praktijk draait de
discussie bijna altijd om **gezag** en om **inbedding** (of het werk structureel
onderdeel is van de bedrijfsvoering van de opdrachtgever).

## Deliveroo-arrest (HR 24 maart 2023) — holistische toets

De Hoge Raad noemt gezichtspunten die in onderling verband worden gewogen:

- aard en duur van de werkzaamheden;
- de wijze waarop werkzaamheden en werktijden worden bepaald;
- inbedding van het werk in de organisatie;
- of de werkende zich in de uitvoering laat vervangen;
- de hoogte van de beloning en de wijze waarop die tot stand komt;
- of de werkende commercieel risico loopt;
- of de werkende zich als ondernemer gedraagt (meerdere opdrachtgevers,
  acquisitie, investeringen, inschrijving KVK, btw-ondernemerschap, reputatie).

## Vrije vervanging

Een reële, onbelemmerde mogelijkheid tot vervanging wijst weg van een
dienstbetrekking (persoonlijke arbeid ontbreekt). De vervanging moet
daadwerkelijk mogelijk zijn — niet slechts op papier — en niet afhankelijk van
toestemming die in de praktijk zelden wordt gegeven. ZekerFlex faciliteert
1-click vervanging binnen de pool; dit is een kernonderdeel van het
"vrije vervanging"-model.

## Modelovereenkomsten

De Belastingdienst publiceerde modelovereenkomsten (algemeen, vrije vervanging,
geen werkgeversgezag, tussenkomst, branche). Werken conform een goedgekeurde
modelovereenkomst gaf vrijwaring van loonheffingen — mits er ook feitelijk
conform wordt gewerkt. Nieuwe goedkeuringen worden sinds 2024 niet meer
afgegeven; bestaande goedgekeurde overeenkomsten behouden hun looptijd. De
overeenkomst is een hulpmiddel: de feitelijke uitvoering is doorslaggevend.

ZekerFlex genereert per freelancer↔opdrachtgever-relatie automatisch een
modelovereenkomst-instantie (type standaard `VRIJE_VERVANGING`) op het moment van
engagement; ondertekening gebeurt asynchroon, werk mag eerder starten.

## Handhaving

- Tot en met 2024 gold een handhavingsmoratorium: de Belastingdienst
  corrigeerde alleen bij kwaadwillendheid of het negeren van aanwijzingen.
- **Per 1 januari 2025 is het handhavingsmoratorium opgeheven.** De
  Belastingdienst handhaaft weer volledig op schijnzelfstandigheid; correcties
  (loonheffingen, premies) kunnen worden opgelegd, met een overgangsjaar 2025
  waarin bij aantoonbare inspanning geen vergrijpboete volgt voor de
  herkwalificatie zelf.
- Naheffing kan in beginsel vijf jaar terug; bij opzet/grove schuld gelden
  boetes.

## Risico-indicatoren die ZekerFlex monitort (lib/dba-compliance.ts)

- **Urenconcentratie**: veel uren gedurende lange aaneengesloten periode bij één
  opdrachtgever/vestiging (drempels `DBA_WARN_HOURS_PER_CLIENT`,
  `DBA_MAX_HOURS_PER_CLIENT`).
- **Aaneengesloten weken** bij dezelfde opdrachtgever
  (`DBA_MAX_CONSECUTIVE_WEEKS`).
- **Omzetafhankelijkheid**: aandeel van één opdrachtgever in de
  platform-omzet van de freelancer (`DBA_MAX_CLIENT_REVENUE_SHARE`); alleen
  gewogen boven een minimum aantal uren (`REVENUE_SHARE_MIN_HOURS`).
- Er wordt pas beoordeeld met voldoende historie
  (`MIN_ENGAGEMENTS_TO_ASSESS`, `MIN_HOURS_TO_ASSESS`, `MIN_WEEKS_TO_ASSESS`) —
  een eerste klus trekt nooit een signaal.

Uitkomst: `LOW / MEDIUM / HIGH / CRITICAL` met actie `NONE / WARN / THROTTLE /
BLOCK`. THROTTLE/BLOCK zet `FreelancerProfile.matchingBlockedUntil`.

## Praktische vuistregels voor de matching-engine

- Spreid opdrachten van een freelancer over meerdere opdrachtgevers.
- Bewaak de duur van de relatie met één vestiging.
- Houd de modelovereenkomst en de feitelijke werkwijze in lijn: geen
  roostervast dienstverband-achtig patroon, geen exclusiviteit, vervanging
  daadwerkelijk toestaan.
