import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";

/**
 * Bedrijf-onboarding: automatische e-mails en volgende stappen na aanmelding.
 * Gestart na tenant-aanmelding met type = EMPLOYER.
 *
 * Stap 1 (1h): "Welkom, plaats je eerste klus hier"
 * Stap 2 (3h): "Krijg al matches, 5 werkers klaar"
 */

const WELCOME_EMAIL_DELAY_MS = 60 * 60 * 1000; // 1 uur
const REMINDER_EMAIL_DELAY_MS = 3 * 60 * 60 * 1000; // 3 uur

export interface CompanyActivationInput {
  tenantId: string;
  companyName: string;
  contactEmail: string;
  contactName?: string;
}

/**
 * Trigger na company signup: stuur welkom-mail, zet reminder-timers.
 */
export async function onboardCompanySignup(input: CompanyActivationInput): Promise<void> {
  const { tenantId, companyName, contactEmail, contactName } = input;

  // 1. Zend welkom-mail direct
  await sendWelcomeEmail({
    to: contactEmail,
    companyName,
    contactName,
  });

  // 2. Record een audit entry
  await recordAudit({
    category: "SALES",
    action: "company.signup.welcome-sent",
    summary: `Welkom-mail verzonden naar ${companyName} (${contactEmail})`,
    targetType: "tenant",
    targetId: tenantId,
  }).catch((err) => logger.error("Audit failed in onboardCompanySignup", err));

  // 3. Zet een reminder voor 1 uur later als nog geen klus is geplaatst
  // Dit gebeurt via een background job / cron (hieronder als placeholder)
  scheduleReminderEmail(tenantId, companyName, contactEmail);
}

/**
 * Verstuur welkom-mail naar nieuw bedrijf.
 */
async function sendWelcomeEmail({
  to,
  companyName,
  contactName,
}: {
  to: string;
  companyName: string;
  contactName?: string;
}): Promise<void> {
  const name = contactName ?? companyName;

  const html = `
    <p>Hallo ${name ?? "daar"},</p>

    <p>Welkom bij ZekerFlex! Je account is aangemaakt en je bent klaar om je eerste klus te plaatsen.</p>

    <h2>Volgende stap: plaats je eerste klus</h2>
    <p>Klik op de knop hieronder of ga naar <strong>Klus plaatsen</strong> in je dashboard:</p>
    <ul>
      <li>Voer een functie in (bijv. "Kassieres")</li>
      <li>Selecteer een locatie en datum</li>
      <li>Zet een uurtarief</li>
      <li>Plaats de klus</li>
    </ul>

    <p>Dat is het! Geverifieerde werknemers in jouw buurt zien je klus en kunnen direct reageren.</p>

    <h2>Wat kost het?</h2>
    <p>Je betaalt alleen het uurtarief van de werknemers <strong>plus € 3,50 per gewerkt uur</strong> aan ZekerFlex. Geen abonnement, geen verborgen kosten.</p>

    <p><a href="${env.APP_BASE_URL}/klus-plaatsen" style="display: inline-block; padding: 12px 24px; background-color: #0EA875; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Plaats je eerste klus</a></p>

    <h2>Vragen?</h2>
    <p>Bekijk onze <a href="${env.APP_BASE_URL}/bedrijven">pagina voor bedrijven</a> of neem contact op via <a href="mailto:${env.MAIL_REPLY_TO}">support</a>.</p>

    <p>Veel succes met het vinden van werknemers!</p>
    <p><strong>Het ZekerFlex-team</strong></p>
  `;

  const text = `
Hallo ${name ?? "daar"},

Welkom bij ZekerFlex! Je account is aangemaakt en je bent klaar om je eerste klus te plaatsen.

VOLGENDE STAP: PLAATS JE EERSTE KLUS

Plaats je eerste klus:
- Voer een functie in (bijv. "Kassieres")
- Selecteer een locatie en datum
- Zet een uurtarief
- Plaats de klus

Geverifieerde werknemers in jouw buurt zien je klus en kunnen direct reageren.

KOSTEN

Je betaalt alleen het uurtarief van de werknemers PLUS € 3,50 per gewerkt uur aan ZekerFlex.
Geen abonnement, geen verborgen kosten.

Plaats je eerste klus hier: ${env.APP_BASE_URL}/klus-plaatsen

VRAGEN?

Bekijk onze pagina voor bedrijven: ${env.APP_BASE_URL}/bedrijven
Of neem contact op: ${env.MAIL_REPLY_TO}

Veel succes!

Het ZekerFlex-team
  `;

  try {
    const result = await sendMail({
      to,
      subject: `Welkom bij ZekerFlex, ${name ?? ""}!`,
      text,
      html,
      kind: "company-welcome",
    });

    if (!result.delivered) {
      logger.warn(`Company welcome mail not delivered to ${to}: ${result.error}`);
    }
  } catch (err) {
    logger.error(`Failed to send company welcome mail to ${to}`, err);
  }
}

