import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const modelName = request.nextUrl.searchParams.get("modelName");
    const timeframe = request.nextUrl.searchParams.get("timeframe") || "7d";

    let daysBack = 7;
    if (timeframe === "30d") daysBack = 30;
    if (timeframe === "90d") daysBack = 90;

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const predictions = await prisma.prediction.findMany({
      where: {
        ...(modelName && { modelName }),
        createdAt: { gte: since },
      },
      select: {
        confidence: true,
        accuracy: true,
        modelName: true,
      },
    });

    const modelVersions = await prisma.modelVersion.findMany({
      where: {
        ...(modelName && { modelName }),
      },
      select: {
        id: true,
        modelName: true,
        version: true,
        metrics: true,
        status: true,
        trainingDate: true,
      },
      orderBy: { version: "desc" },
      take: 10,
    });

    const avgConfidence =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + (p.confidence || 0), 0) /
          predictions.length
        : 0;

    const avgAccuracy =
      predictions.length > 0
        ? predictions.reduce((sum, p) => sum + (p.accuracy || 0), 0) /
          predictions.length
        : 0;

    return NextResponse.json({
      metrics: {
        totalPredictions: predictions.length,
        avgConfidence,
        avgAccuracy,
        timeframe,
        daysBack,
      },
      modelVersions,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");

    const body = await request.json();
    const { modelName, accuracy, precision, recall, f1Score, auc } = body;

    if (!modelName || typeof accuracy !== "number") {
      throw AppError.validation("modelName and accuracy required");
    }

    const prediction = await prisma.prediction.create({
      data: {
        modelName,
        accuracy,
        precision: precision ?? 0,
        recall: recall ?? 0,
        f1Score: f1Score ?? 0,
        auc: auc ?? 0,
      },
    });

    return NextResponse.json({ prediction }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
