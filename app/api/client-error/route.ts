import { jsonBegrensd } from "@/lib/http/body-grens";
import { scrub } from "@/lib/ops/error-journal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { isStaleDeployment } from "@/lib/ops/stale-deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/client-error — de crash-boundary (app/error.tsx) stuurt hier de
// echte client-side fout naartoe (bericht + stacktrace + scherm), zodat die in
// de serverlogs terechtkomt en te diagnosticeren is. Publiek + IP-begrensd;
// best-effort, geeft altijd 200 terug (rapporteren mag nooit zelf crashen).
// Een tabblad van vóór een uitrol herlaadt zichzelf: dat wordt een waarschuwing,
// onder dezelfde melding (de Bouwer-knop blijft weg, lib/bouwer/fout-opdracht.ts).
const schema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(8000).optional(),
  digest: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(400).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "client-error",
      identifier: clientIp(request),
      limit: 30,
      windowSeconds: 60,
      message: "Te veel foutmeldingen.",
    });
    // een foutmelding met stack is hooguit een paar kB (12 nov: grens vóór het lezen)
    const gelezen = await jsonBegrensd(request, 16_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : {});
    if (parsed.success) {
      // ook in de docker-logs geen tokens: query's, fragmenten (#code van de QR-code), lange id's weg (scrub)
      const fields = {
        clientMessage: scrub(parsed.data.message ?? ""),
        digest: parsed.data.digest ?? "",
        url: scrub(parsed.data.url ?? ""),
        userAgent: parsed.data.userAgent ?? "",
        stack: scrub((parsed.data.stack ?? "").slice(0, 4000)),
      };
      if (isStaleDeployment({ message: parsed.data.message })) logger.warn("client error boundary", fields);
      else logger.error("client error boundary", fields);
    }
  } catch {
    /* rate-limited of ongeldig — stil negeren */
  }
  return NextResponse.json({ ok: true });
}
