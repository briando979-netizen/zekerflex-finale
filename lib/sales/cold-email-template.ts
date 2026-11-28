/**
 * Cold Email Templates for B2B Outreach
 * Dutch-language, honest, proof-based email sequences
 * Ready to personalize with {companyName, industry, location}
 */

export interface ColdEmailTemplate {
  subject: string;
  body: string;
}

export interface EmailVariables {
  companyName: string;
  industry?: string;
  location?: string;
  contactName?: string;
}

/**
 * Email 1: Initial outreach with proof
 * Hook: "15 flexwerkers in 24h" - specific, proof-based
 */
export function coldEmailStep1(vars: EmailVariables): ColdEmailTemplate {
  const name = vars.contactName ? `Beste ${vars.contactName.split(" ")[0]},` : `Beste team van ${vars.companyName},`;
  const sector = vars.industry ? ` in de ${vars.industry.toLowerCase()}` : "";
  const area = vars.location ? ` in ${vars.location}` : "";

  return {
    subject: `15 flexwerkers in 24h voor ${vars.companyName}?`,
    body: `${name}

Veel bedrijven${sector}${area} worstelen met pieken en uitval.
Wij niet — ZekerFlex heeft 500+ geverifieerde flexwerkers.

Hoe we het doen:
• Een klus plaatsen = 24h match
• Echt gescreend (ID-check, werkrecht)
• Geen BS, alleen echte werkers

Kan ik je 15 minuten bellen over hoe dit voor ${vars.companyName} werkt?

Met vriendelijke groet,
Team ZekerFlex
zekerflex.com`,
  };
}

/**
 * Email 2: Follow-up with specific use case
 * Hook: "No BS" proof + guarantee
 */
export function coldEmailStep2(vars: EmailVariables): ColdEmailTemplate {
  const name = vars.contactName ? `Hallo ${vars.contactName.split(" ")[0]},` : `Hallo,`;

  return {
    subject: `Follow-up: Geen BS flexwerk`,
    body: `${name}

Geen antwoord op mijn vorige mail — geen probleem.
Veel teams zijn sceptisch, en terecht.

Dit hebben we bewezen:
• 500+ werkersprofielen, allemaal geverifieerd
• 24h match (echte match, niet willekeurig)
• Fee € 3,50/uur (niks meer, niks minder)
• Geen verborgen kosten

Of je nou een eenmalige klus hebt of structureel flexwerk nodig —
het werkt hetzelfde.

Zin om het uit te proberen? Ik zet een gratis test-klus klaar.

Groet,
Team ZekerFlex
zekerflex.com`,
  };
}

/**
 * Email 3: Final touchpoint - redirect to website
 * Hook: Self-service option + clear next step
 */
export function coldEmailStep3(vars: EmailVariables): ColdEmailTemplate {
  return {
    subject: `Laatste vraag: Klus plaatsen en klaar`,
    body: `${vars.companyName},

Ik stop met mailen na deze. 😊

Mocht je later toch zin hebben in flexwerk —
je kan zelf op zekerflex.com/klus-plaatsen je eerste klus schrijven.

Geen account nodig, geen ophef.
Wij matchen 24h.

Sterkte!
Team ZekerFlex`,
  };
}

/**
 * Alternative: Short version for time-pressed managers
 */
export function coldEmailTldr(vars: EmailVariables): ColdEmailTemplate {
  return {
    subject: `Flexwerk 24h voor ${vars.companyName}`,
    body: `${vars.companyName},

Klus plaatsen → 24h match → Klaar.

500+ geverifieerde flexwerkers.
€ 3,50/uur (platform).

Jij: https://zekerflex.com/klus-plaatsen
Wij: 24h match.

Groet,
ZekerFlex`,
  };
}

/**
 * Utility: Render a full email sequence
 */
export function emailSequence(
  vars: EmailVariables,
): Array<ColdEmailTemplate> {
  return [coldEmailStep1(vars), coldEmailStep2(vars), coldEmailStep3(vars)];
}

/**
 * Notes for recruiters:
 *
 * Step 1: Hook with proof ("15 flexwerkers in 24h")
 *   → Sent to prospects with working email
 *   → Wait 3-5 days
 *
 * Step 2: Follow-up if no reply
 *   → "No BS" proof (workers, fee, speed)
 *   → Redirect to 15min call or test klus
 *   → Wait 2-3 days
 *
 * Step 3: Final email
 *   → Self-service option
 *   → Lower friction (no call, no signup)
 *   → Stop sequence after this
 *
 * Best practices:
 * - Personalize {companyName} at minimum
 * - Use industry if known (vacature_signal from discovery)
 * - Use location if known (bedrijfslocatie)
 * - Send from real account (team@, info@, not noreply@)
 * - Reply-To: same sender (not bounce address)
 * - No images, no tracking pixels
 * - Test: open rate + reply rate (not sends)
 */
