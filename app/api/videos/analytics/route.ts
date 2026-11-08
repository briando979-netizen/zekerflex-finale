import { NextRequest, NextResponse } from "next/server";
import {
  getViewAnalytics,
  getConversionMetrics,
  getTrendingVideos,
  trackEngagement,
  getEngagementMetrics,
} from "@/lib/videos/analytics";
import { recordVideoView } from "@/lib/videos/player";
import { AppError } from "@/lib/errors";

// GET /api/videos/analytics - Get analytics data
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const videoId = searchParams.get("videoId");
    const action = searchParams.get("action");

    if (videoId && action === "views") {
      const analytics = await getViewAnalytics(videoId);
      return NextResponse.json(analytics);
    }

    if (videoId && action === "conversions") {
      const metrics = await getConversionMetrics(videoId);
      return NextResponse.json(metrics);
    }

    if (action === "trending") {
      const hours = parseInt(searchParams.get("hours") ?? "24");
      const trending = await getTrendingVideos(10, hours);
      return NextResponse.json(trending);
    }

    if (videoId && action === "engagement") {
      const metrics = await getEngagementMetrics(videoId);
      return NextResponse.json(metrics);
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}

// POST /api/videos/analytics - Track view or engagement
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "view") {
      const viewId = await recordVideoView({
        videoId: body.videoId,
        userId: body.userId,
        watchedFrom: body.watchedFrom ?? 0,
        watchedTo: body.watchedTo ?? 0,
        duration: body.duration ?? 0,
        deviceType: body.deviceType ?? "desktop",
        browser: body.browser,
      });
      return NextResponse.json({ viewId }, { status: 201 });
    }

    if (action === "engagement") {
      const engagementId = await trackEngagement(
        body.videoId,
        body.userId,
        body.engagementType,
        body.metadata,
      );
      return NextResponse.json({ engagementId }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to track analytics" },
      { status: 500 },
    );
  }
}
