# Boekhouding: schemavoorstel (alleen ontwerp, nog geen migratie)

Voor de poortwachter. Onderdeel: AI-boekhouder in Beheer → Boekhouding, strikt `PLATFORM_ADMIN`, voor Zekerflex, Inc. (Delaware), later meer entiteiten.
Dit document verandert niets aan `prisma/schema.prisma`. De modellen hieronder zijn met `npx prisma validate` gecontroleerd op een tijdelijke kopie van het schema (uitslag onderaan).

Alles wat fiscaal of boekhoudkundig inhoud heeft en niet door mij is na te gaan, staat gemarkeerd als **door accountant te bevestigen**.

## 1. Wat er nu is (waar we op aansluiten)

- `Invoice` (type `PLATFORM_FEE`, `SELF_BILL_FREELANCER`, `CANCELLATION_PENALTY`, `UITZEND_FEE`, `DOMEIN`): bedragen al in centen (`subtotalCents`, `vatCents`, `totalCents`), `vatTreatment`, `vatRate` (Float, alleen lezen), `status`, `issuedAt`, `paidAt`, `currency`. Nummering gapvrij via `InvoiceSequence` (`lib/billing/numbering.ts`, bv. `ZF-PF-2026-000012`).
- Er is **geen** `Organization`-model; de partijen zijn `Tenant` (issuer/recipient) en `FreelancerProfile`. De uitgever van een PLATFORM_FEE is de platform-tenant (`issuerTenantId`), maar de e-factuur (`lib/efactuur/factuur.ts`) haalt de verkoper uit de omgeving (`platformPartij`).
- `Invoice` wordt bij het verwijderen van een urenstaat mee verwijderd (`timesheet ... onDelete: Cascade`). Een boeking mag nooit meeverdwijnen: **de boekhouding krijgt daarom geen foreign keys naar `Invoice`, `Tenant` of `User`**, in dezelfde geest als `AuditLog` (bewust zonder relatie, hashketen). De koppeling is `bron` + `bronId` (tekst).
- Stijl van het schema: `String @id @default(cuid())`, geen `@@map` (tabelnaam = modelnaam), enums in HOOFDLETTERS, bedragen `Int` in centen, `createdAt DateTime @default(now())`, `@@index`/`@@unique` onderaan. Het nieuwe voorstel volgt dat; alle modelnamen beginnen met `Boek` zodat ze nergens botsen (gecontroleerd: geen bestaand model of enum begint zo).

## 2. Keuzes in het kort

| Onderwerp | Keuze | Alternatief | Waarom |
|---|---|---|---|
| Bedragen | `Int` centen, per regel debet en credit apart | `BigInt`; `Decimal` | Past bij de rest van het schema. Int houdt ±21 miljoen per regel; sommen in SQL zijn `bigint`. Risico staat in par. 7. Nooit Float/Decimal. |
| Debet/credit | twee kolommen, precies één > 0 | één kolom met teken | Dichter bij het boekhouden, makkelijker XAF/kolommenbalans, en een CHECK is eenvoudig. |
| Valuta | alle regels in de functionele valuta van de administratie; vreemde valuta alleen informatief (`origineleValuta`, `origineelCents`, `koersMicro`) | per regel eigen valuta in de sluitsom | Een boeking sluit dan altijd in één eenheid. Een Delaware-Inc kan USD als functionele valuta hebben: **door accountant te bevestigen**. |
| Koppeling met facturen | `bron` + `bronId`, uniek per administratie | FK naar `Invoice` | Zie boven (Cascade). |
| Onveranderlijk | trigger weigert UPDATE/DELETE; correctie = tegenboeking met `keertBoekingId @unique` | status `VOORLOPIG/DEFINITIEF` | Een voorlopige boeking bestaat niet: een voorstel leeft in `BoekBon`/`BoekBankTransactie` tot een mens of de regels het boeken. |
| Debiteuren | open post via `postSleutel` (`factuur:<invoiceId>`) op debiteur- en betaalregel; saldo per sleutel = nog open | aparte `BoekDebiteur`-tabel | Geen tweede waarheid; een betaling "sluit" de factuur door dezelfde sleutel. |
| Rekeningschema | RGS-code per administratie als eigen rij (kopie), met `parentId` | één globale RGS-tabel | Een entiteit kan rekeningen verbergen of toevoegen zonder de andere te raken. |
| Btw-tarief | basispunten (2100) per `BoekBtwCode`, met geldigheidsperiode | Float zoals `Invoice.vatRate` | Geen afronding in een Float; tariefwijziging krijgt een nieuwe code. |
| Zekerheid model | `zekerheidPromille` 0 tot 1000 | Float | Zelfde reden. |

