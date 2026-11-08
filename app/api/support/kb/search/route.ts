import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { searchArticles } from "@/lib/support/kb/articles";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const query = request.nextUrl.searchParams.get("q");

    if (!query) {
      throw AppError.validation("Search query required");
    }

    const articles = await searchArticles(
      principal.tenantId,
      query,
      true
    );

    return NextResponse.json({ articles });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
