import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mailButton, mailShell, sendMail } from "@/lib/mail";
import { bonToken } from "@/lib/shop/bon-token";

// De mail "Je bestelling is onderweg" (18 nov 2026 losgetrokken uit app/api/shop/orders/[id]): één tekst voor een
// beheerder die zelf een track & trace invult én voor de CJ-koppeling die er een van de leverancier krijgt
// (lib/shop/cj/bestelling.ts). Best-effort: gooit nooit.

export interface VerzondenBestelling {
  id: string;
  email: string;
  firstName: string;
  carrier: string | null;
  trackingNumber: string | null;
}

export async function stuurVerzondenMail(order: VerzondenBestelling, o: { levertijd?: string | null } = {}): Promise<void> {
  const trackUrl = `${env.APP_BASE_URL.replace(/\/+$/, "")}/shop/bestelling/${order.id}?t=${bonToken(order.id)}`;
  const via = order.carrier ? ` via ${order.carrier}` : "";
  const code = order.trackingNumber ? ` (track & trace: ${order.trackingNumber})` : "";
  const levertijd = o.levertijd ? ` De verwachte levertijd is ${o.levertijd}.` : "";
  await sendMail({
    to: order.email,
    from: env.MAIL_FROM,
    kind: "shop-order-bevestiging",
    subject: "Je bestelling is onderweg",
    text: `Hoi ${order.firstName},\n\nJe bestelling is verzonden${via}${code}.${levertijd}\n\nVolg 'm live: ${trackUrl}\n\nBinnen? Op dezelfde pagina kun je je aankoop beoordelen; daar help je andere kopers mee.\n\nBestelreferentie: ${order.id}`,
    html: mailShell(
      "Je bestelling is onderweg",
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3C4A42">Hoi ${order.firstName}, je bestelling is verzonden${via}${code}.${levertijd}</p>
       <p style="margin:0 0 20px">${mailButton(trackUrl, "Volg je bestelling live")}</p>
       <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3C4A42">Binnen? Op dezelfde pagina kun je je aankoop beoordelen; daar help je andere kopers mee.</p>
       <p style="margin:12px 0 0;font-size:12px;color:#667469">Referentie: ${order.id}</p>`,
    ),
  }).catch((e) => logger.warn("shop order shipped mail failed", { error: (e as Error).message }));
}
