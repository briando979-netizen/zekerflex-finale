import { bsnVoorstelPatch, bsnVoorstelVerlopen, heeftBsnVoorstel, ZONDER_BSN_VOORSTEL, type BsnVoorstel } from "@/lib/kyc/bsn-uit-document";
import { FISCAL_KV_PREFIX, getFiscal, setFiscal, type FiscalProfile } from "@/lib/fiscal/store";
import { kvListEntries } from "@/lib/storage/kv";
import { retentionCutoff } from "@/lib/privacy/retention";

/**
 * Bewaart het BSN van het document als voorstel bij de fiscale gegevens; de werker bevestigt het daarna zelf
 * (components/app/GegevensMist.tsx). Alleen bij een uitzendkracht zonder BSN (bsnVoorstelPatch). Nooit de cijfers zelf.
 */
export async function bewaarBsnVoorstel(userId: string, voorstel: BsnVoorstel | null, nu: Date = new Date()): Promise<boolean> {
  if (!voorstel) return false;
  const patch = bsnVoorstelPatch(await getFiscal(userId), voorstel, nu);
  if (!patch) return false;
  await setFiscal(userId, patch);
  return true;
}

/**
 * Heeft een voorstel zin? Alleen bij een uitzendkracht die nog geen BSN heeft (dezelfde regel als bsnVoorstelPatch).
 * Zo zoekt de QR-lezer (lib/kyc/bsn-qr.ts) alleen als er iets mee te doen is.
 */
export async function wilBsnVoorstel(userId: string): Promise<boolean> {
  const f = await getFiscal(userId);
  return f.workerKind === "uitzendkracht" && !f.bsnHash;
}

/** Bij het wissen van een account: het onbevestigde voorstel weg, de rest van fiscal (bewaarplicht) blijft. */
export async function wisBsnVoorstelVan(userId: string): Promise<boolean> {
  if (!heeftBsnVoorstel(await getFiscal(userId))) return false;
  await setFiscal(userId, ZONDER_BSN_VOORSTEL);
  return true;
}

/** Retentie-sweep: voorstellen ouder dan de regel bsn_voorstel (30 dagen) weg. Geeft het aantal terug. */
export async function ruimBsnVoorstellenOp(nu: Date, dryRun: boolean): Promise<number> {
  const grens = retentionCutoff("bsn_voorstel", nu);
  if (!grens) return 0;
  const oud = (await kvListEntries<Partial<FiscalProfile>>(FISCAL_KV_PREFIX, 10_000)).filter(
    (r) => r.value && typeof r.value === "object" && bsnVoorstelVerlopen(r.value, grens),
  );
  if (dryRun) return oud.length;
  for (const r of oud) await setFiscal(r.key.slice(FISCAL_KV_PREFIX.length), ZONDER_BSN_VOORSTEL);
  return oud.length;
}