## 3. De modellen

```prisma
// ===========================================================================
// Boekhouding (Beheer -> Boekhouding, strikt PLATFORM_ADMIN) - dubbel boekhouden per administratie.
// Alle bedragen in centen (Int), nooit Float/Decimal. Boekingen zijn onveranderlijk: corrigeren = tegenboeking.
// Bewust GEEN relaties naar Invoice/Tenant/User (zoals AuditLog): Invoice verdwijnt bij het verwijderen van
// een urenstaat (onDelete: Cascade) en een boeking mag nooit meeverdwijnen. De koppeling loopt via bron + bronId.
// ===========================================================================

enum BoekRekeningSoort {
  ACTIVA // balans, normaal debet
  PASSIVA // balans (schulden, eigen vermogen), normaal credit
  OMZET // winst en verlies, normaal credit
  KOSTEN // winst en verlies, normaal debet
}

enum BoekDagboek {
  VERKOOP
  INKOOP
  BANK
  MEMORIAAL
}

enum BoekBron {
  FACTUUR // verkoopfactuur uit het platform (bronId = Invoice.id)
  FACTUUR_BETALING // betaling die de debiteur sluit (bronId = Invoice.id)
  BON // inkoopbon (bronId = BoekBon.id)
  BANK // banktransactie (bronId = BoekBankTransactie.id)
  MEMORIAAL // handmatig, met reden
  OPENING // openingsbalans
  TEGENBOEKING // correctie (bronId = "terug:<boekingId>")
}

enum BoekBtwRichting {
  VERKOOP
  INKOOP
}

enum BoekPeriodeStatus {
  OPEN
  VERGRENDELD
}

enum BoekBonStatus {
  NIEUW // geupload, nog niet gelezen
  GELEZEN // OCR + model klaar, voorstel ligt er
  EVEN_KIJKEN // twijfel: een mens moet kijken
  GEBOEKT
  AFGEWEZEN // geen bon / dubbel / niet voor deze administratie
}

enum BoekAangifteStatus {
  BEREKEND
  GOEDGEKEURD // door een mens; legt de maanden van het kwartaal vast
  INGEDIEND // door een mens elders ingediend; wij dienen nooit zelf in
  VERVANGEN // een nieuwere versie bestaat
}

enum BoekBankFormaat {
  CAMT053
  MT940
  CSV
}

enum BoekBankTransactieStatus {
  NIEUW
  GEKOPPELD
  TWIJFEL
  GENEGEERD
}

// Eén juridische entiteit met eigen boeken (nu Zekerflex, Inc.; later meer).
model BoekAdministratie {
  id            String   @id @default(cuid())
  naam          String // korte naam in het scherm
  juridischeNaam String
  land          String // ISO-landcode van de vestiging, bv. "US"
  valuta        String   @default("EUR") // functionele valuta: alle regelbedragen zijn hierin
  rgsVersie     String   @default("3.7") // door accountant te bevestigen
  btwPlichtig   Boolean  @default(false) // door accountant te bevestigen voor Inc.
  btwNummer     String?
  // Platform-tenant waarvan de uitgegeven facturen in deze administratie horen (geen relatie, zie kop).
  platformTenantId String? @unique
  boekjaarStartMaand Int  @default(1)
  actief        Boolean  @default(true)

  rekeningen   BoekRekening[]
  btwCodes     BoekBtwCode[]
  boekingen    BoekBoeking[]
  perioden     BoekPeriode[]
  volgnummers  BoekVolgnummer[]
  bonnen       BoekBon[]
  btwPerioden  BoekBtwPeriode[]
  bankRekeningen BoekBankRekening[]

  createdAt DateTime @default(now())
}

// Grootboekrekening, gevuld uit het referentiegrootboekschema (RGS) per administratie.
model BoekRekening {
  id             String            @id @default(cuid())
  administratieId String
  rgsCode        String // bv. "WOmzNet" (voorbeeld; echte codes door accountant te bevestigen)
  nummer         String? // eigen rekeningnummer, optioneel
  naam           String
  soort          BoekRekeningSoort
  parentId       String?
  boekbaar       Boolean           @default(true) // alleen bladen krijgen regels; kopjes niet
  actief         Boolean           @default(true)

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  parent        BoekRekening?     @relation("BoekRekeningBoom", fields: [parentId], references: [id], onDelete: Restrict)
  kinderen      BoekRekening[]    @relation("BoekRekeningBoom")
  regels        BoekRegel[]
  bankRekeningen BoekBankRekening[]

  createdAt DateTime @default(now())

  @@unique([administratieId, rgsCode])
  @@index([administratieId, soort])
  @@index([parentId])
}

// Btw-code: tarief + in welke rubriek van de aangifte het hoort. Tarieven in basispunten (2100 = 21%), geen Float.
model BoekBtwCode {
  id              String          @id @default(cuid())
  administratieId String
  code            String // bv. "NL21-V"
  omschrijving    String
  richting        BoekBtwRichting
  tariefBasispunten Int
  // Rubrieken van de NL-aangifte, bv. "1a", "4a", "5b"; door accountant te bevestigen. Null = buiten de aangifte.
  grondslagRubriek String?
  btwRubriek       String?
  geldigVanaf     DateTime        @db.Date
  geldigTot       DateTime?       @db.Date
  actief          Boolean         @default(true)

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  regels        BoekRegel[]
  bonnen        BoekBon[]

  @@unique([administratieId, code])
}

// Boekingsperiode (maand) met vergrendeling: in een vergrendelde maand komt geen nieuwe boeking.
model BoekPeriode {
  id              String            @id @default(cuid())
  administratieId String
  jaar            Int
  maand           Int // 1-12
  status          BoekPeriodeStatus @default(OPEN)
  vergrendeldOp   DateTime?
  vergrendeldDoor String? // userId zonder relatie, of "systeem"

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)

  @@unique([administratieId, jaar, maand])
}

// Gapvrij boekstuknummer per (administratie, dagboek, jaar), zoals InvoiceSequence.
model BoekVolgnummer {
  id              String      @id @default(cuid())
  administratieId String
  dagboek         BoekDagboek
  jaar            Int
  lastValue       Int         @default(0)

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)

  @@unique([administratieId, dagboek, jaar])
}

// Onveranderlijk: geen UPDATE of DELETE (afgedwongen met triggers in de migratie).
model BoekBoeking {
  id              String      @id @default(cuid())
  administratieId String
  dagboek         BoekDagboek
  boekstuk        String // bv. "VK-2026-000012"; uniek per administratie
  datum           DateTime    @db.Date // boekdag (Amsterdamse dag van de gebeurtenis)
  omschrijving    String
  bron            BoekBron
  bronId          String // nooit leeg: idempotentiesleutel samen met bron
  // Hash van de brongegevens bij het boeken: verandert de bron later, dan zie je dat en boek je tegen.
  bronHash        String?
  // Tegenboeking: wijst naar de boeking die hij opheft. Eén boeking kan maar één keer worden opgeheven.
  keertBoekingId  String?     @unique
  reden           String? // verplicht bij MEMORIAAL en TEGENBOEKING (afgedwongen in de applicatie)
  aangemaaktDoor  String // userId zonder relatie, of "systeem"

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  keert         BoekBoeking?      @relation("BoekTegen", fields: [keertBoekingId], references: [id], onDelete: Restrict)
  tegenboeking  BoekBoeking?      @relation("BoekTegen")
  regels        BoekRegel[]
  bon           BoekBon?
  bankTransacties BoekBankTransactie[]

  createdAt DateTime @default(now())

  @@unique([administratieId, bron, bronId])
  @@unique([administratieId, boekstuk])
  @@index([administratieId, datum])
  @@index([bron, bronId])
}

// Regel van een boeking. Debet en credit in centen van de administratievaluta; precies een van beide is > 0.
model BoekRegel {
  id          String  @id @default(cuid())
  boekingId   String
  volgorde    Int
  rekeningId  String
  debetCents  Int     @default(0)
  creditCents Int     @default(0)
  omschrijving String?

  // Btw: op een omzet-/kostenregel de grondslag (btwBasisCents, positief); op de btw-regel zelf isBtwRegel = true.
  btwCodeId     String?
  btwBasisCents Int?
  isBtwRegel    Boolean @default(false)

  // Open post: dezelfde sleutel op de debiteurregel (factuur) en de betaalregel; saldo per sleutel = nog open.
  postSleutel String? // bv. "factuur:<invoiceId>"

  // Vreemde valuta (alleen informatief; de sluitregel werkt op de centen hierboven). Koers in miljoenste.
  origineleValuta String?
  origineelCents  Int?
  koersMicro      Int?

  boeking  BoekBoeking  @relation(fields: [boekingId], references: [id], onDelete: Restrict)
  rekening BoekRekening @relation(fields: [rekeningId], references: [id], onDelete: Restrict)
  btwCode  BoekBtwCode? @relation(fields: [btwCodeId], references: [id], onDelete: Restrict)

  @@unique([boekingId, volgorde])
  @@index([rekeningId, boekingId])
  @@index([postSleutel])
  @@index([btwCodeId])
}

// Inkoopbon: bestand op het opslagvolume (storage/boekhouding/...), nooit in public/. 7 jaar bewaren.
model BoekBon {
  id              String        @id @default(cuid())
  administratieId String
  status          BoekBonStatus @default(NIEUW)

  bestandPad    String // relatief aan storage/
  bestandSha256 String // dubbele upload herkennen
  mimeType      String
  bytes         Int
  geuploadDoor  String // userId zonder relatie
  bewaarTot     DateTime @db.Date // niet verwijderen voor deze datum; termijn door accountant te bevestigen

  ocrTekst     String?  @db.Text // kan persoonsgegevens bevatten: valt onder het wissen na de bewaartermijn
  ocrTekstHash String?
  // Uitgelezen velden (voorstel van het model; een mens kan ze aanpassen).
  leverancier       String?
  leverancierNummer String? // het factuurnummer op de bon
  bonDatum          DateTime? @db.Date
  totaalCents       Int?
  btwCents          Int?
  valuta            String?
  btwCodeId         String?
  voorstelRekeningId String?
  // 0-1000 in plaats van Float; onder de drempel (instelbaar) -> EVEN_KIJKEN.
  zekerheidPromille Int?
  modelNaam         String?
  evenKijkenReden   String?
  afwijsReden       String?

  boekingId String? @unique

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  btwCode       BoekBtwCode?      @relation(fields: [btwCodeId], references: [id], onDelete: Restrict)
  boeking       BoekBoeking?      @relation(fields: [boekingId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([administratieId, bestandSha256])
  @@index([administratieId, status])
  @@index([administratieId, leverancier, leverancierNummer])
}

// Btw-aangifte per kwartaal. Wij berekenen en leggen vast; een mens dient in.
model BoekBtwPeriode {
  id              String   @id @default(cuid())
  administratieId String
  jaar            Int
  kwartaal        Int // 1-4
  vanaf           DateTime @db.Date
  totEnMet        DateTime @db.Date
  deadline        DateTime @db.Date // laatste dag voor indienen (eigenaar-todo)

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  aangiftes     BoekBtwAangifte[]

  @@unique([administratieId, jaar, kwartaal])
}

// Onveranderlijke momentopname van de rubrieken; een herberekening is een nieuwe versie.
model BoekBtwAangifte {
  id        String             @id @default(cuid())
  periodeId String
  versie    Int
  status    BoekAangifteStatus @default(BEREKEND)
  // { "1a": { "grondslagCents": 0, "btwCents": 0 }, ... } - alleen centen, gehele getallen.
  rubrieken Json
  totaalTeBetalenCents Int // saldo van de aangifte; negatief = terug te vragen
  snapshotHash String
  berekendOp   DateTime  @default(now())
  goedgekeurdOp DateTime?
  goedgekeurdDoor String? // userId zonder relatie
  ingediendOp  DateTime?
  indieningReferentie String? // bevestiging van de belastingdienst, door de mens ingevuld

  periode BoekBtwPeriode @relation(fields: [periodeId], references: [id], onDelete: Restrict)

  @@unique([periodeId, versie])
}

// ---- Fase 2: bank ----------------------------------------------------------

model BoekBankRekening {
  id              String  @id @default(cuid())
  administratieId String
  iban            String
  naam            String
  valuta          String  @default("EUR")
  rekeningId      String // de grootboekrekening (bank) waar deze bankrekening op boekt
  actief          Boolean @default(true)

  administratie BoekAdministratie @relation(fields: [administratieId], references: [id], onDelete: Restrict)
  rekening      BoekRekening      @relation(fields: [rekeningId], references: [id], onDelete: Restrict)
  afschriften   BoekBankAfschrift[]
  transacties   BoekBankTransactie[]

  @@unique([administratieId, iban])
}

model BoekBankAfschrift {
  id               String          @id @default(cuid())
  bankRekeningId   String
  formaat          BoekBankFormaat
  bestandPad       String
  bestandSha256    String
  afschriftNummer  String?
  vanaf            DateTime?       @db.Date
  totEnMet         DateTime?       @db.Date
  beginSaldoCents  Int?
  eindSaldoCents   Int?
  geuploadDoor     String

  bankRekening BoekBankRekening @relation(fields: [bankRekeningId], references: [id], onDelete: Restrict)
  transacties  BoekBankTransactie[]

  createdAt DateTime @default(now())

  @@unique([bankRekeningId, bestandSha256])
}

model BoekBankTransactie {
  id             String                   @id @default(cuid())
  bankRekeningId String
  afschriftId    String?
  status         BoekBankTransactieStatus @default(NIEUW)

  boekdatum    DateTime @db.Date
  valutadatum  DateTime? @db.Date
  bedragCents  Int // met teken: positief = bij, negatief = af
  valuta       String
  tegenIban    String?
  tegenNaam    String?
  omschrijving String?
  endToEndId   String?
  // De eigen bankreferentie, anders een hash van datum+bedrag+tegenrekening+omschrijving+volgnummer in het bestand:
  // dezelfde transactie uit twee afschriften wordt nooit twee keer ingelezen.
  dedupeSleutel String

  // Voorstel en uitkomst van het koppelen (aan factuur, bon of Stripe-uitbetaling).
  voorstel          Json?
  matchScorePromille Int?
  boekingId         String?

  bankRekening BoekBankRekening   @relation(fields: [bankRekeningId], references: [id], onDelete: Restrict)
  afschrift    BoekBankAfschrift? @relation(fields: [afschriftId], references: [id], onDelete: Restrict)
  boeking      BoekBoeking?       @relation(fields: [boekingId], references: [id], onDelete: Restrict)

  createdAt DateTime @default(now())

  @@unique([bankRekeningId, dedupeSleutel])
  @@index([bankRekeningId, status])
  @@index([boekdatum])
  @@index([boekingId])
}
```

