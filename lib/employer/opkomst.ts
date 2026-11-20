import { prisma } from "@/lib/prisma";
import { telOpkomst, type OpkomstRij } from "@/lib/employer/opkomst-kern";

// ---------------------------------------------------------------------------
// Opkomst van een groep werkers in één keer, voor de reactie-rijen op de kluspagina van het bedrijf
// (app/werkgever/diensten/[shiftId]): "92 % opkomst · 14 klussen · 1× afgezegd", zoals Temper en YoungOnes dat op de
// werkerkaart tonen. Dezelfde telling als de profielkaart (lib/employer/candidate-card.ts, telOpkomst).
// ---------------------------------------------------------------------------

export interface Opkomst {
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
}

export async function opkomstVoor(userIds: string[], now = new Date()): Promise<Map<string, Opkomst>> {
  const uit = new Map<string, Opkomst>();
  if (userIds.length === 0) return uit;
  const profielen = await prisma.freelancerProfile.findMany({
    where: { userId: { in: userIds } },
    select: {
      id: true,
      userId: true,
      shiftsCompleted: true,
      assignments: {
        where: { shift: { endsAt: { lt: now } } },
        select: { cancelledAt: true, cancelReason: true, timesheet: { select: { status: true, actualStart: true } }, shift: { select: { endsAt: true } } },
        orderBy: { acceptedAt: "desc" },
        take: 150,
      },
    },
  });
  for (const p of profielen) {
    const rijen: OpkomstRij[] = p.assignments;
    const t = telOpkomst(rijen, now);
    uit.set(p.userId, { attendancePct: t.attendancePct, shiftsCompleted: p.shiftsCompleted, cancellations: t.cancellations });
  }
  return uit;
}
