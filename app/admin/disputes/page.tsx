import type { GpsEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { DisputeConsole } from "@/components/disputes/DisputeConsole";
import { PageHead } from "@/components/admin/kit";
import type { DisputeDto, GpsEventDto } from "@/types/disputes";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["OPEN", "UNDER_REVIEW", "ESCALATED"] as const;

function toGpsDto(e: GpsEvent): GpsEventDto {
  return {
    type: e.type,
    recordedAt: e.recordedAt.toISOString(),
    latitude: e.latitude,
    longitude: e.longitude,
    accuracyMeters: e.accuracyMeters,
    distanceToBranchMeters: e.distanceToBranchMeters,
    withinGeofence: e.withinGeofence,
    mocked: e.mocked,
  };
}

async function loadDisputes(
  scope: { tenantIds: string[]; branchIds: string[] | null },
): Promise<DisputeDto[]> {
  const disputes = await prisma.dispute.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      timesheet: {
        branch: {
          tenantId: { in: scope.tenantIds },
          ...(scope.branchIds ? { id: { in: scope.branchIds } } : {}),
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      timesheet: {
        include: {
          branch: { select: { name: true, city: true } },
          freelancer: { include: { user: { select: { fullName: true } } } },
          gpsEvents: { orderBy: { recordedAt: "asc" } },
        },
      },
    },
    take: 200,
  });

  return disputes.map((d): DisputeDto => {
    const ts = d.timesheet;
    const checkIn = ts.gpsEvents.find((e) => e.type === "CHECK_IN") ?? null;
    const checkOut =
      [...ts.gpsEvents].reverse().find((e) => e.type === "CHECK_OUT") ?? null;
    const heartbeats = ts.gpsEvents.filter((e) => e.type === "HEARTBEAT");

    const measuredOnSiteMinutes =
      checkIn && checkOut
        ? Math.round(
            (checkOut.recordedAt.getTime() - checkIn.recordedAt.getTime()) /
              60_000,
          ) - ts.breakMinutes
        : null;

    return {
      id: d.id,
      status: d.status,
      origin: d.origin,
      systemRaised: d.raisedById === null,
      reason: d.reason,
      createdAt: d.createdAt.toISOString(),
      claimedMinutes: d.claimedMinutes,
      proposedMinutes: d.proposedMinutes,
      deltaMinutes: d.claimedMinutes - d.proposedMinutes,
      freelancerName: ts.freelancer.user.fullName,
      branchName: ts.branch.name,
      branchCity: ts.branch.city,
      timesheet: {
        id: ts.id,
        scheduledStart: ts.scheduledStart.toISOString(),
        scheduledEnd: ts.scheduledEnd.toISOString(),
        actualStart: ts.actualStart?.toISOString() ?? null,
        actualEnd: ts.actualEnd?.toISOString() ?? null,
        breakMinutes: ts.breakMinutes,
        hourlyRateCents: ts.hourlyRateCents,
      },
      gps: {
        checkIn: checkIn ? toGpsDto(checkIn) : null,
        checkOut: checkOut ? toGpsDto(checkOut) : null,
        heartbeats: heartbeats.map(toGpsDto),
        measuredOnSiteMinutes,
        anyOutsideGeofence: ts.gpsEvents.some((e) => !e.withinGeofence),
        anyMocked: ts.gpsEvents.some((e) => e.mocked),
      },
    };
  });
}

export default async function DisputesPage() {
  const principal = await getPrincipal();
  if (!principal) {
    return <PageHead title="Niet ingelogd" subtitle="Log in om de dispuut-console te bekijken." />;
  }

  const canReview = hasRole(
    principal,
    "DISPUTE_MANAGER",
    "HQ_ADMIN",
    "PLATFORM_ADMIN",
  );
  if (!canReview) {
    return <PageHead title="Geen toegang" subtitle="Deze console is alleen beschikbaar voor dispuut-beheerders." />;
  }

  // Same scoping used everywhere else in the employer/admin surface: platform
  // admins get every tenant, HQ_ADMIN/DISPUTE_MANAGER/LOCAL_MANAGER get only
  // their own tenant(s) (and branches, if explicitly branch-scoped).
  const scope = await resolveEmployerScope(principal);
  const disputes = await loadDisputes(scope);

  return (
    <div className="space-y-4">
      <PageHead
        title="Disputen"
        subtitle="Urenafwijkingen naast de GPS-registratie van in- en uitchecken. Beoordeel, corrigeer of keur goed."
      />
      <DisputeConsole disputes={disputes} />
    </div>
  );
}