### Uitleg per model (kort)

- **BoekAdministratie**: één entiteit. `platformTenantId` (uniek, geen relatie) wijst de platform-tenant aan waarvan uitgegeven facturen hier boeken. `btwPlichtig`, `valuta`, `rgsVersie`: door accountant te bevestigen voor Zekerflex, Inc. (een Amerikaanse entiteit is niet vanzelf btw-plichtig in NL).
- **BoekRekening**: RGS-rekening per administratie. De RGS-codes in het voorbeeld en de versie (`3.7`) zijn niet door mij geverifieerd: **door accountant te bevestigen**; het inlezen van het officiële RGS-bestand is een aparte stap.
- **BoekBtwCode / BoekBtwPeriode / BoekBtwAangifte**: de rubrieken (1a, 1b, 1e, 2a, 3b, 4a, 4b, 5b) staan als tekst op de code, niet in de database vastgelegd als regels; welke code in welke rubriek valt (en of er voor Inc. überhaupt een NL-aangifte is) is **door accountant te bevestigen**. De aangifte-snapshot is een nieuwe rij per herberekening (`versie`); `GOEDGEKEURD` vergrendelt de drie maanden. Er is bewust **geen** status "automatisch ingediend": een mens dient in en vult de bevestiging in.
- **BoekPeriode**: maandvergrendeling. **BoekVolgnummer**: gapvrij boekstuknummer, zoals `InvoiceSequence`, binnen dezelfde transactie als de boeking verhoogd.
- **BoekBoeking + BoekRegel**: de kern, zie par. 4.
- **BoekBon**: bestand in `storage/boekhouding/<administratie>/<jaar>/…` (volume `app-storage`, nooit `public/`); `bestandSha256` voorkomt een dubbele upload; `bewaarTot` is de ondergrens voor wissen. Termijn (NL fiscaal 7 jaar; voor een Amerikaanse entiteit kan het anders zijn): **door accountant te bevestigen**. `ocrTekst` kan persoonsgegevens bevatten en valt na de termijn onder wissen (AVG); hij is alleen nodig voor het scherm "even kijken".
- **BoekBank\***: alleen fase 2. Dedupe op `dedupeSleutel`, zodat overlappende afschriften nooit dubbel inlezen. `tegenIban`/`tegenNaam`/`omschrijving` zijn persoonsgegevens van derden: niet loggen, niet in het auditspoor.

