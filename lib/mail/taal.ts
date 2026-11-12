import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { userLocale } from "@/lib/i18n/worker-locale";
import type { MailTaal } from "@/lib/mail/vorm";

// In welke taal gaat een mail naar deze gebruiker? Een WERKER (alleen het lidmaatschap FREELANCER) leest zijn mail in de app-taal die hij koos
// (lib/i18n/worker-locale.ts, bij de aanmelding gezet uit de taal van de site en later via de taalknop). Opdrachtgevers, beheer, sales en
// wie niet te vinden is blijven Nederlands, net als hun schermen. Een storing in de opzoeking geeft Nederlands: een mail mag er nooit door wegblijven.
export async function mailTaalVoorWerker(userId: string): Promise<MailTaal> {
  try {
    const rollen = await prisma.membership.findMany({ where: { userId }, select: { role: true } });
    const werker = rollen.length > 0 && rollen.every((r) => r.role === "FREELANCER");
    if (!werker) return "nl";
    return await userLocale(userId);
  } catch (err) {
    logger.warn("mailtaal: opzoeken mislukt, Nederlands", { error: (err as Error).message });
    return "nl";
  }
}
