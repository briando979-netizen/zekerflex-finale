import QRCode from "qrcode";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { geldigeJid, type LiveGesprek, type LiveGesprekKort, type LiveStand } from "@/lib/whatsapp/live";

// ---------------------------------------------------------------------------
// De app praat met de WhatsApp-brug (deploy/whatsapp-brug, alleen op het interne netwerk, met WHATSAPP_BRUG_TOKEN).
// Admin → WhatsApp: koppelen met een code die je met je eigen WhatsApp scant, en daarna de gesprekken live
// (15 nov 2026, eigenaar). De berichten staan in de brug (zijn volume), niet in de database van de app.
// ---------------------------------------------------------------------------

export function brugIngericht(): boolean {
  return Boolean(env.WHATSAPP_BRUG_URL && env.WHATSAPP_BRUG_TOKEN);
}

async function brug(pad: string, init: { method?: "GET" | "POST"; body?: unknown; tekst?: boolean } = {}): Promise<unknown> {
  if (!brugIngericht()) throw AppError.precondition("De WhatsApp-koppeling staat nog niet aan op de server.");
  let res: Response;
  try {
    res = await fetch(`${env.WHATSAPP_BRUG_URL!.replace(/\/+$/, "")}${pad}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${env.WHATSAPP_BRUG_TOKEN!}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw AppError.upstream("De WhatsApp-koppeling is nu niet bereikbaar. Probeer het zo opnieuw.");
  }
  if (init.tekst) return res.text();
  const data = (await res.json().catch(() => ({}))) as { fout?: string };
  if (!res.ok) {
    if (res.status === 404) throw AppError.notFound("Dit gesprek staat niet (meer) in de koppeling.");
    if (res.status === 503) throw AppError.precondition("WhatsApp is niet verbonden; scan eerst de koppelcode.");
    if (res.status === 422) throw AppError.validation("Kies een gesprek en typ een bericht.");
    throw AppError.upstream("De WhatsApp-koppeling gaf een fout. Probeer het zo opnieuw.");
  }
  return data;
}

export async function liveStand(): Promise<LiveStand> {
  if (!brugIngericht()) return { ingericht: false, verbonden: false, wachtOpQr: false, qrSvg: null, gesprekken: 0 };
  const g = (await brug("/gezond")) as { verbonden?: boolean; wachtOpQr?: boolean; gesprekken?: number };
  let qrSvg: string | null = null;
  if (!g.verbonden && g.wachtOpQr) {
    const code = String(await brug("/qr", { tekst: true }));
    // de brug geeft een uitleg in gewone tekst zolang er nog geen code is
    if (code.length > 40 && !/\s/.test(code)) qrSvg = await QRCode.toString(code, { type: "svg", margin: 1, width: 264, errorCorrectionLevel: "M" });
  }
  return { ingericht: true, verbonden: Boolean(g.verbonden), wachtOpQr: Boolean(g.wachtOpQr), qrSvg, gesprekken: Number(g.gesprekken) || 0 };
}

export async function liveGesprekken(): Promise<LiveGesprekKort[]> {
  const d = (await brug("/gesprekken")) as { gesprekken?: LiveGesprekKort[] };
  return Array.isArray(d.gesprekken) ? d.gesprekken.filter((g) => geldigeJid(g.jid)) : [];
}

export async function liveGesprek(jid: string): Promise<LiveGesprek> {
  if (!geldigeJid(jid)) throw AppError.validation("Onbekend gesprek.");
  return (await brug(`/gesprekken/${encodeURIComponent(jid)}`)) as LiveGesprek;
}

export async function liveStuur(jid: string, tekst: string): Promise<void> {
  if (!geldigeJid(jid)) throw AppError.validation("Onbekend gesprek.");
  await brug("/stuur", { method: "POST", body: { jid, tekst } });
}

export async function liveUitloggen(): Promise<void> {
  await brug("/uitloggen", { method: "POST", body: {} });
}
