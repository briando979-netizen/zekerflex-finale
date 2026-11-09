import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { zzpGeschikt } from "@/lib/matching/onderneming";

// ---------------------------------------------------------------------------
// Mag deze werker deze klus doen? Eén regel voor de matching (lib/matching/
// engine.ts, planner, spoedoproep, geo-push) én het overnemen van een klus
// (lib/replacements/reassign.ts, app/api/me/replacement/respond). Een los
// bestand, zodat die laatste niet de hele matching (Redis-slot, meldingen)
// hoeven mee te laden.
// ---------------------------------------------------------------------------

/**
 * vatValid/kvkValid qualifies a zzp'er/flexwerker — but an uitzendkracht has
 * neither by design (ZekerFlex is their employer, no KVK/btw needed), so a
 * plain vatValid+kvkValid filter would exclude every uitzendkracht from ever
 * being auto-matched at all. workerKind lives in the fiscal KV store, not a
 * DB column, so that lookup only runs for candidates who need it: not
 * zzp-eligible, or the shift is reserved for uitzendkrachten outright.
 * A zzp'er from abroad without a KVK counts through a valid EU VAT number
 * (VIES) instead: lib/matching/onderneming.ts.
 *
 * Dus: een gewone klus kan naar een zzp'er met een geldige inschrijving of naar
 * een uitzendkracht; een klus via het uitzendbureau alleen naar een uitzendkracht.
 */
export async function isMatchEligibleWorker(
  profile: { userId: string; vatValid: boolean; kvkValid: boolean; country: string },
  viaUitzendbureau: boolean,
): Promise<boolean> {
  const zzpEligible = zzpGeschikt(profile);
  if (zzpEligible && !viaUitzendbureau) return true;
  const fiscal = await getFiscal(profile.userId);
  return invoiceModeFor(fiscal) === "payroll";
}