/**
 * Schedule een reminder-mail voor 3 uur later (als geen klus is geplaatst).
 * In productie: dit zou via een cron-taak of job-queue moeten, niet synchrone sleeps.
 *
 * Voor nu: we recorderen dit als een "scheduled" entry en laten de rondgang-cron
 * dit oppikken.
 */
function scheduleReminderEmail(tenantId: string, companyName: string, contactEmail: string): void {
  // Placeholder: in productie zou dit via Redis/KV gaan en een cron-task triggeren.
  // Voor nu: we schrijven het als pending naar de database.

  // Dit is slechts een placeholder - werkelijk implementatie hangt af van
  // de job-queue-strategie van het project.
  logger.info(`[TODO] Schedule reminder for company ${companyName} (${tenantId}) in 3h`, {
    tenantId,
    companyName,
    contactEmail,
    scheduledAt: new Date(Date.now() + REMINDER_EMAIL_DELAY_MS),
  });
}

/**
 * Send reminder email als bedrijf nog geen klus heeft geplaatst in 3 uur.
 * Dit wordt aangeroepen via een cron-job of polling.
 */
export async function sendReminderEmailIfNoTask(tenantId: string): Promise<void> {
  // Check of deze tenant al een klus heeft geplaatst
  const hasTask = await prisma.shift.count({
    where: { tenantId },
  });

  if (hasTask) {
    logger.info(`Company ${tenantId} already has tasks, skipping reminder.`);
    return;
  }

  // Get tenant info
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      contact: {
        select: {
          email: true,
          firstName: true,
        },
      },
    },
  });

  if (!tenant?.contact?.email) {
    logger.warn(`Cannot send reminder: no contact email for tenant ${tenantId}`);
    return;
  }

  const companyName = tenant.name ?? "Bedrijf";
  const contactName = tenant.contact.firstName ?? undefined;
  const contactEmail = tenant.contact.email;

  // Send reminder
  const html = `
    <p>Hallo ${contactName ?? companyName},</p>

    <p>Je hebt je net aangemeld bij ZekerFlex, maar we zien nog geen klus van je. 🤔</p>

    <h2>Je mist misschien wat?</h2>
    <p>Via ZekerFlex vind je makkelijk geverifieerde flexwerknemers:</p>
    <ul>
      <li><strong>Plaats een klus</strong> in een paar minuten</li>
      <li><strong>Krijg aanbiedingen</strong> van werknemers in jouw buurt</li>
      <li><strong>Betaal alleen</strong> voor gewerkte uren (€ 3,50/uur + hun uurloon)</li>
    </ul>

    <p><a href="${env.APP_BASE_URL}/klus-plaatsen" style="display: inline-block; padding: 12px 24px; background-color: #0EA875; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Plaats nu een klus</a></p>

    <h2>Nog vragen?</h2>
    <p>Lees de <a href="${env.APP_BASE_URL}/bedrijven">veelgestelde vragen</a> of neem contact op.</p>

    <p>Het ZekerFlex-team</p>
  `;

  const text = `
Hallo ${contactName ?? companyName},

Je hebt je net aangemeld bij ZekerFlex, maar we zien nog geen klus van je.

JE MIST MISSCHIEN WAT?

Via ZekerFlex vind je makkelijk geverifieerde flexwerknemers:
- Plaats een klus in een paar minuten
- Krijg aanbiedingen van werknemers in jouw buurt
- Betaal alleen voor gewerkte uren (€ 3,50/uur + hun uurloon)

Plaats nu een klus: ${env.APP_BASE_URL}/klus-plaatsen

VRAGEN?

Lees de veelgestelde vragen: ${env.APP_BASE_URL}/bedrijven

Het ZekerFlex-team
  `;

  try {
    const result = await sendMail({
      to: contactEmail,
      subject: `${contactName ?? companyName}, heb je hulp nodig?`,
      text,
      html,
      kind: "company-reminder",
    });

    if (!result.delivered) {
      logger.warn(`Company reminder mail not delivered to ${contactEmail}: ${result.error}`);
    } else {
      await recordAudit({
        category: "SALES",
        action: "company.reminder-sent",
        summary: `Reminder-mail verzonden naar ${companyName}`,
        targetType: "tenant",
        targetId: tenantId,
      }).catch((err) => logger.error("Audit failed in sendReminderEmailIfNoTask", err));
    }
  } catch (err) {
    logger.error(`Failed to send company reminder to ${contactEmail}`, err);
  }
}
