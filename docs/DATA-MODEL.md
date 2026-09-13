# Data model

`prisma/schema.prisma` — **56 models, 42 enums, one PostgreSQL database**. All
money is integer cents (`Int`), coordinates are `Float` degrees, embeddings are
`Float[]`. Generated view of the relations below; the schema file is the source
of truth.

A full 56-entity ER diagram is unreadable, so it's split by domain. Standalone
tables with no foreign keys (`Counter`, `InvoiceSequence`, `PayrollRunRecord`,
`PayslipRecord`, `PayoutPreference`, `AdvanceRecord`, `SalesSuppression`,
`SalesEngineRun`, `ShopProduct`, `VoiceAnnouncement`, `RagChunk`, `AiUsageLog`,
`KeyValueStore`, `AnalyticsEvent`, `DiditWebhookEvent`, `PasswordResetToken`)
are listed but not drawn.

---

## Domains and their bridges

```mermaid
flowchart TB
    subgraph ID ["Identity & access"]
        Tenant
        User
        FreelancerProfile
        Branch
    end
    subgraph MP ["Marketplace"]
        Shift
        ShiftAssignment
        Timesheet
    end
    subgraph MO ["Money"]
        Invoice
        Payment
        DbaComplianceRecord
    end
    subgraph GR ["Growth"]
        SalesLead
        EngagementEvent
    end
    subgraph PL ["Platform"]
        AuditLog
        Upload
        JarvisTurn
    end

    Branch --> Shift
    FreelancerProfile --> ShiftAssignment
    Shift --> ShiftAssignment --> Timesheet
    Timesheet --> Invoice --> Payment
    Tenant --> Invoice
    FreelancerProfile --> DbaComplianceRecord
    FreelancerProfile --> EngagementEvent
    User --> AuditLog
```

---

## Identity & access

```mermaid
erDiagram
    Tenant ||--o| Tenant : "parent (franchise hierarchy)"
    Tenant ||--o{ Branch : has
    Tenant ||--o{ Membership : grants
    User ||--o{ Membership : holds
    Membership ||--o{ BranchManager : "scoped to"
    Branch ||--o{ BranchManager : managed_by
    Tenant ||--o| CompanyRegistration : "KVK-validated"
    User ||--o| FreelancerProfile : is
    FreelancerProfile ||--o| CompanyRegistration : "KVK-validated"
    FreelancerProfile ||--o{ FreelancerSkill : has
    Skill ||--o{ FreelancerSkill : "held by"
    User ||--o{ DeviceFingerprint : "seen on"
    User ||--o{ IdentityVerification : "KYC attempts"
    FreelancerProfile ||--o{ WebPushSubscription : "push endpoints"
    Upload ||--o| ComplianceDocument : backs
    Upload ||--o| Certificate : backs

    Tenant {
        string id PK
        string name
        enum type "PLATFORM|ENTERPRISE_HQ|FRANCHISE"
        string kvkNumber UK
        string parentId FK
    }
    User {
        string id PK
        string email UK
        string passwordHash "null for SSO"
        enum kycStatus
        datetime emailVerifiedAt
        datetime disabledAt
    }
    Membership {
        string id PK
        string userId FK
        string tenantId FK
        enum role "FREELANCER|LOCAL_MANAGER|HQ_ADMIN|DISPUTE_MANAGER|SALES|PLATFORM_ADMIN"
    }
    Branch {
        string id PK
        string tenantId FK
        float latitude
        float longitude
        json matchingConfig
    }
    FreelancerProfile {
        string id PK
        string userId FK
        enum badgeLevel "BRONZE|SILVER|GOLD|PLATINUM"
        float reliabilityScore
        boolean isBlacklisted
        datetime matchingBlockedUntil "DBA throttle"
    }
```

---

## Marketplace

```mermaid
erDiagram
    Branch ||--o{ Shift : posts
    Skill ||--o{ Shift : "requires (optional)"
    Shift ||--o{ ShiftMatch : "scored against"
    FreelancerProfile ||--o{ ShiftMatch : "candidate for"
    Shift ||--o{ ShiftAssignment : "seats filled by"
    FreelancerProfile ||--o{ ShiftAssignment : works
    ShiftAssignment ||--o| Timesheet : produces
    ShiftAssignment ||--o| ReplacementRequest : "can be swapped"
    FreelancerProfile ||--o{ ReplacementRequest : "original / substitute"
    Timesheet ||--o{ GpsEvent : "check-in/out geofenced"
    Timesheet ||--o| Dispute : "auto-raised off-site/mock"
    Timesheet ||--o{ Invoice : bills
    Branch ||--o{ Timesheet : "approved at"
    User ||--o{ Timesheet : "approved by (LOCAL_MANAGER)"
    ModelAgreement }o--|| FreelancerProfile : party
    ModelAgreement }o--|| Tenant : party
    ModelAgreement }o--o| Shift : covers
    ModelAgreement }o--o| ShiftAssignment : covers

    Shift {
        string id PK
        string branchId FK
        datetime startsAt
        datetime endsAt
        int hourlyRateCents
        int positions
        enum status "DRAFT|OPEN|MATCHING|PARTIALLY_FILLED|FILLED|..."
    }
    ShiftMatch {
        string id PK
        float score "reliability x travel x skill"
        json scoreBreakdown
        int travelMinutes
        enum status "SCORED|NOTIFIED|ACCEPTED|DECLINED|EXPIRED|AUTO_ASSIGNED"
    }
    ShiftAssignment {
        string id PK
        datetime acceptedAt
        enum source "ACCEPTED|AUTO_ASSIGNED"
        datetime cancelledAt
    }
    Timesheet {
        string id PK
        datetime actualStart
        datetime actualEnd
        int breakMinutes
        int billableMinutes
        enum status "DRAFT|SUBMITTED|APPROVED|DISPUTED|..."
    }
    GpsEvent {
        string id PK
        enum type "CHECK_IN|CHECK_OUT"
        float distanceToBranchMeters
        boolean withinGeofence
        boolean mocked "OS mock-location"
    }
    Dispute {
        string id PK
        enum origin "MANAGER_REVIEW|FREELANCER_SUBMISSION|GEOFENCE_VIOLATION|MOCK_LOCATION"
        enum status
        int claimedMinutes
        int proposedMinutes
        int resolvedMinutes
    }
```

