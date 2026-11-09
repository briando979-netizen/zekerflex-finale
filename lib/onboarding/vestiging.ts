// ---------------------------------------------------------------------------
// Veldcontrole van de eerste vestiging in de werkgeverwizard (pure functies:
// server-actie én browser). De server blijft leidend (employerOnboardingSchema
// in lib/onboarding/employer.ts); dit geeft alleen per veld een melding in
// gewoon Nederlands (de standaardmeldingen van zod zijn Engels).
// ---------------------------------------------------------------------------

export type VestigingVeld = "kvkNumber" | "branchName" | "addressLine" | "postalCode" | "houseNumber";
export type VestigingFouten = Partial<Record<VestigingVeld, string>>;

export const VESTIGING_MELDING: Record<VestigingVeld, string> = {
  kvkNumber: "Vul een KVK-nummer in (8 cijfers).",
  branchName: "Geef de vestiging een naam, bijvoorbeeld Amsterdam Centrum.",
  addressLine: "Vul het adres in: straat en huisnummer.",
  postalCode: "Vul een geldige postcode in, bijvoorbeeld 1012 AB.",
  houseNumber: "Vul het huisnummer in.",
};

/** Melding voor één veld, of null als het veld goed is. */
export function controleerVestigingVeld(veld: VestigingVeld, waarde: string): string | null {
  const v = waarde.trim();
  const ok =
    veld === "kvkNumber"
      ? v.replace(/[^\d]/g, "").length >= 6 && v.length <= 20
      : veld === "branchName"
        ? v.length >= 2 && v.length <= 120
        : veld === "addressLine"
          ? v.length >= 3 && v.length <= 160
          : veld === "postalCode"
            ? /^\s*\d{4}\s*[A-Za-z]{2}\s*$/.test(v)
            : v.length >= 1 && v.length <= 12;
  return ok ? null : VESTIGING_MELDING[veld];
}

export function controleerVestiging(waarden: Record<VestigingVeld, string>): VestigingFouten {
  const uit: VestigingFouten = {};
  for (const k of Object.keys(VESTIGING_MELDING) as VestigingVeld[]) {
    const m = controleerVestigingVeld(k, waarden[k] ?? "");
    if (m) uit[k] = m;
  }
  return uit;
}
