import type {
  DisputeOrigin,
  DisputeStatus,
  GpsEventType,
} from "@prisma/client";

export interface GpsEventDto {
  type: GpsEventType;
  recordedAt: string; // ISO
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  distanceToBranchMeters: number;
  withinGeofence: boolean;
  mocked: boolean;
  /** zonder bereik vastgelegd (bron "offline"): wanneer de server het ontving, anders null */
  ontvangenOp: string | null;
}

export interface DisputeDto {
  id: string;
  status: DisputeStatus;
  origin: DisputeOrigin;
  systemRaised: boolean;
  reason: string;
  createdAt: string;

  claimedMinutes: number;
  proposedMinutes: number;
  deltaMinutes: number; // claimed - proposed

  freelancerName: string;
  branchName: string;
  branchCity: string;

  timesheet: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    breakMinutes: number;
    hourlyRateCents: number;
  };

  gps: {
    checkIn: GpsEventDto | null;
    checkOut: GpsEventDto | null;
    heartbeats: GpsEventDto[];
    /** minutes between first check-in and last check-out, null if incomplete. */
    measuredOnSiteMinutes: number | null;
    anyOutsideGeofence: boolean;
    anyMocked: boolean;
  };
}
