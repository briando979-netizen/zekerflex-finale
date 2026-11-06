import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { kvGet, kvGetMany, kvListValues, kvSet } from "@/lib/storage/kv";
import { efactuurDocument, type EfactuurDocument } from "@/lib/efactuur/factuur";
import { efactuurInstellingen, peppolIngesteld } from "@/lib/efactuur/instellingen";

// ---------------------------------------------------------------------------
// Bezorging van e-facturen, in deze volgorde:
//   1. Peppol — als er een toegangspunt is ingesteld (PEPPOL_AP_URL) én de
//      koper een Peppol-adres heeft (eigen ID, KVK of btw);
//   2. mail — de UBL als bijlage naar het boekhoudpakket (ontvangstEmail) of
//      anders het factuuradres van het bedrijf;
//   3. anders blijft hij "klaar": te downloaden via /api/invoices/<id>/ubl.
// De stand per factuur staat in KV efactuur:<invoiceId>, zodat het bedrijf en
// de beheerder zien wat er met elke factuur gebeurd is. Nooit twee keer
// versturen via Peppol: een verzonden factuur wordt alleen opnieuw gestuurd
// als iemand daar bewust om vraagt (opnieuw: true).
// ---------------------------------------------------------------------------

export type EfactuurStatus = "klaar" | "verstuurd" | "mislukt" | "ongeldig";

export interface EfactuurStand {
  invoiceId: string;
  nummer: string;
  tenantId: string | null;
  status: EfactuurStatus;
  via: "peppol" | "mail" | null;
  /** Peppol-adres of mailadres waar hij heen ging */
  ontvanger: string | null;
  at: string;
  pogingen: number;
  fouten: string[];
  /** wie het versturen startte: "automatisch" of een gebruikers-id */
  door: string;
}

const KEY = (invoiceId: string) => `efactuur:${invoiceId}`;

export async function efactuurStand(invoiceId: string): Promise<EfactuurStand | null> {
  return kvGet<EfactuurStand>(KEY(invoiceId));
}

export async function efactuurStanden(invoiceIds: string[]): Promise<Map<string, EfactuurStand>> {
  const rows = await kvGetMany<EfactuurStand>(invoiceIds.map(KEY));
  return new Map(invoiceIds.flatMap((id) => (rows.get(KEY(id)) ? [[id, rows.get(KEY(id))!] as const] : [])));
}

/** Alle standen (beheer), nieuwste eerst. */
export async function alleEfactuurStanden(limit = 500): Promise<EfactuurStand[]> {
  const rows = await kvListValues<EfactuurStand>("efactuur:", limit);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
}

async function viaPeppol(doc: EfactuurDocument): Promise<{ ok: boolean; fout?: string }> {
  const url = env.PEPPOL_AP_URL;
  if (!url || !env.PEPPOL_AP_TOKEN) return { ok: false, fout: "Geen Peppol-toegangspunt ingesteld." };
  const ontvanger = doc.koperPeppolId ?? (doc.factuur.koper.kvk ? `0106:${doc.factuur.koper.kvk}` : doc.factuur.koper.btw ? `9944:${doc.factuur.koper.btw}` : null);
  if (!ontvanger) return { ok: false, fout: "De koper heeft geen Peppol-adres." };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PEPPOL_AP_TOKEN}`,
        "Content-Type": "application/xml; charset=utf-8",
        "X-Peppol-Receiver": ontvanger,
        ...(env.PEPPOL_SENDER_ID ? { "X-Peppol-Sender": env.PEPPOL_SENDER_ID } : {}),
        "X-Document-Id": doc.nummer,
      },
      body: doc.xml,
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { ok: false, fout: `Toegangspunt antwoordde ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, fout: `Toegangspunt niet bereikbaar: ${(e as Error).message}` };
  }
}

async function viaMail(doc: EfactuurDocument, naar: string): Promise<{ ok: boolean; fout?: string }> {
  const r = await sendMail({
    to: naar,
    kind: "invoice",
    subject: `E-factuur ${doc.nummer} (UBL)`,
    text: [
      `In de bijlage staat factuur ${doc.nummer} als e-factuur (UBL 2.1, Peppol BIS 3 / NLCIUS).`,
      `Lees het bestand ${doc.bestandsnaam} in met je boekhoudpakket; de pdf en het overzicht staan in je ZekerFlex-account onder Facturen.`,
    ].join("\n\n"),
    attachments: [{ filename: doc.bestandsnaam, contentType: "application/xml", content: doc.xml }],
  });
  return r.delivered || r.transport === "mailbox" ? { ok: true } : { ok: false, fout: r.error ?? "Mail niet afgeleverd." };
}

