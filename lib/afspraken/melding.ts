import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { sendUserPush } from "@/lib/notifications/push";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";
import type { Afspraak } from "@/lib/afspraken/model";

// ---------------------------------------------------------------------------
// Een melding aan het bedrijf als een klant online een afspraak boekt (of later: annuleert). De ontvangers zijn de
// beheerders (HQ_ADMIN) van de organisatie: eerst een push (Nederlands, het is een opdrachtgever), en wie geen apparaat
// bereikt via push krijgt een mail. Altijd "best effort": deze functie gooit nooit, en de route roept hem aan na het
// antwoord (runAfter), dus een mislukte melding laat het boeken nooit falen of vertragen. In het log staan geen
// persoonsgegevens, alleen de organisatie en het soort melding.
// ---------------------------------------------------------------------------

export type MeldingSoort = "geboekt" | "geannuleerd";

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "do 12 nov 09:30" in Nederlandse tijd, op elke server hetzelfde. */
const moment = (iso: string): string => {
  const d = new Date(iso);
  const p = amsterdamParts(d);
  return `${WD[p.weekday] ?? ""} ${p.day} ${MND[p.month - 1] ?? ""} ${amsterdamClock(d)}`;
};

/** De tekst van de melding (puur, voor push en mail). De mail heeft de contactgegevens erbij zodat het bedrijf de klant kan bereiken. */
export function meldingTekst(soort: MeldingSoort, a: Afspraak, basisUrl: string): { titel: string; push: string; mail: string } {
  const wat = `${a.dienstNaam}, ${moment(a.start)}${a.medewerkerNaam ? ` bij ${a.medewerkerNaam}` : ""}`;
  const titel = soort === "geboekt" ? "Nieuwe afspraak" : "Afspraak geannuleerd";
  const contact = [a.klant.telefoon, a.klant.email].filter(Boolean).join(" · ");
  return {
    titel,
    push: `${a.klant.naam}: ${wat}.`,
    mail: [
      soort === "geboekt" ? "Een klant heeft online een afspraak gemaakt." : "Een klant heeft een afspraak geannuleerd.",
      "",
      `Klant: ${a.klant.naam}`,
      ...(contact ? [`Contact: ${contact}`] : []),
      `Afspraak: ${wat}`,
      ...(a.opmerking ? [`Opmerking: ${a.opmerking}`] : []),
      "",
      `Bekijk de agenda: ${basisUrl.replace(/\/+$/, "")}/werkgever/afspraken`,
    ].join("\n"),
  };
}

/**
 * Meldt een afspraak aan de beheerders van de organisatie. Per beheerder: push, en alleen als die geen apparaat bereikt een mail.
 * Gooit nooit; een fout per beheerder houdt de anderen niet tegen.
 */
export async function meldBedrijf(tenantId: string, a: Afspraak, soort: MeldingSoort): Promise<void> {
  try {
    const leden = await prisma.membership.findMany({
      where: { tenantId, role: "HQ_ADMIN", user: { disabledAt: null } },
      select: { user: { select: { id: true, email: true } } },
      take: 10,
    });
    const tekst = meldingTekst(soort, a, env.APP_BASE_URL);
    for (const lid of leden) {
      try {
        const bereikt = await sendUserPush([lid.user.id], {
          title: tekst.titel,
          body: tekst.push,
          data: { type: "afspraak", url: "/werkgever/afspraken", tag: `afspraak-${a.id}-${soort}` },
          ttlSeconds: 86_400,
        });
        if (bereikt === 0 && lid.user.email) {
          await sendMail({ to: lid.user.email, subject: `${tekst.titel}: ${a.dienstNaam}, ${moment(a.start)}`, text: tekst.mail, kind: "generic" });
        }
      } catch (err) {
        logger.warn("afspraakmelding aan beheerder mislukt", { tenantId, soort, fout: (err as Error).name });
      }
    }
  } catch (err) {
    logger.warn("afspraakmelding mislukt", { tenantId, soort, fout: (err as Error).name });
  }
}
