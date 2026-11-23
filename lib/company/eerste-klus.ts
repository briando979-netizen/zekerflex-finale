// ---------------------------------------------------------------------------
// Een bedrijf dat nog niet is gecontroleerd zet zijn klus meteen live (23 nov 2026, eigenaar: net als YoungOnes). Beheer moet
// dat wel kunnen zien: een melding bij de eerste klus van zo'n bedrijf, met een link naar Admin → Bedrijven. Daar staan de
// klussen en kan een klus met één klik naar concept (en weer live). Een bedrijf van de eigenaar zelf (eigen test) en een
// testadres krijgen geen melding. Best-effort: dit mag het plaatsen van een klus nooit laten mislukken.
// ---------------------------------------------------------------------------

/**
 * `net`: hoeveel klussen er zojuist zijn gemaakt (een reeks dagen telt als één plaatsing). Het is de eerste plaatsing als het
 * bedrijf niet meer klussen heeft dan dat.
 */
export async function meldEersteKlusVanNieuwBedrijf(tenantId: string, titel: string, net: number): Promise<void> {
  try {
    const { isTenantVerified } = await import("@/lib/company/verified");
    if (await isTenantVerified(tenantId)) return;
    const { prisma } = await import("@/lib/prisma");
    const heeft = await prisma.shift.count({ where: { branch: { tenantId }, status: { not: "CANCELLED" } } });
    if (heeft > net) return;
    const [tenant, beheerder] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.membership.findFirst({ where: { tenantId, role: "HQ_ADMIN" }, select: { user: { select: { email: true } } } }),
    ]);
    const [{ leesEigenTest }, { isEigenTestBedrijf, isInternAdres }] = await Promise.all([import("@/lib/admin/eigen-test"), import("@/lib/admin/eigen-test-regel")]);
    // een testadres of een adres van ZekerFlex zelf, en een bedrijf dat de eigenaar als eigen test markeerde: geen melding
    if (beheerder && isInternAdres(beheerder.user.email)) return;
    if (isEigenTestBedrijf(await leesEigenTest(), tenantId)) return;
    const { alertOwnerLater } = await import("@/lib/ops/alert");
    alertOwnerLater({
      key: `bedrijf-eerste-klus:${tenantId}`,
      title: `Nieuw bedrijf zette een klus live: ${tenant?.name ?? "onbekend bedrijf"}`,
      detail: `"${titel}" staat live voor werkers. Het bedrijf is nog niet gecontroleerd: inplannen kan pas na jouw controle. Kijk mee, en zet de klus zo nodig terug naar concept (Admin → Bedrijven → het bedrijf → Klussen).`,
      severity: "warning",
      url: `/admin/bedrijven/${tenantId}`,
    });
  } catch {
    // een melding aan Beheer mag een klus nooit tegenhouden
  }
}
