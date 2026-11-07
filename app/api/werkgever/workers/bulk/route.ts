import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

const bulkActionSchema = z.object({
  workerIds: z.array(z.string()).min(1).max(100),
  action: z.enum(["block", "unblock", "favorite"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("No organization linked");
    }

    const { workerIds, action } = bulkActionSchema.parse(await request.json());

    if (action === "block") {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          blockedFreelancerIds: {
            push: workerIds,
          },
        },
      });
      return NextResponse.json({ ok: true, message: `Blocked ${workerIds.length} worker(s)` });
    }

    if (action === "unblock") {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (tenant) {
        const updated = tenant.blockedFreelancerIds.filter(
          (id: string) => !workerIds.includes(id)
        );
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { blockedFreelancerIds: updated },
        });
      }
      return NextResponse.json({ ok: true, message: `Unblocked ${workerIds.length} worker(s)` });
    }

    if (action === "favorite") {
      for (const workerId of workerIds) {
        await prisma.favoritePool.upsert({
          where: { id: `pool-${tenantId}-${workerId}` },
          create: {
            tenantId,
            name: `Favorite Worker ${workerId.slice(0, 8)}`,
            members: {
              create: {
                freelancerUserId: workerId,
              },
            },
          },
          update: {},
        });
      }
      return NextResponse.json({ ok: true, message: `Added ${workerIds.length} to favorites` });
    }

    throw AppError.validation("Unknown action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
