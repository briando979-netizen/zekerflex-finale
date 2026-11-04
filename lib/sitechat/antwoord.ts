import { chat, chatStream, ensureAiNode, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { fixedWindow } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { inspectPrompt } from "@/lib/security/prompt-guard";
import { voegBerichtToe } from "@/lib/sitechat/gesprek";
import { aiMagAntwoorden, antwoordZonderModel, bouwSysteem, kiesFragmenten, type Fragment } from "@/lib/sitechat/regels";

// ---------------------------------------------------------------------------
// Het antwoord van de assistent, met hetzelfde taalmodel als de chat op de
// ZekerFlex-homepage (fastModel, "public-chat"). Het gesprek wordt bewaard;
// heeft een medewerker overgenomen, dan zwijgt de assistent en komt het
// antwoord van de medewerker via het verversen in de widget.
// ---------------------------------------------------------------------------

export interface Kennis {
  bedrijf: string;
  omschrijving: string;
  regels?: readonly string[];
  fragmenten: readonly Fragment[];
  /** "bel 0548 51 85 05" — waar de gast terechtkan als de assistent het niet weet */
  contact: string;
}

export interface ChatVerzoek {
  kanaal: string;
  id: string;
  /** de laatste beurten uit de widget (gast/ai), de laatste is de vraag */
  berichten: { rol: "gast" | "ai"; tekst: string }[];
  pagina?: string | undefined;
  account?: string | undefined;
  ip: string;
}

function stroom(bron: AsyncIterable<string> | string, terugval: string, klaar?: (tekst: string) => Promise<unknown>, koppen: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let alles = "";
      try {
        if (typeof bron === "string") {
          alles = bron;
          controller.enqueue(enc.encode(bron));
        } else {
          for await (const stuk of bron) {
            alles += stuk;
            controller.enqueue(enc.encode(stuk));
          }
        }
      } catch (err) {
        // nooit een ruwe modelfout aan een bezoeker tonen
        logger.warn("sitechat: antwoord halverwege mislukt", { error: (err as Error).message });
        if (!alles.trim()) {
          alles = terugval;
          controller.enqueue(enc.encode(terugval));
        }
      } finally {
        controller.close();
        if (klaar && alles.trim()) await klaar(alles.trim()).catch(() => undefined);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...koppen } });
}