## 4. Boeken: idempotentie, sluiten op nul, onveranderlijk

### Idempotentie (nooit dubbel boeken)
- `BoekBoeking @@unique([administratieId, bron, bronId])`, `bronId` is `NOT NULL` (een NULL zou in Postgres meerdere gelijke rijen toestaan).
- Verkoopfactuur: `bron = FACTUUR`, `bronId = Invoice.id`. Betaling: `bron = FACTUUR_BETALING`, `bronId = Invoice.id`. Bon: `BON` + `BoekBon.id`. Bank: `BANK` + transactie-id. Tegenboeking: `TEGENBOEKING` + `terug:<boekingId>`.
- De boekfunctie doet `INSERT … ON CONFLICT (administratieId, bron, bronId) DO NOTHING` en leest bij een conflict de bestaande boeking terug: twee keer draaien (cron, herstart, dubbele Stripe-melding) geeft dezelfde boeking.
- `bronHash` (hash van bedragen/regels van de bron op het moment van boeken): is een factuur later `CANCELLED` of gewijzigd, dan ziet een controle dat `bronHash` niet meer klopt en maakt de boekhouder een tegenboeking; de oude boeking blijft.

### Elke boeking sluit op 0
Drie lagen:
1. **Applicatie** (hoofdbewaker): één functie `boek()` in een pure kern (`lib/boekhouding/…`, zonder prisma) bouwt de regels en weigert wat niet sluit; vergelijkt som debet met som credit in gehele centen; test voor elke weigering. Schrijft in één transactie: volgnummer verhogen, boeking, regels.
2. **Database, CHECK per regel**: `debetCents >= 0 AND creditCents >= 0 AND (debetCents = 0) <> (creditCents = 0)` (precies één kant, geen nulregel).
3. **Database, uitgestelde constraint trigger** op `BoekRegel` (`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED`, `AFTER INSERT`): bij `COMMIT` controleert hij per aangeraakte `boekingId` dat `SUM(debetCents) = SUM(creditCents)` en dat er minstens twee regels zijn. Uitgesteld omdat regels één voor één binnenkomen. Dit vangt ook een script of handmatige SQL. Veilig, omdat het alleen een bestaande transactie afkeurt en geen data aanraakt.

