import Link from "next/link";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { logoutAction } from "@/lib/auth/actions";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { tenantVerification } from "@/lib/company/verified";
import { mailPrefsView } from "@/lib/mail/prefs";
import { landNaam } from "@/lib/onboarding/buitenland";
import { payUrl } from "@/lib/billing/pay-link";
import { getDict } from "@/lib/i18n/server";
import type { StudioSoort } from "@/lib/studio/account";
import { updateEmployerPersonalInfoAction } from "@/app/werkgever/account/actions";
import { Card, PageHead, Pill, Stat, btn } from "@/components/studio/ui";
import { money } from "@/components/app/ui";
import { KvkFormulier } from "@/components/studio/account/KvkFormulier";
import { MailPrefsToggles } from "@/components/marketing/MailPrefsToggles";
import { BillingPrefsForm } from "@/components/app/BillingPrefsForm";
import { InvoicesOverview, type InvoiceRow } from "@/components/app/InvoicesOverview";
import { TeamBoard } from "@/components/app/TeamBoard";
import { EmployerMailbox } from "@/components/app/EmployerMailbox";
import { PersonalInfoForm } from "@/components/app/PersonalInfoForm";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { PasskeySettings } from "@/components/auth/PasskeySettings";

// ---------------------------------------------------------------------------
// De accountschermen van de studio (lib/studio/account.ts): wat bij een webshop of website hoort,
// zonder klussen, flexwerkers, uren of snelle uitbetaling. Gegevens en API's zijn die van het
// bedrijf (dezelfde als in /werkgever): niets wordt dubbel bewaard.
// ---------------------------------------------------------------------------

const naamVan = (soort: StudioSoort) => (soort === "webshop" ? "webshop" : "website");

function Regel({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt className="text-sm text-[#616161]">{label}</dt>
      <dd className="text-sm font-semibold text-[#1a1a1a]">{waarde}</dd>
    </div>
  );
}

