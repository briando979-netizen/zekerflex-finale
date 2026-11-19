import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { alertOwner, recentAlerts, type LoggedAlert } from "@/lib/ops/alert";
import { verifyAuditChain } from "@/lib/audit-chain";
import { telSignalen, tijdlijn, type Signaal, type SignaalTelling } from "@/lib/security/intelligence-regels";

// ---------------------------------------------------------------------------
// ZekerFlex Security Intelligence (19 nov 2026): één plek voor de signalen die
// al los bestonden. Het auditlogboek (categorie SECURITY, mislukte logins en
// inlogslots), de meldingen aan de eigenaar (lib/ops/alert.ts) en de controle
// van de hashketen van het auditlogboek. Die keten werd alleen nagerekend als
// iemand zelf /api/admin/audit/verify opvroeg; nu elke nacht, met een melding
// als hij breekt. CrowdSec heeft zijn eigen paneel op dezelfde pagina.
// ---------------------------------------------------------------------------

const KETEN_KEY = "beveiliging:keten:laatste";

export interface KetenStand {
  at: string;
  ok: boolean;
  checked: number;
  unsealed: number;
  firstBreakSeq: string | null;
}

/** Rekent de hele hashketen na, bewaart de uitslag en meldt een breuk aan de eigenaar. */
export async function controleerKeten(now = new Date()): Promise<KetenStand> {
  const r = await verifyAuditChain();
  const stand: KetenStand = { at: now.toISOString(), ok: r.ok, checked: r.checked, unsealed: r.unsealed, firstBreakSeq: r.firstBreakSeq };
  await kvSet(KETEN_KEY, stand);
  if (!r.ok) {
    await alertOwner({
      key: "beveiliging:keten-gebroken",
      severity: "critical",
      title: "Het auditlogboek klopt niet meer",
      detail: `De nachtelijke controle vond een regel in het auditlogboek die is gewijzigd of ontbreekt (vanaf volgnummer ${r.firstBreakSeq ?? "onbekend"}). Dat hoort nooit te gebeuren: bekijk het in Beheer, Beveiliging.`,
      url: "/admin/beveiliging",
    });
  }
  return stand;
}

export async function ketenStand(): Promise<KetenStand | null> {
  return kvGet<KetenStand>(KETEN_KEY).catch(() => null);
}

export interface BeveiligingsBeeld {
  telling: SignaalTelling;
  tijdlijn: ReturnType<typeof tijdlijn>;
  meldingen: LoggedAlert[];
  keten: KetenStand | null;
  dagen: number;
}

/** Alles voor het scherm: de signalen van de laatste dagen, de meldingen en de stand van de keten. Een bron die stuk is, telt niet mee. */
export async function beveiligingsBeeld(now = new Date(), dagen = 7): Promise<BeveiligingsBeeld> {
  const sinds = new Date(now.getTime() - dagen * 86_400_000);
  const [rijen, meldingen, keten] = await Promise.all([
    prisma.auditLog
      .findMany({
        where: { createdAt: { gte: sinds }, OR: [{ category: "SECURITY" }, { action: { in: ["auth.login.failed", "auth.login.locked"] } }] },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: { id: true, createdAt: true, category: true, action: true, severity: true, summary: true },
      })
      .catch(() => []),
    recentAlerts(15).catch(() => [] as LoggedAlert[]),
    ketenStand(),
  ]);
  const signalen: Signaal[] = rijen.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), category: r.category, action: r.action, severity: r.severity, summary: r.summary }));
  return { telling: telSignalen(signalen, now.getTime()), tijdlijn: tijdlijn(signalen), meldingen, keten, dagen };
}
