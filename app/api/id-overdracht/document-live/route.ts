import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { overdrachtGeldig } from "@/lib/kyc/overdracht";
import { meetDocumentLive } from "@/lib/kyc/document-live";

// ---------------------------------------------------------------------------
// POST /api/id-overdracht/document-live — hetzelfde als /api/onboarding/document-live, maar voor de telefoon die via de
// QR-code verdergaat (niet ingelogd, 12 nov 2026): de camera stuurt de uitsnede van het kader en krijgt terug of de code
// onderaan leesbaar is en hoe groot de pasfoto staat, zodat de foto ook daar vanzelf gemaakt wordt. Openbaar met de
// eenmalige code en het toesteltoken in het formulier (nooit in het adres, dus in geen log), IP-begrensd, alleen
// vanaf het toestel dat de link als eerste opende (lib/kyc/overdracht.ts). Het beeld wordt niet bewaard en niet
// gelogd; het antwoord bevat alleen ja/nee en een getal, nooit de inhoud van de code (die bevat het BSN). Een
// verificatie via een tweede toestel beslist hoe dan ook een mens: dit maakt alleen de foto's beter.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Een uitsnede van het kader (hooguit ±1400 pixels breed) als JPEG is ±100–400 kB. */
const MAX_BYTES = 1_500_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // hoogstens ongeveer één meting per seconde, alleen als het beeld al scherp en stil is (zoals ingelogd: 300 per uur)
    await enforceRateLimit({
      name: "id-overdracht-document-live",
      identifier: clientIp(request),
      limit: 300,
      windowSeconds: 3600,
      message: "De camera heeft vaak gemeten. Maak de foto gewoon met de knop: dan kijken wij mee.",
    });
    // vóór het inlezen: een openbare route zet een te groot verzoek niet eerst helemaal in het geheugen (de server laat
    // tot 210 MB door, next.config.mjs). Het formulier is het beeld plus drie korte velden.
    if (Number(request.headers.get("content-length") ?? "0") > MAX_BYTES + 64_000) {
      throw AppError.validation("Het beeld is te groot voor live meten.");
    }
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur het beeld als multipart/form-data");
    });
    const code = form.get("code");
    const toestel = form.get("toestel");
    if (typeof code !== "string" || !(await overdrachtGeldig(code, typeof toestel === "string" ? toestel : null))) {
      throw AppError.notFound("Deze link is niet (meer) geldig. Maak op je laptop een nieuwe QR-code.");
    }
    const wat = { mrz: form.get("mrz") === "1", portret: form.get("portret") === "1" };
    if (!wat.mrz && !wat.portret) throw AppError.validation("Geef aan wat er gemeten moet worden.");
    const beeld = form.get("beeld");
    if (!(beeld instanceof File) || beeld.size === 0) throw AppError.validation("Het beeld is leeg.");
    if (beeld.size > MAX_BYTES) throw AppError.validation("Het beeld is te groot voor live meten.");
    if (!TOEGESTAAN.has(beeld.type.toLowerCase())) throw AppError.validation("Stuur een JPG-, PNG- of WebP-beeld.");

    const meting = await meetDocumentLive(new Uint8Array(await beeld.arrayBuffer()), wat);
    return NextResponse.json({ meting }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    // nooit het beeld, de code of de gelezen inhoud loggen: alleen dat het misging
    if (status >= 500) logger.error("overdracht document live meten mislukt", { soort: (err as Error).name });
    return NextResponse.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