---

## Money

```mermaid
erDiagram
    Timesheet ||--o{ Invoice : bills
    Tenant ||--o{ Invoice : "issuer / recipient"
    FreelancerProfile ||--o{ Invoice : "issuer (self-bill)"
    Invoice ||--o{ InvoiceLine : "line items"
    Invoice ||--o| Payment : "collected/paid by"
    FreelancerProfile ||--o{ DbaComplianceRecord : "risk windows"
    Branch ||--o{ DbaComplianceRecord : "per client"

    Invoice {
        string id PK
        string number UK "gap-free per (type,year)"
        enum type "SELF_BILL_FREELANCER|PLATFORM_FEE"
        enum status "DRAFT|ISSUED|PAID|CANCELLED"
        enum vatTreatment "STANDARD_RATE|REVERSE_CHARGE|OUT_OF_SCOPE"
        int subtotalCents
        int vatCents
        int totalCents
        string stripePaymentIntentId UK
    }
    Payment {
        string id PK
        string invoiceId UK
        enum method "SEPA_INSTANT|..."
        enum status "PENDING|SUBMITTED|SETTLED|FAILED"
        int amountCents
        string debtorIban "null until SEPA_CREDITOR_IBAN set"
        datetime settledAt
    }
    InvoiceLine {
        string id PK
        string description
        float quantity "hours"
        int unitPriceCents
        int amountCents
    }
    DbaComplianceRecord {
        string id PK
        int totalMinutes
        int maxConsecutiveWeeks
        float clientRevenueShare
        enum riskLevel "LOW|MEDIUM|HIGH"
    }
```

`InvoiceSequence` (row-locked `(type, year)` counter), `PayrollRunRecord`,
`PayslipRecord`, `PayoutPreference`, `AdvanceRecord` reference their subjects by
string id, no FK — the payroll engine keeps the DB read-only.

---

## Growth

```mermaid
erDiagram
    SalesCampaign ||--o{ SalesLead : produces
    SalesCampaign ||--o{ SalesDiscoverySource : "crawls / imports"
    SalesLead ||--o{ SalesOutreach : "email sequence"
    FreelancerProfile ||--o{ EngagementEvent : "lifecycle"

    SalesLead {
        string id PK
        string companyName
        string contactEmail
        string source "manual|kvkbase|careers|import|field-visit|demo-request"
        enum status "NEW|..."
        int score "0-100 fit"
        int sequenceStep
        datetime nextActionAt
        boolean suppressed
    }
    SalesOutreach {
        string id PK
        string leadId FK
        string subject
        enum status "drafted|approved|sent|replied|bounced"
        boolean editedByHuman
    }
    SalesCampaign {
        string id PK
        int dailyCap
        int minScore
        json stepDelaysDays
    }
    EngagementEvent {
        string id PK
        string freelancerId FK
        enum kind
        datetime occurredAt
    }
```

---

## Platform services

```mermaid
erDiagram
    Tenant ||--o{ ApiKey : owns
    User ||--o{ ApiKey : created
    Tenant ||--o{ WebhookSubscription : configures
    WebhookSubscription ||--o{ WebhookDelivery : attempts
    OrchestrationRun ||--o{ OrchestrationFinding : surfaces
    JarvisTurn ||--o{ JarvisEvent : "streamed steps"
    JarvisTurn ||--o{ Upload : "attached files"
    User ||--o{ AuditLog : "actor"

    ApiKey {
        string id PK
        string prefix UK "zf_live_..."
        string hashedKey "sha256, never the key"
        json scopes
    }
    WebhookSubscription {
        string id PK
        string url
        string[] eventTypes
        string secretCiphertext
    }
    AuditLog {
        bigint seq UK "autoincrement"
        string hash "sha256 chain"
        string prevHash
        enum category
        string action
        string actorUserId FK
    }
    JarvisTurn {
        string id PK
        string prompt
        enum status "RUNNING|DONE|ERROR"
        string answer
    }
    RagChunk {
        string id PK
        enum sourceType
        string sourceRef
        float[] embedding
        int embedDim
    }
    AnalyticsEvent {
        string id PK
        enum type "PAGEVIEW|CLICK|INTERACTION|CUSTOM"
        string path
        string label
        string sessionId "not a cookie"
        json meta
    }
```

---

## Regenerating

There is no ERD generator in the toolchain (sovereign principle: no extra
build deps). To refresh this file after a schema change, re-derive the domain
relation lists from `prisma/schema.prisma` and update the `erDiagram` blocks.
If you want it automated, `prisma-erd-generator` or `prisma-markdown` can be
added as a dev-only generator — both render Mermaid.
