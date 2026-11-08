import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { BackupManager } from "@/lib/backup/manager";
import { RecoveryManager } from "@/lib/backup/recovery";
import { GeoManager } from "@/lib/backup/geo";
import { DRPlanner } from "@/lib/disaster-recovery/planner";
import { FailoverManager } from "@/lib/failover/manager";
import { BackupTester } from "@/lib/backup/testing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const action = request.nextUrl.searchParams.get("action");

    if (action === "stats") {
      const backupStats = await BackupManager.getBackupStats();
      const recoveryStats = await RecoveryManager.getRecoveryStats();
      const geoStats = await GeoManager.getGeoStats();
      const drStats = await DRPlanner.getDRStats();
      const foStats = await FailoverManager.getFailoverStats();
      const testStats = await BackupTester.getTestingStats();

      return NextResponse.json({
        backup: backupStats,
        recovery: recoveryStats,
        geo: geoStats,
        dr: drStats,
        failover: foStats,
        testing: testStats,
      });
    }

    if (action === "list-backups") {
      const backups = await BackupManager.listBackups();
      return NextResponse.json({ backups });
    }

    if (action === "list-regions") {
      const regions = await GeoManager.getAllRegions();
      return NextResponse.json({ regions });
    }

    if (action === "list-plans") {
      const plans = await DRPlanner.listPlans();
      return NextResponse.json({ plans });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const { action, ...data } = body;

    if (action === "schedule-backup") {
      const backup = await BackupManager.scheduleBackup(data.type || "full");
      return NextResponse.json({ backup }, { status: 201 });
    }

    if (action === "start-recovery") {
      const recovery = await RecoveryManager.recoverDatabase(data.backupId, data.targetTime);
      return NextResponse.json({ recovery }, { status: 201 });
    }

    if (action === "start-restore-test") {
      const test = await BackupTester.performRestoreTest(data.backupId);
      return NextResponse.json({ test }, { status: 201 });
    }

    if (action === "perform-failover") {
      const failover = await FailoverManager.performAutomaticFailover(data.policyId);
      return NextResponse.json({ failover }, { status: 201 });
    }

    if (action === "schedule-dr-drill") {
      const drill = await DRPlanner.createDrill(data.planId);
      return NextResponse.json({ drill }, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