export interface VerstuurOpties {
  /** wie het startte (voor het logboek) */
  door?: string;
  /** ook als hij al verstuurd is */
  opnieuw?: boolean;
}

/** Verstuur (of maak klaar) de e-factuur van één factuur en bewaar de stand. */
export async function verstuurEfactuur(invoiceId: string, opts: VerstuurOpties = {}): Promise<EfactuurStand> {
  const door = opts.door ?? "automatisch";
  const eerder = await efactuurStand(invoiceId);
  if (eerder?.status === "verstuurd" && !opts.opnieuw) return eerder;

  const doc = await efactuurDocument(invoiceId);
  const basis = { invoiceId, at: new Date().toISOString(), pogingen: (eerder?.pogingen ?? 0) + 1, door };
  if (!doc) {
    const stand: EfactuurStand = { ...basis, nummer: eerder?.nummer ?? invoiceId, tenantId: null, status: "ongeldig", via: null, ontvanger: null, fouten: ["Factuur niet gevonden of zonder zakelijke ontvanger."] };
    await kvSet(KEY(invoiceId), stand);
    return stand;
  }
  if (doc.fouten.length > 0) {
    const stand: EfactuurStand = { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "ongeldig", via: null, ontvanger: null, fouten: doc.fouten };
    await kvSet(KEY(invoiceId), stand);
    logger.warn("e-factuur ongeldig", { invoiceNumber: doc.nummer, fouten: doc.fouten.length });
    return stand;
  }

  let stand: EfactuurStand;
  if (peppolIngesteld() && doc.peppolKlaar) {
    const r = await viaPeppol(doc);
    stand = r.ok
      ? { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "verstuurd", via: "peppol", ontvanger: doc.koperPeppolId ?? `0106:${doc.factuur.koper.kvk ?? ""}`, fouten: [] }
      : { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "mislukt", via: "peppol", ontvanger: doc.koperPeppolId, fouten: [r.fout ?? "Onbekende fout"] };
  } else {
    const extra = doc.tenantId ? await getOrgProfileExtra(doc.tenantId) : {};
    const naar = doc.koperEmail ?? extra.billingEmail ?? null;
    if (naar) {
      const r = await viaMail(doc, naar);
      stand = r.ok
        ? { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "verstuurd", via: "mail", ontvanger: naar, fouten: [] }
        : { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "mislukt", via: "mail", ontvanger: naar, fouten: [r.fout ?? "Onbekende fout"] };
    } else {
      stand = { ...basis, nummer: doc.nummer, tenantId: doc.tenantId, status: "klaar", via: null, ontvanger: null, fouten: [] };
    }
  }
  await kvSet(KEY(invoiceId), stand);
  if (stand.status === "mislukt") logger.warn("e-factuur versturen mislukt", { invoiceNumber: doc.nummer, via: stand.via, reason: stand.fouten[0] ?? "" });
  if (stand.status === "verstuurd") {
    await recordAudit({
      category: "BILLING",
      action: "invoice.efactuur.sent",
      actorLabel: door === "automatisch" ? "system" : "user",
      ...(door !== "automatisch" ? { actorUserId: door } : {}),
      summary: `E-factuur ${doc.nummer} verstuurd via ${stand.via}`,
      targetType: "invoice",
      targetId: invoiceId,
      metadata: { via: stand.via, pogingen: stand.pogingen },
    });
  }
  return stand;
}

/**
 * Na het uitgeven van een factuur: meteen versturen als het bedrijf dat heeft
 * aangezet. Nooit blokkerend voor de goedkeuring van uren; een fout komt in het
 * foutenlogboek en de stand.
 */
export async function efactuurNaUitgifte(invoiceId: string, tenantId: string): Promise<void> {
  try {
    const s = await efactuurInstellingen(tenantId);
    if (!s.automatisch) return;
    await verstuurEfactuur(invoiceId);
  } catch (err) {
    logger.warn("e-factuur na uitgifte mislukt", { invoiceId, error: (err as Error).message });
  }
}