### Onveranderlijk
- Trigger `BEFORE UPDATE OR DELETE` op `BoekBoeking` en `BoekRegel` die altijd een fout geeft (ook `TRUNCATE` via een statement-trigger). Alleen `BoekBon`, `BoekBankTransactie`, `BoekBtwAangifte` (status/ingediend-velden) en `BoekPeriode` zijn wijzigbaar. Uitzondering: geen. Een fout bij het boeken wordt door een nieuwe boeking verholpen, niet door ingrijpen.
- Corrigeren: tegenboeking = zelfde regels met debet en credit omgewisseld, `keertBoekingId = <oorspronkelijke>`; eenmalig door de `@unique`. Daarna eventueel de juiste boeking opnieuw.
- Vergrendelde maand: een `BEFORE INSERT`-trigger op `BoekBoeking` weigert een `datum` in een `VERGRENDELD`-periode. Een correctie voor een vergrendelde maand boekt op de eerste open dag erna, met `reden` en verwijzing; de aangifte over de vergrendelde periode blijft dan zoals ingediend. (Wanneer mag een vergrendeling terug open? Voorstel: nooit via de app; alleen met een gedocumenteerde ingreep. **Door accountant te bevestigen.**)
- Elke boeking schrijft ook een `AuditLog`-regel (categorie `ADMIN`) met alleen id's en bedragen, geen namen van tegenpartijen.

