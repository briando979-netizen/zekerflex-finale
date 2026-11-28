/**
 * LinkedIn Outreach Templates
 * Dutch, short, specific DM templates for HR/Hiring managers
 * Ready to personalize and send
 */

export interface LinkedInTemplate {
  /** Profile connection request message (optional) */
  connectionMessage?: string;
  /** DM 1: Initial message after they accept connection */
  dmStep1: string;
  /** DM 2: Follow-up after 3-5 days (if no reply) */
  dmStep2?: string;
}

export interface LinkedInVariables {
  personName: string;
  companyName: string;
  jobTitle?: string;
  industry?: string;
}

/**
 * LinkedIn DM 1: Initial pitch (short, specific, link)
 */
export function linkedInDmStep1(vars: LinkedInVariables): string {
  const job = vars.jobTitle ? ` (${vars.jobTitle})` : "";

  return `Hoi ${vars.personName},

Zag dat je ${job} bent.

Veel bedrijven worstelen met flexwerk-pieken. Wij matchen 500+ geverifieerde flexwerkers in 24h.

Zin om het uit te proberen?
zekerflex.com/for-companies-v2

Groet,
Team ZekerFlex`;
}

/**
 * LinkedIn DM 2: Follow-up without being annoying
 */
export function linkedInDmStep2(vars: LinkedInVariables): string {
  return `${vars.personName},

Vorige bericht bleef hangen. Geen probleem!

Korte recap:
• 500+ flexwerkers
• 24h match
• € 3,50/uur (volle prijs)

Interesse? zekerflex.com/for-companies-v2

Sterkte!
ZekerFlex`;
}

/**
 * Alternative: Longer version with more detail
 */
export function linkedInDmDetailed(vars: LinkedInVariables): string {
  return `Hoi ${vars.personName},

Jij bent aan zet om flexwerk op te lossen voor ${vars.companyName}.

Hier is hoe wij het doen:
1. Klus schrijven (5 min)
2. 24h match (echte match, niet willekeurig)
3. Klaar (geen gedoe)

500+ geverifieerde flexwerkers
€ 3,50/uur (niks meer)

Interesse? Laten zien hoe het werkt:
zekerflex.com/for-companies-v2

Groet,
Team ZekerFlex`;
}

/**
 * Alternative: Super short for time-pressed managers
 */
export function linkedInDmUltraShort(vars: LinkedInVariables): string {
  return `Hoi ${vars.personName},

Flexwerk. 24h. 500+ werkers.

zekerflex.com/for-companies-v2`;
}

/**
 * Connection request message (shown when they receive the friend request)
 * Optional—only send if you have room for a personalized note
 */
export function linkedInConnectionMessage(vars: LinkedInVariables): string {
  return `Hoi ${vars.personName},

Zag dat je met flexwerk werkt. Zou graag contacten uitwisselen!

Team ZekerFlex`;
}

/**
 * LinkedIn targeting tips
 * Find these on LinkedIn:
 * - HR/Hiring Managers (search: "HR Manager" + company)
 * - Ops/Facility managers (search: "Facility Manager" + "Logistics")
 * - Finance/CFO (search: "CFO" + "Controller" + company)
 *
 * Best results:
 * - Companies 20-500 employees (sweet spot: 50-200)
 * - Industries: logistics, hospitality, retail, construction, manufacturing
 * - 2nd degree first (mutual connections = higher reply)
 * - Search: "hiring" + "flexible" + your region
 */

export interface LinkedInCampaignConfig {
  /** Batch size per day */
  batchPerDay: number;
  /** Days between follow-up DM */
  followUpDays: number;
  /** Stop after how many steps */
  maxSteps: number;
}

export const linkedInDefaults: LinkedInCampaignConfig = {
  batchPerDay: 5, // Avoid spam limit (LinkedIn: 500/week = ~70/day safe)
  followUpDays: 4,
  maxSteps: 2, // Initial + 1 follow-up
};

/**
 * Utility: Render full sequence
 */
export function linkedInSequence(vars: LinkedInVariables): LinkedInTemplate {
  return {
    connectionMessage: linkedInConnectionMessage(vars),
    dmStep1: linkedInDmStep1(vars),
    dmStep2: linkedInDmStep2(vars),
  };
}

/**
 * Notes for outreach:
 *
 * Best practices:
 * - Wait 2-3 days after connection is accepted before DM
 * - Personalize at least: {personName}, {companyName}, {jobTitle}
 * - Use DM, not comment on their posts (too public)
 * - No images, no PDFs in first message
 * - Link always to: zekerflex.com/for-companies-v2 (tracks campaign)
 * - Stop after 2 DMs (spam limit)
 *
 * Metrics to track:
 * - Connection acceptance rate (target: 30-40%)
 * - DM open rate (LinkedIn shows this)
 * - Reply rate (target: 5-10%)
 * - Click-through to landing page (UTM: utm_source=linkedin)
 *
 * Avoid:
 * - Overly salesy tone
 * - Multiple links in one message
 * - Hashtags in DM (looks desperate)
 * - Copy-paste without names
 */
