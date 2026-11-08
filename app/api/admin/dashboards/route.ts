import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { getCommandCenter, createCommandCenter, updateCommandCenter, getAlerts, getIncidents } from "@/lib/dashboard/command-center";
import { getRoleDashboard } from "@/lib/dashboard/role-dashboards";
import { getUserCustomization, updateCustomization, saveDashboardLayout, getDashboardLayout } from "@/lib/dashboard/customization";
import { getDashboardShares, shareDashboard } from "@/lib/dashboard/collaboration";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const type = request.nextUrl.searchParams.get("type");

    if (type === "command-center") {
      const dashboard = await getCommandCenter(principal.userId);
      return NextResponse.json({ dashboard });
    }

    if (type === "customization") {
      const customization = await getUserCustomization(principal.userId);
      return NextResponse.json({ customization });
    }

    if (type === "alerts") {
      const severity = request.nextUrl.searchParams.get("severity");
      const alerts = await getAlerts(principal.userId, severity || undefined);
      return NextResponse.json({ alerts });
    }

    if (type === "incidents") {
      const incidents = await getIncidents(principal.userId);
      return NextResponse.json({ incidents });
    }

    const dashboards = await prisma.dashboard.findMany({
      where: { userId: principal.userId }
    });
    return NextResponse.json({ dashboards });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, type } = body;

    if (action === "create-command-center") {
      const dashboard = await createCommandCenter(principal.userId, { ...body, userId: principal.userId });
      return NextResponse.json({ dashboard }, { status: 201 });
    }

    if (action === "update-customization") {
      const customization = await updateCustomization(principal.userId, body.customization);
      return NextResponse.json({ customization });
    }

    if (action === "save-layout") {
      const layout = await saveDashboardLayout(principal.userId, body.dashboardId, body.layout);
      return NextResponse.json({ layout });
    }

    if (action === "share-dashboard") {
      const share = await shareDashboard({
        dashboardId: body.dashboardId,
        sharedWith: body.sharedWith,
        permissions: body.permissions,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
      });
      return NextResponse.json({ share }, { status: 201 });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        userId: principal.userId,
        title: body.title,
        type: body.type || "custom",
        config: body.config || {}
      }
    });

    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const dashboardId = request.nextUrl.searchParams.get("id");
    if (!dashboardId) throw AppError.validation("Dashboard ID required");

    const body = await request.json();
    const dashboard = await prisma.dashboard.update({
      where: { id: dashboardId },
      data: { config: body.config, title: body.title }
    });

    return NextResponse.json({ dashboard });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
