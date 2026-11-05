import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { leesTekst } from "@/lib/ocr/engine";
import { leesDocument } from "@/lib/ocr/lezen";

// Een foto van een certificaat, bon of uittreksel → de tekst en de velden die
// de app eruit haalt (lib/ocr). Voor ingelogde gebruikers (werker én
// werkgever); het bestand wordt niet bewaard, alleen gelezen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12_000_000;
const MAX_TEKST = 6000;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "ocr-lezen",
      identifier: p.userId,
      limit: 30,
      windowSeconds: 600,
      message: "Te veel foto's achter elkaar — probeer het over enkele minuten opnieuw.",
    });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur als multipart/form-data");
    });
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) throw AppError.validation("Kies een foto.");
    if (f.size > MAX_BYTES) throw AppError.validation("Bestand te groot (max 12 MB)");
    const bytes = Buffer.from(await f.arrayBuffer());
    // alleen foto's: een PDF lezen we (nog) niet automatisch
    sniffAndVerifyUploadType(bytes, ["jpeg", "png", "webp"]);

    const uit = await leesTekst(bytes);
    const tekst = uit.tekst.replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_TEKST);
    return NextResponse.json({ tekst, vertrouwen: uit.vertrouwen, ms: uit.ms, gelezen: leesDocument(tekst) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
