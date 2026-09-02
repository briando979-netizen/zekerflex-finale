import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { userDirectory } from "@/lib/messaging/contacts";
import { getUserAvatars } from "@/lib/profile/store";
import { listThreadsForUser } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/people/search?q=  — people the caller may legitimately reach:
//   • anyone they already share a thread with
//   • employers: any freelancer, by name
//   • freelancers: managers of tenants where they've had an assignment
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const me = await requirePrincipal();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

    const roles = me.grants.map((g) => g.role);
    const isEmployer = roles.some((r) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(r));
    const isAdmin = roles.includes("PLATFORM_ADMIN");

    const allowed = new Set<string>();

    // people from existing threads
    const threads = await listThreadsForUser(me.userId, isAdmin);
    threads.forEach((t) => t.participants.forEach((id) => id !== me.userId && allowed.add(id)));

    const nameWhere = q.length >= 2 ? { fullName: { contains: q, mode: "insensitive" as const } } : {};

    if (isEmployer || isAdmin) {
      const freelancers = await prisma.user.findMany({
        where: { ...nameWhere, freelancerProfile: { isNot: null }, disabledAt: null },
        select: { id: true },
        take: 25,
      });
      freelancers.forEach((u) => allowed.add(u.id));
    } else {
      const myTenants = await prisma.shiftAssignment.findMany({
        where: { freelancer: { userId: me.userId } },
        select: { shift: { select: { branch: { select: { tenantId: true } } } } },
      });
      const tenantIds = [...new Set(myTenants.map((a) => a.shift.branch.tenantId))];
      if (tenantIds.length) {
        const managers = await prisma.membership.findMany({
          where: {
            tenantId: { in: tenantIds },
            role: { in: ["HQ_ADMIN", "LOCAL_MANAGER"] },
            user: { ...nameWhere, disabledAt: null },
          },
          select: { userId: true },
          take: 25,
        });
        managers.forEach((m) => allowed.add(m.userId));
      }
    }

    allowed.delete(me.userId);
    let ids = [...allowed];

    if (q.length >= 2) {
      const matches = await prisma.user.findMany({
        where: { id: { in: ids }, fullName: { contains: q, mode: "insensitive" } },
        select: { id: true },
      });
      ids = matches.map((m) => m.id);
    }
    ids = ids.slice(0, 30);

    const [directory, avatars] = await Promise.all([
      userDirectory(ids).then((m) => Object.fromEntries(m)),
      getUserAvatars(ids),
    ]);
    return NextResponse.json({
      people: ids.map((id) => directory[id]).filter(Boolean),
      avatars,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
