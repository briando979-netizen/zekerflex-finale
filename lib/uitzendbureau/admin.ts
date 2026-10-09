import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Admin view of the uitzendbureau business line: prospective clients (leads
// from the /uitzendbureau intake form) and active clients (tenants that have
// actually posted shifts flagged `viaUitzendbureau`).
// ---------------------------------------------------------------------------

export interface UitzendbureauLead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
}

export interface UitzendbureauClient {
  tenantId: string;
  tenantName: string;
  shiftCount: number;
  openPositions: number;
  filledPositions: number;
  nextShiftAt: Date | null;
}

export interface UitzendbureauOverview {
  leads: UitzendbureauLead[];
  clients: UitzendbureauClient[];
}

export async function getUitzendbureauOverview(): Promise<UitzendbureauOverview> {
  const [leadRows, shiftRows] = await Promise.all([
    prisma.salesLead.findMany({
      where: { source: "uitzendbureau" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        notes: true,
        createdAt: true,
      },
    }),
    prisma.shift.findMany({
      where: { viaUitzendbureau: true },
      select: {
        id: true,
        positions: true,
        startsAt: true,
        branch: { select: { tenantId: true, tenant: { select: { name: true } } } },
        assignments: { where: { cancelledAt: null }, select: { id: true } },
      },
    }),
  ]);

  const byTenant = new Map<string, UitzendbureauClient>();
  for (const s of shiftRows) {
    const tenantId = s.branch.tenantId;
    const existing = byTenant.get(tenantId);
    const filled = s.assignments.length;
    if (existing) {
      existing.shiftCount += 1;
      existing.openPositions += Math.max(0, s.positions - filled);
      existing.filledPositions += filled;
      if (s.startsAt.getTime() > Date.now() && (!existing.nextShiftAt || s.startsAt < existing.nextShiftAt)) {
        existing.nextShiftAt = s.startsAt;
      }
    } else {
      byTenant.set(tenantId, {
        tenantId,
        tenantName: s.branch.tenant.name,
        shiftCount: 1,
        openPositions: Math.max(0, s.positions - filled),
        filledPositions: filled,
        nextShiftAt: s.startsAt.getTime() > Date.now() ? s.startsAt : null,
      });
    }
  }

  return {
    leads: leadRows,
    clients: [...byTenant.values()].sort((a, b) => b.shiftCount - a.shiftCount),
  };
}
