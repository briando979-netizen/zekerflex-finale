import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { gegevensVan } from "@/lib/voorstel/schwarzwald-privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → al je gegevens als JSON-bestand (inzage, AVG). Alleen voor het
// ingelogde account zelf.

export async function GET(): Promise<NextResponse> {
  try {
    const account = await huidigAccount();
    if (!account) throw AppError.forbidden("Log eerst in.");
    return new NextResponse(JSON.stringify(await gegevensVan(account.email), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mijn-gegevens-het-schwarzwald.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