## 5. Aansluiting op bestaande facturen (fase 1, voor het ontwerp van de boeker)

Alleen de vorm, de rekeningen kiest de accountant:
- `PLATFORM_FEE` (en `UITZEND_FEE`, `DOMEIN`): debet debiteuren `totalCents`, credit omzet `subtotalCents`, credit te betalen btw `vatCents`, met `postSleutel = factuur:<id>`. Boeking bij `ISSUED`; datum = `issuedAt` (Amsterdamse dag, via `lib/time/amsterdam.ts`). `DRAFT` boekt niet; `CANCELLED` na boeking geeft een tegenboeking.
- Betaling (`PAID`/`paidAt`, of via Stripe-webhook): debet bank/Stripe-tegoed, credit debiteuren met dezelfde `postSleutel`; open saldo op die sleutel is dan 0. Dit sluit de debiteur.
- `SELF_BILL_FREELANCER` en `CANCELLATION_PENALTY`: **niet vanzelf omzet van Zekerflex**. Bij self-billing is de zzp'er de verkoper en Zekerflex mogelijk alleen tussenpersoon of doorbetaler; of dit omzet, doorlopende post of doorbelasting is, en de btw-behandeling, is **door accountant te bevestigen** vóór er geboekt wordt. Voorstel: de boeker slaat deze types over (en meldt dat) tot dat besloten is.
- Factuurgegevens in de boeking komen uit de database zelf, niet uit de UBL: `lib/efactuur/factuur.ts` bewaart niets en leidt de XML af uit `Invoice`.
- `Invoice.vatRate` is Float: de boeker rekent niet met dat veld maar met `vatCents` en de behandeling (`vatTreatment`) en kiest daarmee de `BoekBtwCode`.

