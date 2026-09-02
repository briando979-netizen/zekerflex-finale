# Database, Prisma & migraties

## Verbinding

`DATABASE_URL=postgresql://zekerflex:zekerflex@localhost:5432/zekerflex?schema=public`
(lokale Docker: `postgres:16-alpine`, container `zekerflex-postgres`).

## Migratie-workflow (non-interactief)

De sandbox heeft geen interactieve prompt, dus de betrouwbare route is:

```bash
DB="postgresql://zekerflex:zekerflex@localhost:5432/zekerflex?schema=public"
MIG="prisma/migrations/$(date +%Y%m%d%H%M%S)_<naam>"
mkdir -p "$MIG"
npx prisma migrate diff --from-url "$DB" \
    --to-schema-datamodel prisma/schema.prisma --script > "$MIG/migration.sql"
npx prisma migrate deploy
npx prisma generate
```

`npm run prisma:migrate` = `prisma migrate dev` (voor interactief werk).
`npm run prisma:deploy` = `prisma migrate deploy` (idempotent, voor launch/deploy).

### Windows EPERM bij `prisma generate`

`query_engine-windows.dll.node` kan vast zitten als een node-proces (devserver)
de DLL vasthoudt. Kill eerst:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*zekerflex*' } | Stop-Process -Force
```

## Non-destructieve seed

`prisma/seed.ts#main()` checkt of er een `PLATFORM`-tenant bestaat:

- bestaat + geen `SEED_RESET=true` / `--reset` → print "overgeslagen", **raakt niets aan**.
- lege database → plaatst demo-data.
- `npm run db:seed:reset` (= `prisma db seed -- --reset`) → `reset()` wist in
  FK-veilige volgorde en vult opnieuw.

`reset()` bevat elke tabel; bij een nieuw model **moet** je de bijbehorende
`deleteMany()` toevoegen op de juiste plek (kinderen vóór ouders).

## Geen pgvector

De alpine-image heeft de `vector`-extensie niet. RAG-embeddings staan in een
`Float[]`-kolom (`RagChunk.embedding`), similarity in JS. `CREATE EXTENSION
vector` is niet nodig en de startup-check verwacht die ook niet.

## Startup-check

`lib/config/startup.ts#runStartupChecks()` (via `app/admin/layout.tsx`, één keer
per proces) rapporteert o.a. **pending migraties** door `_prisma_migrations` te
vergelijken met `prisma/migrations/`. Het **past ze niet toe** — dat is een
bewuste deploy-stap (`npm run prisma:deploy`). `GET /api/admin/system` toont het
volledige rapport.

## Belangrijke modellen (selectie)

`Tenant`, `User`, `Membership`, `Branch`, `FreelancerProfile`, `Shift`,
`ShiftMatch`, `ShiftAssignment`, `Timesheet`, `GpsEvent`, `Dispute`, `Invoice`
(+ `InvoiceLine`, `InvoiceSequence`), `Payment`, `ModelAgreement`, `Counter`,
`DbaComplianceRecord`, `IdentityVerification`, `CompanyRegistration`,
`AuditLog`, `EngagementEvent`, `SalesLead`/`SalesOutreach`,
`OrchestrationRun`/`OrchestrationFinding`, `VoiceAnnouncement`, `RagChunk`,
`AiUsageLog`, `Upload`, `JarvisTurn`/`JarvisEvent`, `AnalyticsEvent`,
`WebPushSubscription`, `PushToken`, `DeviceFingerprint`.

Geld overal in `Int` centen. `Json`-velden met een default.
