import { kvGet, kvSet } from "@/lib/storage/kv";
import { recordAudit } from "@/lib/audit";
import { LEGE_EIGEN_TEST, leesEigenTestWaarde, schakelEigenTest, type EigenTest } from "@/lib/admin/eigen-test-kern";

// ---------------------------------------------------------------------------
// De set "eigen test" (lib/admin/eigen-test-kern.ts) in KV: één systeemsleutel met tenant- en user-id's (op de basislijn van
// tests/kv-avg-bewaker.test.ts: een lijst van het beheer, geen gegevens over de persoon). Lezen gaat vaak (matching,
// klussenlijst, trechters), dus 60 seconden in het geheugen (globalThis: Next bundelt routes apart); schakelen wist die cache.
// Alleen het beheer schakelt (PLATFORM_ADMIN, app/api/admin/eigen-test/route.ts), altijd met een regel in de audit.
// ---------------------------------------------------------------------------

export const EIGEN_TEST_SLEUTEL = "systeem:eigen-test";
const CACHE_MS = 60_000;
const geheugen = globalThis as unknown as { __zfEigenTest?: { at: number; et: EigenTest } | undefined };

/** De set; een storing geeft een lege set (dan telt alles gewoon mee, zoals vóór de schakelaar). */
export async function leesEigenTest(nu: number = Date.now()): Promise<EigenTest> {
  const c = geheugen.__zfEigenTest;
  if (c && nu - c.at >= 0 && nu - c.at < CACHE_MS) return c.et;
  try {
    const et = leesEigenTestWaarde(await kvGet<unknown>(EIGEN_TEST_SLEUTEL));
    geheugen.__zfEigenTest = { at: nu, et };
    return et;
  } catch {
    return LEGE_EIGEN_TEST;
  }
}

/** Zet een bedrijf of account aan of uit als eigen test, met een regel in de audit. */
export async function zetEigenTest(
  soort: "tenant" | "user",
  id: string,
  aan: boolean,
  door: { userId: string },
  nu: Date = new Date(),
): Promise<EigenTest> {
  const oud = leesEigenTestWaarde(await kvGet<unknown>(EIGEN_TEST_SLEUTEL));
  const nieuw = schakelEigenTest(oud, soort, id, aan, nu);
  await kvSet(EIGEN_TEST_SLEUTEL, nieuw);
  geheugen.__zfEigenTest = undefined;
  await recordAudit({
    category: "ADMIN",
    action: aan ? "eigen-test.aan" : "eigen-test.uit",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: `${soort === "tenant" ? "Bedrijf" : "Account"} ${aan ? "gemarkeerd als" : "niet meer"} eigen test (telt niet mee)`,
    targetType: soort,
    targetId: id,
  });
  return nieuw;
}