## 6. De migratie (voor later, niet nu)

Eén map in `prisma/migrations/<tijdstempel>_boekhouding/migration.sql`, **alleen additief**:
- `CREATE TYPE` voor de 9 enums, `CREATE TABLE` voor de 13 tabellen, `CREATE UNIQUE INDEX`/`CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` (alleen tussen nieuwe tabellen, `ON DELETE RESTRICT`).
- Geen `ALTER` op bestaande tabellen, geen back-fill, geen data. Daardoor is terugdraaien eenvoudig: `DROP TABLE` van de nieuwe tabellen en `DROP TYPE`.
- Daarna, met de hand toegevoegd onder de door Prisma gegenereerde SQL (Prisma kent geen CHECK of triggers; ze staan dus alleen in de migratie, niet in `schema.prisma`; een latere `prisma migrate diff` toont ze niet als afwijking):
  1. `ALTER TABLE "BoekRegel" ADD CONSTRAINT "BoekRegel_een_kant" CHECK (…)`; idem `BoekBtwCode.tariefBasispunten BETWEEN 0 AND 10000`, `BoekPeriode.maand BETWEEN 1 AND 12`, `BoekBtwPeriode.kwartaal BETWEEN 1 AND 4`, `BoekBon.zekerheidPromille BETWEEN 0 AND 1000`.
  2. Functie + constraint trigger voor "som debet = som credit" (par. 4).
  3. Functies + triggers voor onveranderlijkheid en periodevergrendeling.
  4. Hulpindex voor open posten: `CREATE INDEX … ON "BoekRegel"("postSleutel") WHERE "postSleutel" IS NOT NULL` (al als gewone index in het schema; een gedeeltelijke is optioneel).
