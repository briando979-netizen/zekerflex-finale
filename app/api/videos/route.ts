import { NextRequest, NextResponse } from "next/server";
import { createVideo, getVideoById, updateVideo, deleteVideo, searchVideos, getAllVideos } from "@/lib/videos/manager";
import { AppError } from "@/lib/errors";

// GET /api/videos - List all videos or search
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get("q");
    const skip = parseInt(searchParams.get("skip") ?? "0");
    const take = parseInt(searchParams.get("take") ?? "20");

    if (q) {
      const videos = await searchVideos(q);
      return NextResponse.json(videos);
    }

    const result = await getAllVideos(skip, take);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 },
    );
  }
}

// POST /api/videos - Create a new video
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (
      !body.title ||
      !body.description ||
      !body.category ||
      !body.role ||
      !body.durationSeconds ||
      !body.thumbnailUrl ||
      !body.hostedOn ||
      !body.hostId
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const video = await createVideo(body);
    return NextResponse.json(video, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to create video" },
      { status: 500 },
    );
  }
}
