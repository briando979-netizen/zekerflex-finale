import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { payUrl, verifyPayToken } from "@/lib/billing/pay-link";
import { LogoGlyph } from "@/components/brand/Logo";
import { QrCode } from "@/components/billing/QrCode";
import { PayLinkButton } from "@/components/billing/PayLinkButton";
import { inIosApp } from "@/lib/app-mode-server";
import { bedragTekst, overschrijvingVoor } from "@/lib/billing/overschrijving";
import { platformBankgegevens, stripeBetalenDicht } from "@/lib/billing/overschrijving-bron";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Factuur betalen",
  robots: { index: false, follow: false },
};

const TYPE_LABEL: Record<string, string> = {
  PLATFORM_FEE: "Platformfee",
  SELF_BILL_FREELANCER: "Dienst (zzp)",
  CANCELLATION_PENALTY: "Annuleringsvergoeding",
  UITZEND_FEE: "Uitzendkracht (loon + opslag)",
  DOMEIN: "Domeinnaam",
};

const euro = (cents: number) =>
  `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

// Public page behind the QR code on an invoice PDF / the "QR" button in the
// employer dashboard: shows the invoice and hands off to Stripe Checkout.
export default async function BetaalPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await props.params;
  const { status: returnStatus } = await props.searchParams;
  const invoiceId = verifyPayToken(token);
  if (!invoiceId) notFound();

  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      type: true,
      status: true,
      totalCents: true,
      vatCents: true,
      issuedAt: true,
      createdAt: true,
      paidAt: true,
      issuerFreelancerId: true,
      recipientTenant: { select: { name: true } },
      recipientFreelancer: { select: { user: { select: { fullName: true } } } },
    },
  });
  if (!inv) notFound();

  const recipient = inv.recipientTenant?.name ?? inv.recipientFreelancer?.user.fullName ?? null;
  const justPaid = inv.status === "ISSUED" && returnStatus === "betaald";
  // een domeinnaam (digitaal) is in de iPhone-app niet te betalen (App Store 3.1.1, lib/app-mode.ts)
  const nietInIphone = inv.type === "DOMEIN" && (await inIosApp());
  const payable = inv.status === "ISSUED" && !justPaid && inv.totalCents > 0 && Boolean(recipient) && !nietInIphone;
  // Betalen per overschrijving (lib/billing/overschrijving.ts): de rekening van ZekerFlex en het factuurnummer als kenmerk. De knop voor
  // iDEAL en kaart (Stripe) en de QR-code staan er alleen zolang Stripe echt betaalt.
  const stripeDicht = await stripeBetalenDicht();
  const bank = platformBankgegevens();
  const overschrijving = payable
    ? overschrijvingVoor({ iban: bank.iban, naam: bank.naam, factuurnummer: inv.number, totaalCents: inv.totalCents, status: inv.status, betaaltAanPlatform: !inv.issuerFreelancerId })
    : null;

  return (
    <main className="min-h-screen bg-paper-soft px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <LogoGlyph size={28} />
          <span className="font-display text-lg font-bold text-ink">ZekerFlex</span>
        </Link>

        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <section className="card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Factuur {inv.number}</p>
            <p className="num mt-2 font-display text-4xl font-bold text-ink">{euro(inv.totalCents)}</p>
            <p className="mt-1 text-sm text-neutralx-500">inclusief {euro(inv.vatCents)} btw</p>

            <dl className="mt-6 space-y-2 border-t border-hair pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-neutralx-500">Soort</dt>
                <dd className="text-right text-ink">{TYPE_LABEL[inv.type] ?? inv.type}</dd>
              </div>
              {recipient && (
                <div className="flex justify-between gap-4">
                  <dt className="text-neutralx-500">Aan</dt>
                  <dd className="text-right text-ink">{recipient}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-neutralx-500">Datum</dt>
                <dd className="text-right text-ink">{day(inv.issuedAt ?? inv.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-6">
              {inv.status === "PAID" ? (
                <p className="rounded-xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">
                  ✓ Deze factuur is betaald{inv.paidAt ? ` op ${day(inv.paidAt)}` : ""}. Bedankt!
                </p>
              ) : justPaid ? (
                <p className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ink">
                  <span className="font-semibold text-ok">✓ Betaling ontvangen.</span> We verwerken hem nu; binnen een
                  minuut staat de factuur op betaald. Je krijgt een bevestiging van Stripe per e-mail.
                </p>
              ) : payable && !stripeDicht ? (
                <>
                  <PayLinkButton token={token} label={`Betaal ${euro(inv.totalCents)}`} />
                  <p className="mt-3 text-center text-xs text-neutralx-500">
                    iDEAL · Apple Pay · Google Pay · kaart — veilig via Stripe
                  </p>
                </>
              ) : (
                nietInIphone ? (
                <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Deze factuur kan niet in de iPhone-app betaald worden.</p>
                ) : (
                <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">
                  Deze factuur kan niet online betaald worden. Neem contact op met ZekerFlex via{" "}
                  <a href={`mailto:${env.MAIL_ADMIN}`} className="font-medium text-brand-600 hover:underline">
                    {env.MAIL_ADMIN}
                  </a>
                  .
                </p>
                )
              )}
            </div>

            {overschrijving && (
              <div className="mt-6 rounded-xl border border-hair bg-paper-soft p-4" aria-labelledby="overschrijving-kop">
                <h2 id="overschrijving-kop" className="text-sm font-semibold text-ink">{stripeDicht ? "Betalen via bankoverschrijving" : "Liever overmaken?"}</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-neutralx-500">Rekeninghouder</dt><dd className="text-right text-ink">{overschrijving.naam}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-neutralx-500">IBAN</dt><dd className="num text-right font-semibold text-ink">{overschrijving.ibanLeesbaar}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-neutralx-500">Bedrag</dt><dd className="num text-right text-ink">{bedragTekst(overschrijving.bedragCents)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-neutralx-500">Betalingskenmerk</dt><dd className="num text-right font-semibold text-ink">{overschrijving.kenmerk}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-neutralx-500">
                  Zet het factuurnummer bij de omschrijving: dan zien wij je betaling vanzelf bij deze factuur. Het kan een of twee werkdagen duren voordat de factuur op betaald staat.
                </p>
              </div>
            )}
          </section>

          {payable && !stripeDicht && (
            <aside className="card hidden h-fit p-6 text-center md:block">
              <QrCode value={payUrl(invoiceId)} size={184} label={`QR-code om factuur ${inv.number} op je telefoon te betalen`} />
              <p className="mt-3 max-w-[184px] text-xs leading-relaxed text-neutralx-500">
                Liever op je telefoon? Scan deze code en betaal daar contactloos.
              </p>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
