import { fetchPage } from "@/lib/website-check/fetch";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { setLinkVoorbeeld, type ChatMessage } from "@/lib/messaging/store";
import { leesVoorbeeld, voorbeeldLink } from "@/lib/messaging/link-voorbeeld";

// Na het versturen (after() in de verzendroute): het voorbeeld van de eerste link ophalen en in het bericht zetten; de
// volgende poll laat het zien. Via fetchPage, dus nooit een adres binnen ons eigen netwerk (ook niet via een redirect).
// Mislukt het, dan gewoon geen voorbeeld. De link zelf komt nooit in een log (hij kan iets geheims bevatten).

const LINK_TIJD_MS = 4_000;
const LINK_MAX_BYTES = 400_000;
const USER_AGENT = "ZekerFlex-linkvoorbeeld/1.0 (+https://zekerflex.com)";

export async function maakLinkVoorbeeld(threadId: string, msg: ChatMessage): Promise<void> {
  if (msg.kind !== "text" || !msg.text || msg.from === "system") return;
  const url = voorbeeldLink(msg.text);
  if (!url) return;
  try {
    await enforceRateLimit({ name: "chat-linkvoorbeeld", identifier: msg.from, limit: 30, windowSeconds: 600, message: "te veel linkvoorbeelden" });
  } catch {
    return; // veel links achter elkaar: dan zonder voorbeeld
  }
  try {
    const pagina = await fetchPage(url, { timeoutMs: LINK_TIJD_MS, maxBytes: LINK_MAX_BYTES, maxRedirects: 3, userAgent: USER_AGENT });
    if (pagina.status >= 400 || !(pagina.headers["content-type"] ?? "").toLowerCase().includes("text/html")) return;
    const v = leesVoorbeeld(pagina.body, pagina.finalUrl || url);
    if (v) await setLinkVoorbeeld(threadId, msg.id, msg.text, v);
  } catch (err) {
    logger.info("chat: geen linkvoorbeeld", { host: new URL(url).hostname, error: (err as Error).message.slice(0, 120) });
  }
}
