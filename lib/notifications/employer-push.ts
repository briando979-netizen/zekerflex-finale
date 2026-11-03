import { prisma } from "@/lib/prisma";
import { resolveShiftContact } from "@/lib/messaging/contacts";
import { sendUserPush } from "@/lib/notifications/push";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// "✅ Sanne neemt je klus" — de contactpersoon van een dienst hoort meteen dat
// een werker hem heeft aangenomen, in plaats van het pas in de app te zien.
// Alleen vanuit de werkerspaden (zelf aannemen, een aanbod accepteren): als de
// werkgever zelf een tegenbod goedkeurt, hoeft hij geen bericht over zijn eigen klik.

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "do 5 nov 09:00" in Dutch time, the same on every server (no ICU formatting differences). */
const when = (d: Date) => {
  const p = amsterdamParts(d);
  return `${WD[p.weekday] ?? ""} ${p.day} ${MON[p.month - 1] ?? ""} ${amsterdamClock(d)}`;
};

export async function pushShiftTaken(shiftId: string, workerName: string, days = 1): Promise<void> {
  const [contact, shift] = await Promise.all([
    resolveShiftContact(shiftId),
    prisma.shift.findUnique({
      where: { id: shiftId },
      select: { title: true, startsAt: true, positions: true, _count: { select: { assignments: { where: { cancelledAt: null } } } } },
    }),
  ]);
  if (!contact || !shift) return;
  const left = Math.max(0, shift.positions - shift._count.assignments);
  await sendUserPush([contact.userId], {
    title: `✅ ${workerName} neemt je klus`,
    body:
      `${shift.title}, ${days > 1 ? `${days} dagen vanaf ` : ""}${when(shift.startsAt)}. ` +
      (left > 0 ? `Nog ${left} ${left === 1 ? "plek" : "plekken"} open.` : "De klus is nu vol."),
    data: { type: "SHIFT", url: `/werkgever/diensten/${shiftId}`, tag: `genomen-${shiftId}` },
    ttlSeconds: 43_200,
  });
}
