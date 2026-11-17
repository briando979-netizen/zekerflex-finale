import { requirePrincipal } from "@/lib/auth";
import { getFiscal, fiscaalVoorKlant, invoiceModeFor } from "@/lib/fiscal/store";
import { prisma } from "@/lib/prisma";
import { schoonKvk, zakelijkeWerkvorm } from "@/lib/fiscal/formulier";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { PageHeader } from "@/components/app/ui";
import { FiscalForm } from "@/components/app/FiscalForm";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FiscaalPage() {
  const principal = await requirePrincipal();
  const fiscal = await getFiscal(principal.userId);
  const f = (await getFreelancerDict()).fiscaalForm;
  // wat de aanmelding al bij het profiel bewaarde (KVK en btw): Fiscaal toont het als "al ingevuld", niet als tweede invoer
  const profiel = await prisma.freelancerProfile
    .findUnique({
      where: { userId: principal.userId },
      select: { kvkNumber: true, vatNumber: true, kvkValid: true, companyRegistration: { select: { tradeName: true, legalName: true } } },
    })
    .catch(() => null);
  // de naam uit een gecontroleerde KVK-inschrijving: alleen om de bedrijfsnaam voor te vullen als de werker er nooit een invulde
  const kvkNaam = profiel?.kvkValid ? (profiel.companyRegistration?.tradeName || profiel.companyRegistration?.legalName || "") : "";
  // zzp'er en flexwerker: "Zakelijke gegevens" (17 nov 2026); een uitzendkracht of wie nog niet koos houdt de oude titel
  const zakelijk = zakelijkeWerkvorm(fiscal.workerKind);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallbackHref="/dashboard/account" label={f.terug} />
      <PageHeader
        title={zakelijk ? f.titelZakelijk : f.titel}
        subtitle={zakelijk ? f.subtitelZakelijk : f.subtitel}
      />
      <FiscalForm
        initial={fiscaalVoorKlant(fiscal)}
        defaultKind={fiscal.workerKind}
        facturatie={invoiceModeFor(fiscal)}
        profiel={{ kvkNumber: schoonKvk(profiel?.kvkNumber), vatNumber: profiel?.vatNumber ?? "", kvkNaam }}
        vandaag={amsterdamDayKey(new Date())}
      />
    </div>
  );
}
