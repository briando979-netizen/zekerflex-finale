import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { eisZelfdeHerkomst } from "@/lib/rijschool/accounts";
import { lees, vraagSchema } from "@/lib/rijschool/schema";
import { publiekeRijschool } from "@/lib/rijschool/toegang";
import { assistentAan, beantwoordVraag } from "@/lib/rijschool/assistent-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

// POST /api/rijschool/site/<slug>/vraag — een vraag aan de AI-assistent op de
// website van de rijschool (lib/rijschool/assistent.ts). Alleen als de rijschool
// hem aanzette; begrensd per bezoeker. Vraag en antwoord worden niet bewaard.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({
      name: "rijschool-assistent",
      identifier: clientIp(request),
      limit: 20,
      windowSeconds: 600,
      message: "Je hebt veel vragen gesteld. Probeer het over een paar minuten opnieuw, of neem contact op met de rijschool.",
    });
    const r = await publiekeRijschool((await params).slug);
    if (!(await assistentAan(r.id))) throw AppError.notFound("Deze rijschool heeft geen assistent op de website.");
    const { vraag, eerder } = lees(vraagSchema, await request.json().catch(() => ({})));
    return NextResponse.json(await beantwoordVraag(r, vraag, eerder));
  } catch (err) {
    return fout(err);
  }
}
