import { ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { klusVoorstelEmailT } from "@/lib/mail/werker/klusvoorstel";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { pushWhen } from "@/lib/i18n/worker-push";
import { fixedWindow } from "@/lib/rate-limit";
import { isTestklus } from "@/lib/shifts/testklus";
import { amsterdamClock } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Een klusvoorstel per mail, voor wie de pushmelding niet bereikte (geen
// meldingen aan, of geen apparaat meer). Op 9 nov had maar 3 van de 38 echte
// werkers push; 35 voorstellen verliepen ongezien. De mail valt onder de
// bestaande categorie "Nieuwe klussen die bij je passen" (klus-alerts), dus
// afmelden kan onderaan elke mail en sendMail houdt zich daaraan.
// Nooit voor een testklus, alleen naar een bevestigd adres, en hoogstens één
// mail per werker per MAIL_PER_UREN uur (bij een storing in Redis: geen mail).
// ---------------------------------------------------------------------------

export const MAIL_PER_UREN = 6;

const OPEN: ShiftStatus[] = [ShiftStatus.OPEN, ShiftStatus.MATCHING, ShiftStatus.PARTIALLY_FILLED];

const DAG = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long" });

/** "maandag 10 november, 09:00–17:00" in Nederlandse tijd. */
export function klusMoment(startsAt: Date, endsAt: Date): string {
  return `${DAG.format(startsAt)}, ${amsterdamClock(startsAt)}–${amsterdamClock(endsAt)}`;
}

/** "€ 16,50" */
export function klusTarief(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export type KlusMailUitslag = "verstuurd" | "geen-adres" | "geen-klus" | "testklus" | "begrensd" | "niet-verstuurd";

export async function mailKlusVoorstel(input: {
  freelancerId: string;
  shiftId: string;
  travelMinutes: number | null;
}): Promise<KlusMailUitslag> {
  const [profiel, shift] = await Promise.all([
    prisma.freelancerProfile.findUnique({
      where: { id: input.freelancerId },
      select: { userId: true, user: { select: { email: true, fullName: true, emailVerifiedAt: true, disabledAt: true } } },
    }),
    prisma.shift.findUnique({
      where: { id: input.shiftId },
      select: {
        title: true,
        startsAt: true,
        endsAt: true,
        hourlyRateCents: true,
        status: true,
        branch: { select: { name: true, city: true, tenant: { select: { name: true } } } },
      },
    }),
  ]);
  const user = profiel?.user;
  const userId = profiel?.userId;
  if (!userId || !user?.email || !user.emailVerifiedAt || user.disabledAt) return "geen-adres";
  if (!shift || !OPEN.includes(shift.status) || shift.startsAt.getTime() <= Date.now()) return "geen-klus";
  if (isTestklus({ title: shift.title, bedrijf: shift.branch.tenant.name })) return "testklus";

  const rem = await fixedWindow(`klus-mail:${input.freelancerId}`, 1, MAIL_PER_UREN * 3600, { failOpen: false });
  if (!rem.ok) return "begrensd";

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const taal = await mailTaalVoorWerker(userId);
  const mail = klusVoorstelEmailT({
    fullName: user.fullName,
    title: shift.title,
    branch: shift.branch.name,
    city: shift.branch.city,
    when: taal === "nl" ? klusMoment(shift.startsAt, shift.endsAt) : pushWhen(taal, shift),
    rate: klusTarief(shift.hourlyRateCents),
    travelMinutes: input.travelMinutes,
    link: `${base}/dashboard/klussen/${input.shiftId}`,
  }, taal);
  try {
    await sendMail({ ...mail, to: user.email });
    return "verstuurd";
  } catch (err) {
    logger.warn("klusvoorstel per mail mislukt", { freelancerId: input.freelancerId, shiftId: input.shiftId, error: (err as Error).message });
    return "niet-verstuurd";
  }
}
