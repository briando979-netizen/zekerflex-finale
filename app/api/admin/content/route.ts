import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { CONTENT_REGISTRY, getContentMap, getContentValues, setContent } from "@/lib/content/store";
import { bewaarTekstWijziging, tekstGeschiedenis } from "@/lib/content/geschiedenis";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ registry: CONTENT_REGISTRY, values: await getContentValues(), geschiedenis: await tekstGeschiedenis() });
});

const schema = z.object({
  key: z.string().min(1),
  value: z.string().max(2000),
});

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const input = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  if (!CONTENT_REGISTRY.some((c) => c.key === input.key)) {
    throw AppError.validation("Onbekende tekst-sleutel");
  }
  // de tekst zoals bezoekers hem zagen, vóór en na (voor de geschiedenis en terugzetten)
  const voor = (await getContentMap([input.key]))[input.key] ?? "";
  await setContent(input.key, input.value);
  const values = await getContentValues();
  const geschiedenis = await bewaarTekstWijziging(input.key, voor, values[input.key] ?? "");
  await recordAudit({
    category: "ADMIN",
    action: "content.update",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Sitetekst bijgewerkt: ${input.key}`,
  });
  return NextResponse.json({ registry: CONTENT_REGISTRY, values, geschiedenis });
});
