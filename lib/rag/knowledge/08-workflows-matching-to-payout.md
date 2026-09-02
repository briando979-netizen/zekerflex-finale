# Kernworkflow: matching → aanbod → uren → uitbetaling

## 1. Matching

`lib/matching-engine.ts#runMatchingForShift(shiftId)` (Redis-lock
`match:shift:{id}`):

- Laadt shift + vestiging + bestaande assignments. Matchbare statussen:
  `OPEN`, `MATCHING`, `PARTIALLY_FILLED`.
- `loadCandidatePool` — KYC `VERIFIED`, `vatValid`, `kvkValid`, niet
  geblacklist, niet `matchingBlockedUntil`, geen overlappende assignment, geen
  bestaande match, heeft de vereiste skill.
- `lib/matching/score.ts#scoreCandidateSignals` (puur): gewogen
  reliability/travel/skill + badge-bonus (BRONZE 0 → PLATINUM 0.05). Reistijd
  via exp-decay. Gewichten uit `branch.matchingConfig` of env.
- Persisteert `ShiftMatch`-rijen (`SCORED`). Auto-assign wie de
  `autoAcceptance`-gate haalt.
- Resterende plekken → `lib/notifications/dispatcher.ts#enqueueShiftMatching`.

## 2. Getrapte aanbiedingen

`dispatcher.ts` — Redis-queue per shift, golf 1 direct. Per kandidaat:
`ShiftMatch → NOTIFIED` met `expiresAt`. Push via `sendShiftOffer` **tenzij** de
freelancer in zijn stille uren zit (`lib/notifications/timing.ts#mayPingNow` —
geleerde actieve uren > handmatig venster); dan blijft het aanbod in-app zichtbaar,
alleen de ping wacht.

`processMatchingFollowups()` (daemon: `matching/tick` 60s) laat verlopen
aanbiedingen vervallen en promoot de volgende golf tot de shift vol is of de
queue leeg. `recordOfferResponse(shiftId, freelancerId, ACCEPTED|DECLINED)` — een
accept maakt seat-gecontroleerd een `ShiftAssignment` + draft `Timesheet` en
trekt sibling-aanbiedingen in. Ook wordt `ensureModelAgreement` aangeroepen.

## 3. Modelovereenkomst

`lib/agreements/model-agreement.ts#ensureModelAgreement(tx, ...)` — bij accept
of auto-assign wordt per freelancer↔opdrachtgever een ongetekende
`ModelAgreement` (type `VRIJE_VERVANGING`) aangemaakt, hergebruikt over
opdrachten heen. `POST /api/model-agreements/:id/sign` verzamelt de twee
handtekeningen → `ACTIVE`.

## 4. GPS check-in

`POST /api/timesheets/[id]/gps` → `lib/timesheets/checkin.ts#recordGpsEvent`
(alleen de eigenaar, alleen op een `DRAFT`). `CHECK_IN` zet `actualStart`,
`CHECK_OUT` zet `actualEnd` + `billableMinutes`. Elk event wordt gegeofenced
tegen de vestiging op het moment van opname. Een off-site of mock-locatie
CHECK_IN/OUT **opent automatisch een systeem-dispuut** (`Dispute.origin` =
`GEOFENCE_VIOLATION` / `MOCK_LOCATION`, `raisedById` null).

## 5. Goedkeuring + reverse billing

`POST /api/timesheets/approve` → `lib/timesheets/approve.ts`:

- Lock, `assertBranchAccess`, status `SUBMITTED`/`DISPUTED`, GPS-check
  (override = audited), geldige `payoutIban`, PLATFORM-tenant aanwezig.
- Transactie: 2 factuurnummers, `buildReverseBillingInvoices` → **twee btw-
  facturen** (`SELF_BILL_FREELANCER` + `PLATFORM_FEE`), NL 21% of intra-EU
  reverse-charge. Timesheet → `APPROVED`, gekoppeld dispuut opgelost, `Payment`
  `PENDING` met `endToEndId`.
- Daarna, buiten de transactie: `triggerInstantPayout` (SEPA Instant). Bij succes
  → factuur `PAID` + timesheet `PAID`. Bij falen → `Payment FAILED`, HTTP 202
  (goedgekeurd, betaling in retry). Best-effort `evaluateDbaCompliance`.
