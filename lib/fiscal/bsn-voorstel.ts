import { bsnVoorstelPatch, type BsnVoorstel } from "@/lib/kyc/bsn-uit-document";
import { getFiscal, setFiscal } from "@/lib/fiscal/store";

/**
 * Bewaart het BSN van het document als voorstel bij de fiscale gegevens; de werker bevestigt het daarna zelf
 * (components/app/GegevensMist.tsx). Alleen bij een uitzendkracht zonder BSN (bsnVoorstelPatch). Nooit de cijfers zelf.
 */
export async function bewaarBsnVoorstel(userId: string, voorstel: BsnVoorstel | null): Promise<boolean> {
  if (!voorstel) return false;
  const patch = bsnVoorstelPatch(await getFiscal(userId), voorstel);
  if (!patch) return false;
  await setFiscal(userId, patch);
  return true;
}
