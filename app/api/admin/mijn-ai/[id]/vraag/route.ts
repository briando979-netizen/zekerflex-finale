import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { withAdminAccess } from "@/lib/auth/handlers";
import { chatStream } from "@/lib/ai/client";
import { modelForPurpose } from "@/lib/ai/models";
import { gratisAan, primeGratis } from "@/lib/ai/gratis";
import { inspectPrompt } from "@/lib/security/prompt-guard";
import { leesGesprek, voegToe } from "@/lib/mijn-ai/opslag";
import { berichtenVoorModel, foutZin, STROOM_EINDE, titelVan, VRAAG_MAX, type MijnAiBericht } from "@/lib/mijn-ai/vorm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Een vraag in een gesprek van Mijn AI. Het antwoord komt woord voor woord terug (tekst-stroom); aan het eind, na het
// teken STROOM_EINDE, een regel JSON: { fout? } (een gewone zin, de techniek gaat naar het log).
//   POST { tekst }          → je vraag (meteen bewaard) en het antwoord
//   POST { opnieuw: true }  → het laatste antwoord opnieuw laten maken
// Stop je halverwege (de browser breekt af), dan blijft wat er al was staan, gemarkeerd als onaf.

const schema = z.union([z.object({ tekst: z.string().trim().min(1).max(VRAAG_MAX) }), z.object({ opnieuw: z.literal(true) })]);

export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (req, { params, principal }) => {
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw AppError.validation("Typ eerst een vraag.");
  const userId = principal.userId;
  const gesprek = await leesGesprek(userId, params.id);
  if (!gesprek) throw AppError.notFound("Dit gesprek bestaat niet (meer).");

  let vraag: string;
  let eerder: MijnAiBericht[];
  if ("opnieuw" in body.data) {
    const lijst = gesprek.berichten.at(-1)?.rol === "ai" ? gesprek.berichten.slice(0, -1) : gesprek.berichten;
    const laatste = lijst.at(-1);
    if (laatste?.rol !== "jij") throw AppError.validation("Er is geen vraag om opnieuw te beantwoorden.");
    vraag = laatste.tekst;
    eerder = lijst.slice(0, -1);
    await voegToe(userId, gesprek.id, [], { laatsteAiWeg: true });
  } else {
    vraag = body.data.tekst;
    if (!inspectPrompt(vraag).allowed) throw AppError.validation("Deze vraag valt buiten de veiligheidsgrenzen.");
    eerder = gesprek.berichten;
    const eerste = !gesprek.berichten.some((b) => b.rol === "jij");
    await voegToe(userId, gesprek.id, [{ rol: "jij", tekst: vraag, at: new Date().toISOString() }], eerste ? { titel: titelVan(vraag) } : {});
  }

  await primeGratis().catch(() => undefined);
  const gratis = gratisAan();
  const model = modelForPurpose("mijn-ai");
  const gen = chatStream({ purpose: "mijn-ai", messages: berichtenVoorModel(eerder, vraag, gratis), temperature: 0.5, maxTokens: gratis ? 900 : 2000 });

  let gestopt = false;
  const stroom = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let tekst = "";
      let fout: string | null = null;
      try {
        for await (const stuk of gen) {
          if (gestopt) break;
          tekst += stuk;
          controller.enqueue(enc.encode(stuk));
        }
      } catch (err) {
        fout = foutZin((err as Error).message);
        logger.warn("mijn-ai antwoord mislukt", { error: (err as Error).message.slice(0, 160), metTekst: tekst.length > 0 });
      } finally {
        const onaf = gestopt || fout !== null;
        if (tekst.trim()) {
          await voegToe(userId, gesprek.id, [{ rol: "ai", tekst: tekst.trim(), at: new Date().toISOString(), model, ...(onaf ? { onaf: true } : {}) }]).catch(() => undefined);
        }
        if (!gestopt) {
          try {
            controller.enqueue(enc.encode(`${STROOM_EINDE}${JSON.stringify(fout ? { fout } : {})}`));
            controller.close();
          } catch {
            /* de browser is al weg */
          }
        }
      }
    },
    cancel() {
      // de browser stopte (knop Stop of pagina dicht): de lus stopt, wat er al was wordt bewaard
      gestopt = true;
    },
  });

  return new Response(stroom, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Mijn-Ai-Model": model },
  });
});