export async function chatAntwoord(v: ChatVerzoek, kennis: () => Promise<Kennis>): Promise<Response> {
  const poort = await fixedWindow(`rl:sitechat:${v.kanaal}:${v.ip}`, 15, 60).catch(() => ({ ok: true }));
  if (!poort.ok) return stroom("Rustig aan, probeer het over een minuut nog eens.", "");

  const vraag = [...v.berichten].reverse().find((b) => b.rol === "gast")?.tekst ?? "";
  if (!vraag) return stroom("Stel gerust je vraag.", "");

  const gesprek = await voegBerichtToe(v.kanaal, v.id, { rol: "gast", tekst: vraag }, { pagina: v.pagina, account: v.account }).catch(() => null);
  if (gesprek && !aiMagAntwoorden(gesprek)) {
    // een medewerker heeft het gesprek; die antwoordt zelf
    return new Response("", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-ZF-Mens": "1" } });
  }
  const bewaar = (tekst: string) => voegBerichtToe(v.kanaal, v.id, { rol: "ai", tekst });

  if (!inspectPrompt(vraag).allowed) {
    logger.warn("sitechat: prompt-injectie geweigerd", { kanaal: v.kanaal });
    return stroom("Daar kan ik niet mee helpen. Stel gerust een vraag over ons aanbod.", "", bewaar);
  }

  const k = await kennis();
  // vervolgvragen ("en op zondag?") krijgen de vorige vraag als context mee
  const vorige = v.berichten.filter((b) => b.rol === "gast").slice(-2, -1)[0]?.tekst ?? "";
  const fragmenten = kiesFragmenten(`${vraag} ${vorige}`, k.fragmenten);
  const terugval = antwoordZonderModel(vraag, k.fragmenten, k.contact);

  await ensureAiNode().catch(() => undefined);
  if (llmConfigProblem()) return stroom(terugval, terugval, bewaar);

  try {
    const gen = chatStream({
      purpose: "public-chat",
      model: fastModel(),
      temperature: 0.3,
      maxTokens: 320,
      retry: false,
      messages: [
        { role: "system", content: bouwSysteem({ bedrijf: k.bedrijf, omschrijving: k.omschrijving, ...(k.regels ? { regels: k.regels } : {}) }, fragmenten) },
        ...v.berichten.slice(-10).map((b) => ({ role: b.rol === "gast" ? ("user" as const) : ("assistant" as const), content: b.tekst.slice(0, 1500) })),
      ],
    });
    return stroom(gen, terugval, bewaar);
  } catch (err) {
    logger.warn("sitechat: model niet bereikbaar", { error: (err as Error).message });
    return stroom(terugval, terugval, bewaar);
  }
}

/**
 * Hetzelfde antwoord als één tekst, voor klantsites zonder scripts (formulier →
 * pagina). Bewaart vraag en antwoord in het gesprek. "mens" = een medewerker
 * heeft het gesprek, dan antwoordt de assistent niet; "limiet" = te veel vragen.
 */
export async function chatAntwoordTekst(
  v: ChatVerzoek,
  kennis: () => Promise<Kennis> | Kennis,
): Promise<{ status: "ok" | "mens" | "limiet"; tekst: string }> {
  const poort = await fixedWindow(`rl:sitechat:${v.kanaal}:${v.ip}`, 15, 60).catch(() => ({ ok: true }));
  if (!poort.ok) return { status: "limiet", tekst: "" };
  const vraag = [...v.berichten].reverse().find((b) => b.rol === "gast")?.tekst ?? "";
  if (!vraag) return { status: "ok", tekst: "" };

  const gesprek = await voegBerichtToe(v.kanaal, v.id, { rol: "gast", tekst: vraag }, { pagina: v.pagina, account: v.account });
  if (!aiMagAntwoorden(gesprek)) return { status: "mens", tekst: "" };
  const bewaar = async (tekst: string) => {
    await voegBerichtToe(v.kanaal, v.id, { rol: "ai", tekst });
    return { status: "ok" as const, tekst };
  };
  if (!inspectPrompt(vraag).allowed) return bewaar("Daar kan ik niet mee helpen. Stel gerust een vraag over ons aanbod.");

  const k = await kennis();
  const historie = gesprek.berichten.filter((b) => b.rol === "gast" || b.rol === "ai").slice(-10);
  const vorige = historie.filter((b) => b.rol === "gast").slice(-2, -1)[0]?.tekst ?? "";
  const fragmenten = kiesFragmenten(`${vraag} ${vorige}`, k.fragmenten);
  const terugval = antwoordZonderModel(vraag, k.fragmenten, k.contact);

  await ensureAiNode().catch(() => undefined);
  if (llmConfigProblem()) return bewaar(terugval);
  try {
    const r = await chat({
      purpose: "public-chat",
      model: fastModel(),
      temperature: 0.3,
      maxTokens: 320,
      retry: false,
      timeoutMs: 25_000,
      messages: [
        { role: "system", content: bouwSysteem({ bedrijf: k.bedrijf, omschrijving: k.omschrijving, ...(k.regels ? { regels: k.regels } : {}) }, fragmenten) },
        ...historie.map((b) => ({ role: b.rol === "gast" ? ("user" as const) : ("assistant" as const), content: b.tekst.slice(0, 1500) })),
      ],
    });
    return bewaar(r.text.trim() || terugval);
  } catch (err) {
    logger.warn("sitechat: model niet bereikbaar", { error: (err as Error).message });
    return bewaar(terugval);
  }
}
