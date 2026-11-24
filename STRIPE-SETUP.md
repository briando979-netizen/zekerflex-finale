# ⚡ Stripe Setup Checklist voor ZekerFlex

**Account:** `acct_1UYTYhEYzK3SEPab`  
**Status:** Paspoort geverifieerd ✅

---

## 1️⃣ IDENTITY - ID Verificatie via Stripe

**URL:** https://dashboard.stripe.com/identity

### Stap 1: Get Started klikken
- [ ] Ga naar Identity pagina
- [ ] Klik op "Get started" of "Start now"
- [ ] Volg de setup wizard

### Wat dit doet:
- Freelancers zien "Snel via Stripe" bij ID-controle
- Paspoort, ID-kaart, rijbewijs foto
- Kost ±€1,50 per verificatie
- Resultaat in 1 minuut meestal

---

## 2️⃣ WEBHOOKS - Stripe Events

**URL:** https://dashboard.stripe.com/developers/webhooks

### Stap 2: Check Webhook Endpoint
- [ ] Kijk of `https://zekerflex.com/api/webhooks/stripe` erin staat
- [ ] Zo nee: Klik "Add endpoint" en voeg toe

### Stap 3: Events inschakelen
Voor de endpoint, selecteer deze events:
- [ ] `checkout.session.expired` (voor niet-afgeronde aankopen)
- [ ] `charge.*` (alle charge events)
- [ ] `customer.subscription.*` (voor abos)
- [ ] `identity.verification_session.*` (ID verificatie)
- [ ] `charge.dispute.*` (geschillen)

### Webhook Secret
- [ ] Haal het signing secret (whsec_...) op
- [ ] Geef aan Claude → zet in STRIPE_WEBHOOK_SECRET

---

## 3️⃣ CONNECT - Platform Profile

**URL:** https://dashboard.stripe.com/connect/accounts/overview

### Stap 4: Platform Profile invullen
- [ ] Klik "Get started" bij platform profile
- [ ] Vul in:
  - **Bedrijfstype:** Platform/marketplace
  - **Account type:** Express
  - **Ondernemer type:** Freelancers/zzp'ers
  - **Betaling:**
    - Hoe klanten betalen: "Destination charges"
    - Geld gaat direct naar ondernemer
    - ZekerFlex houdt fee in
  - **Regio:** Nederland
  - **Controllers:** Jouw naam + gegevens

---

## 4️⃣ TAX - Btw Instellingen

**URL:** https://dashboard.stripe.com/settings/billing/tax

### Stap 5: Tax Registration toevoegen
- [ ] Klik "Add tax registration"
- [ ] Land: **Nederland**
- [ ] Type: **Standard VAT**
- [ ] Btw-nummer: `NL[jouw-btw-nr]B01`
  (bijv. `NLB01234567890B01`)

### Stap 6: Tax Calculation aanzetten
- [ ] Zet "Tax Calculation" aan
- [ ] Dit berekent automatisch btw op betalingen

---

## 5️⃣ AGENTIC COMMERCE (Optioneel, maar cool)

**URL:** https://dashboard.stripe.com/agentic-commerce

### Stap 7: AI Assistenten instellen
- [ ] Klik "Get started" bij Agentic commerce
- [ ] Vul bedrijfsprofiel in:
  - Voorwaarden: https://zekerflex.com/voorwaarden
  - Privacy: https://zekerflex.com/privacy
  - Retourbeleid: 30 dagen
- [ ] ChatGPT, Copilot etc. kunnen dan producten verkopen

---

## 6️⃣ FACTUREN - E-Invoicing (Peppol/UBL)

**Volgende stap:**
- [ ] KVK-nummer: Geef aan Claude
- [ ] Btw-nummer: Geef aan Claude
- [ ] Adres: Zet in STRIPE_IDENTITY of env

---

## ✅ Wat daarna automatisch werkt:

1. **ID-verificatie** - Freelancers via Stripe
2. **Webhooks** - ZekerFlex ontvangt Stripe events
3. **Betalingen** - Naar freelancer IBAN
4. **Facturen** - Automatisch gegenereerd
5. **Btw** - Automatisch berekend
6. **Connect** - Ondernemer accounts mogelijk

---

## 🚀 Je bent klaar als:

- [ ] Identity activated ✓
- [ ] Webhook endpoint werkt ✓
- [ ] Platform profile compleet ✓
- [ ] Tax registration ingesteld ✓
- [ ] Zeg Claude: "Stripe is klaar"

**→ Claude markt alles af in je TODO-lijst**