/** Studio → Bedrijf: de gegevens van het bedrijf, verifiëren (KVK), en welke mails je krijgt. */
export async function BedrijfScherm({ soort }: { soort: StudioSoort }) {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) {
    return (
      <>
        <PageHead title="Bedrijf" />
        <Card>
          <p className="text-sm text-[#616161]">Er hoort nog geen bedrijf bij je account.</p>
        </Card>
      </>
    );
  }
  const [tenant, vestiging, verificatie, mail] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, kvkNumber: true, country: true, vatNumber: true } }),
    prisma.branch.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { addressLine: true, postalCode: true, city: true } }),
    tenantVerification(tenantId),
    mailPrefsView(principal.email),
  ]);
  const land = tenant?.country ?? "NL";
  const status = verificatie.verified
    ? { tone: "ok" as const, label: "Geverifieerd", tekst: "Je bedrijf is gecontroleerd. Klanten zien dat ze bij een echt bedrijf kopen." }
    : verificatie.inControle
      ? { tone: "info" as const, label: "In controle", tekst: "Je gegevens kloppen. We controleren nog of je bij dit bedrijf hoort, meestal binnen een werkdag; je krijgt bericht." }
      : { tone: "warn" as const, label: "Nog niet geverifieerd", tekst: `Verifieer je bedrijf met je KVK-nummer. Dat is nodig om te verkopen in de ZekerFlex-shop en maakt je ${naamVan(soort)} betrouwbaarder.` };

  return (
    <>
      <PageHead title="Bedrijf" sub={`De gegevens van ${tenant?.name ?? "je bedrijf"}: gedeeld met je andere dashboards, dus je vult ze maar één keer in.`} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card title="Verificatie" actions={<Pill tone={status.tone}>{status.label}</Pill>}>
          <p className="text-sm leading-relaxed text-[#303030]">{status.tekst}</p>
          {!verificatie.verified && !verificatie.inControle && (
            <div className="mt-5 border-t border-[#ebebeb] pt-5">
              <KvkFormulier kvkPrefill={tenant?.kvkNumber ?? undefined} landPrefill={land} />
            </div>
          )}
        </Card>
        <Card title="Gegevens">
          <dl className="divide-y divide-[#ebebeb]">
            <Regel label="Naam" waarde={tenant?.name ?? "—"} />
            {land === "NL" ? <Regel label="KVK-nummer" waarde={tenant?.kvkNumber ?? "nog niet ingevuld"} /> : <Regel label="Btw-nummer" waarde={tenant?.vatNumber ?? "nog niet ingevuld"} />}
            <Regel label="Land" waarde={landNaam(land)} />
            <Regel label="Adres" waarde={vestiging ? [vestiging.addressLine, [vestiging.postalCode, vestiging.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "nog niet ingevuld"} />
          </dl>
          <p className="mt-3 text-xs text-[#707070]">Klopt er iets niet in de naam of het KVK-nummer? Stuur een bericht aan support@zekerflex.com; dat passen we met de hand aan.</p>
        </Card>
      </div>
      <div className="mt-5">
        <Card title="Mails van ZekerFlex">
          <p className="mb-4 text-sm text-[#616161]">Kies welke mails van ZekerFlex je wilt krijgen.</p>
          <MailPrefsToggles token={mail.token} initialCategories={mail.categories} initialUnsubscribedAll={mail.unsubscribedAll} />
        </Card>
      </div>
    </>
  );
}

/** Studio → Facturen: wat ZekerFlex het bedrijf rekent (domeinnaam, abonnement), met betaallink. */
export async function FacturenScherm({ soort }: { soort: StudioSoort }) {
  const iv = (await getDict()).invoices;
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const billing = scope.tenantIds[0] ? await getOrgProfileExtra(scope.tenantIds[0]) : {};
  const invoices = await prisma.invoice.findMany({
    where: { recipientTenantId: { in: scope.tenantIds } },
    select: { id: true, number: true, type: true, status: true, subtotalCents: true, vatCents: true, totalCents: true, vatTreatment: true, timesheet: { select: { branch: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const openstaand = invoices.filter((i) => i.status === "ISSUED").reduce((s, i) => s + i.totalCents, 0);
  const betaald = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0);
  const rows: InvoiceRow[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    ...(i.type === "DOMEIN" ? { digitaal: true } : {}),
    typeLabel:
      i.type === "PLATFORM_FEE" ? iv.typeFee : i.type === "CANCELLATION_PENALTY" ? iv.typePenalty : i.type === "UITZEND_FEE" ? iv.typeUitzend : i.type === "DOMEIN" ? iv.typeDomein : iv.typeShift,
    reverseCharge: i.vatTreatment === "REVERSE_CHARGE",
    branch: i.timesheet?.branch.name ?? "—",
    subtotalCents: i.subtotalCents,
    vatCents: i.vatCents,
    totalCents: i.totalCents,
    status: i.status,
    ...(i.status === "ISSUED" ? { payUrl: payUrl(i.id) } : {}),
  }));

  return (
    <>
      <PageHead title="Facturen" sub={`Wat ZekerFlex je rekent voor je ${naamVan(soort)}, zoals je domeinnaam. Betalen kan meteen online.`} />
      <Card>
        <div className="grid grid-cols-3 gap-5">
          <Stat label="Openstaand" value={money(openstaand)} />
          <Stat label="Betaald" value={money(betaald)} />
          <Stat label="Facturen" value={String(invoices.length)} />
        </div>
      </Card>
      <div className="mt-5">
        {invoices.length === 0 ? (
          <Card>
            <p className="text-sm text-[#616161]">Nog geen facturen. Bestel je een domeinnaam, dan staat de factuur hier.</p>
          </Card>
        ) : (
          <InvoicesOverview invoices={rows} t={iv} />
        )}
      </div>
      <div className="mt-5" id="factuurgegevens">
        <Card title="Factuurgegevens" pad={false}>
          <BillingPrefsForm initial={{ billingEmail: billing.billingEmail ?? "", splitByCostCentre: billing.splitByCostCentre ?? false, costCentres: billing.costCentres ?? [] }} />
        </Card>
      </div>
    </>
  );
}

/** Studio → Team: wie er met je mee werkt aan de webshop of website. */
export async function TeamScherm({ soort }: { soort: StudioSoort }) {
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const kanBeheren = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  return (
    <>
      <PageHead title="Team" sub={`Nodig collega's uit die mee mogen werken aan je ${naamVan(soort)}. Een beheerder kan alles, ook facturen en het team.`} />
      <Card>
        <TeamBoard canManage={kanBeheren} />
      </Card>
    </>
  );
}

/** Studio → Mail: de mailbox van het bedrijf. */
export async function MailScherm() {
  const principal = await requirePrincipal();
  const dict = await getDict();
  return (
    <>
      <PageHead title="Mail" sub="Je zakelijke mail, zonder je dashboard te verlaten." />
      <EmployerMailbox t={dict.mailbox} zt={dict.zfmail} userEmail={principal.email} />
    </>
  );
}

/** Studio → Mijn account: je naam, telefoon, inloggen en uitloggen. */
export async function MijnAccountScherm() {
  const principal = await requirePrincipal();
  const user = await prisma.user.findUnique({ where: { id: principal.userId }, select: { fullName: true, email: true, phone: true } });
  return (
    <>
      <PageHead title="Mijn account" sub="Je eigen gegevens en hoe je inlogt. Dit geldt voor al je dashboards bij ZekerFlex." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Persoonsgegevens" pad={false}>
          <PersonalInfoForm action={updateEmployerPersonalInfoAction} initialFullName={user?.fullName ?? principal.fullName} initialPhone={user?.phone ?? ""} />
          <dl className="border-t border-[#ebebeb] px-5">
            <Regel label="E-mail" waarde={user?.email ?? principal.email} />
          </dl>
        </Card>
        <Card title="Wachtwoord">
          <p className="text-sm text-[#616161]">Je wachtwoord wijzig je met een link per mail.</p>
          <Link href="/wachtwoord-vergeten" className={`${btn.secondary} mt-3`}>
            Wachtwoord wijzigen
          </Link>
        </Card>
        <Card title="Tweestapsverificatie">
          <TwoFactorSettings recommended />
        </Card>
        <Card title="Inloggen met passkey">
          <PasskeySettings />
        </Card>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <form action={logoutAction}>
          <button type="submit" className={btn.danger}>
            Uitloggen
          </button>
        </form>
        <Link href="/account-verwijderen" className="text-xs font-semibold text-[#707070] hover:text-[#b42318]">
          Account verwijderen
        </Link>
      </div>
    </>
  );
}