- Het opslagpad voor bonnen is geen databasezaak: map onder `storage/` op het volume `app-storage`, met een aanvulling op de back-ups (de back-up moet `storage/boekhouding` meenemen: te controleren in `deploy/`).

### Droge proef (volgens AGENTS.md)
Op de VPS, in de postgres-container (zonder `-i` zonder heredoc; `init: true` staat aan):
```sql
BEGIN;
\i migration.sql          -- of de SQL erin geplakt via heredoc
-- controles binnen dezelfde transactie:
INSERT INTO "BoekAdministratie"(id,naam,"juridischeNaam",land) VALUES ('t1','t','t','US');
-- 1) een boeking die niet sluit moet bij COMMIT falen (SET CONSTRAINTS ALL IMMEDIATE; geeft de fout meteen)
-- 2) een tweede insert met dezelfde (administratieId, bron, bronId) moet falen
-- 3) UPDATE/DELETE op BoekRegel moet falen
SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'Boek%';  -- verwacht 13
ROLLBACK;
```
Daarna pas `ZF_MIGREER=1`. Controleer voor die uitrol of er op `main` migraties van anderen openstaan (`_prisma_migrations`).

## 7. Risico's en open punten

1. **Int-grens**: 2.147.483.647 centen ≈ 21,4 miljoen per regel. Voor nu ruim; staat een entiteit boven dat, dan is `BigInt` nodig (Prisma geeft dan JS-`bigint`). Voorstel: nu `Int`, de sommen in SQL als `bigint`; kolomtype wijzigen is later een aparte, bewuste migratie.
2. **Triggers buiten Prisma**: een migratie-reset of `db push` zou ze weglaten. Staat in de migratie-SQL en moet in de test voor de migratie terugkomen (een test die een niet-sluitende boeking probeert, tegen een echte Postgres, niet tegen de mock).
3. **Onveranderlijk betekent ook onherstelbaar bij een fout in de boeker**: dus eerst een droogdraaimodus (boek-voorstellen tonen, niet schrijven) en pas na akkoord schrijven.
4. **Geen FK naar `Invoice`**: een verwijderde factuur laat een boeking achter met een `bronId` die nergens heen wijst. Bedoeld; de boeker meldt verweesde bronnen.
5. **Persoonsgegevens**: OCR-tekst, bank-tegenpartijen. Moeten onder wissen/export vallen na de bewaartermijn; geen per-gebruiker KV-sleutels hier, dus geen aanvulling op `ERASABLE_KV_PREFIXES` nodig, maar de bewaartermijn (7 jaar fiscaal tegenover AVG-wissen) is **door accountant te bevestigen**.
6. **Niet gebouwd in dit voorstel**: de import van het officiële RGS-bestand, de XAF 3.2-export, kolommenbalans en W&V (die zijn query's over `BoekRegel` en `BoekRekening.soort`/`parentId`; de modellen bevatten wat XAF vraagt: administratie, rekeningen met balans/W&V-soort, boekingen met dagboek, boekstuk, datum, regels, btw-code), en de RGS-koppeling per rubriek. Welke velden XAF 3.2 exact verplicht, is nog niet tegen de specificatie gelegd: **door accountant/leverancier te bevestigen**.
7. **Meer entiteiten**: elke tabel heeft `administratieId` (direct of via de boeking); alle query's en de toegangslaag filteren daarop, en er is bewust geen globale boekstuknummering.
8. **Toegang**: schermen en API strikt `PLATFORM_ADMIN` (`ADMIN_HUBS`, `tests/admin-access.test.ts`); geen 403 voor alleen-lezen inspectie, maar 423 met eigen `code` (CrowdSec).

## 8. Controle van dit voorstel

- `npx prisma validate` op een kopie van `prisma/schema.prisma` met de modellen eronder (`DATABASE_URL` en `DATABASE_URL_UNPOOLED` dummy gezet): **"The schema is valid"**. Het echte `prisma/schema.prisma` is in deze tak niet gewijzigd.
- Niet gedaan: geen migratie gegenereerd of gedraaid, niets naar een database.
