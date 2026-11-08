import { NextRequest, NextResponse } from "next/server";
import { getVideoById, updateVideo, deleteVideo } from "@/lib/videos/manager";
import { AppError } from "@/lib/errors";

// GET /api/videos/[id] - Get video details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const video = await getVideoById(params.id);

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(video);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: 500 },
    );
  }
}

// PATCH /api/videos/[id] - Update video
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const video = await updateVideo(params.id, body);
    return NextResponse.json(video);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to update video" },
      { status: 500 },
    );
  }
}

// DELETE /api/videos/[id] - Delete video
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await deleteVideo(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 },
    );
  }
}
