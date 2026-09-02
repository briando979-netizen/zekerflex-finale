import type { GpsEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPrincipal, hasRole } from "@/lib/auth";
import { DisputeConsole } from "@/components/disputes/DisputeConsole";
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
  branchScope: string[] | "ALL",
): Promise<DisputeDto[]> {
  const disputes = await prisma.dispute.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      ...(branchScope === "ALL"
        ? {}
        : { timesheet: { branchId: { in: branchScope } } }),
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
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Niet ingelogd</h1>
        <p className="text-slate-600">Log in om de dispuut-console te bekijken.</p>
      </main>
    );
  }

  const canReview = hasRole(
    principal,
    "DISPUTE_MANAGER",
    "HQ_ADMIN",
    "PLATFORM_ADMIN",
  );
  if (!canReview) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">
          Deze console is alleen beschikbaar voor dispuut-beheerders.
        </p>
      </main>
    );
  }

  const scope: string[] | "ALL" = hasRole(principal, "PLATFORM_ADMIN")
    ? "ALL"
    : principal.managedBranchIds.length > 0
      ? principal.managedBranchIds
      : "ALL"; // unscoped CLIENT_ADMIN sees all branches of their tenant(s)

  const disputes = await loadDisputes(scope);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Dispuut-console
        </h1>
        <p className="text-sm text-slate-600">
          Urenafwijkingen naast de GPS check-in/check-out registratie. Beoordeel,
          overrule of keur goed.
        </p>
      </header>
      <DisputeConsole disputes={disputes} />
    </main>
  );
}
