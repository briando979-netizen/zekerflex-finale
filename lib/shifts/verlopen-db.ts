import { ShiftStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvSet } from "@/lib/storage/kv";
import { featureEnabled } from "@/lib/flags";
import { KV_VERLOPEN_METING, VERLOPEN_VLAG, type VerlopenAfhankelijkheden } from "./verlopen";

// De echte afhankelijkheden van de nachtelijke afronding (lib/shifts/verlopen.ts): de vlag, de database en de stand in KV.
export function echteVerlopenAfhankelijkheden(): VerlopenAfhankelijkheden {
  return {
    aan: () => featureEnabled(VERLOPEN_VLAG),
    tel: (where) => prisma.shift.count({ where }),
    sluit: async (where) => (await prisma.shift.updateMany({ where, data: { status: ShiftStatus.COMPLETED } })).count,
    bewaar: (meting) => kvSet(KV_VERLOPEN_METING, meting),
  };
}
