import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { searchAssets, SearchQuery } from "@/lib/dam/search";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const queryParams = request.nextUrl.searchParams;
    const query: SearchQuery = {
      tenantId: principal.tenantId,
      query: queryParams.get("q") ?? undefined,
      tags: queryParams.getAll("tags"),
      type: (queryParams.get("type") as any) ?? undefined,
      limit: parseInt(queryParams.get("limit") ?? "20"),
      offset: parseInt(queryParams.get("offset") ?? "0"),
    };

    const results = await searchAssets(query);
    return NextResponse.json(results);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const schema = z.object({
      name: z.string().min(1),
      type: z.enum(["IMAGE", "VIDEO", "DOCUMENT", "AUDIO", "OTHER"]),
      mimeType: z.string(),
      fileSize: z.number().positive(),
      url: z.string().url(),
      folderId: z.string().optional(),
      tags: z.array(z.string()).default([]),
    });

    const data = schema.parse(body);

    const { createAsset } = await import("@/lib/dam/storage");
    const asset = await createAsset({
      tenantId: principal.tenantId,
      ...data,
      uploadedBy: principal.userId,
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
