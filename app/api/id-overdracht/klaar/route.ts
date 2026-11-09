import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cleanImage } from "@/lib/media/clean-image";
import { leverOverdrachtIn, type Foto } from "@/lib/kyc/overdracht";

// POST /api/id-overdracht/klaar — de telefoon levert de drie foto's en de
// documentgegevens in. Daarna is de code op; de laptop controleert en rondt de
// verificatie af (lib/kyc/overdracht.ts). Openbaar met de eenmalige code én het
// toesteltoken van het toestel dat de link als eerste opende, IP-begrensd.
// Elke foto wordt opnieuw opgeslagen: echt een foto (geen ander bestand dat zich
// zo noemt), rechtop, zonder EXIF/GPS (lib/media/clean-image.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// drie foto's moeten samen onder de 25 MB per verzoek van Caddy blijven
const MAX_BYTES = 8_000_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

const velden = z.object({
  code: z.string().min(10).max(120),
  toestel: z.string().min(10).max(80),
  soort: z.enum(["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"]),
  nummer: z.string().trim().min(4).max(20),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  naam: z.string().trim().min(2).max(120),
});

async function foto(form: FormData, veld: string, label: string): Promise<Foto> {
  const f = form.get(veld);
  if (!(f instanceof File) || f.size === 0) throw AppError.validation(`${label} ontbreekt`);
  if (f.size > MAX_BYTES) throw AppError.validation(`${label} is te groot (max 8 MB). Maak de foto met de knop in ZekerFlex.`);
  if (!TOEGESTAAN.has(f.type.toLowerCase())) throw AppError.validation(`${label}: gebruik een JPG-, PNG- of WebP-foto`);
  // de inhoud zelf controleren en zonder metadata opnieuw opslaan (niet alleen het opgegeven type)
  const schoon = await cleanImage(Buffer.from(await f.arrayBuffer()));
  return { filename: `${veld}.webp`, mimeType: schoon.mime, bytes: schoon.bytes };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-klaar", identifier: clientIp(request), limit: 10, windowSeconds: 600 });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur de foto's als multipart/form-data");
    });
    const v = velden.safeParse({
      code: form.get("code"),
      toestel: form.get("toestel"),
      soort: form.get("soort"),
      nummer: form.get("nummer"),
      datum: form.get("datum"),
      naam: form.get("naam"),
    });
    if (!v.success) throw AppError.validation(v.error.issues[0]?.message ?? "Controleer de gegevens");
    const voor = await foto(form, "voor", "De voorkant");
    const achter = await foto(form, "achter", "De achterkant");
    const selfie = await foto(form, "selfie", "De selfie");
    const uit = await leverOverdrachtIn(v.data.code, v.data.toestel, {
      soort: v.data.soort,
      gegevens: { nummer: v.data.nummer, datum: v.data.datum, naam: v.data.naam },
      voor,
      achter,
      selfie,
    });
    if (uit === "storing") {
      return NextResponse.json(
        { error: { code: "EVEN_NIET", message: "Even geen verbinding met de opslag. Je link is nog geldig: probeer het over een minuut opnieuw." } },
        { status: 503 },
      );
    }
    if (uit !== "ok") throw AppError.notFound("Deze link is niet (meer) geldig, of al gebruikt. Maak op je laptop een nieuwe QR-code.");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("overdracht inleveren mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
