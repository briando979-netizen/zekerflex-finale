import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getPrincipal } from "@/lib/auth";
import { getRequest } from "@/lib/bank/p2p";
import { LogoGlyph } from "@/components/brand/Logo";
import { QrCode } from "@/components/billing/QrCode";
import { PayRequestButton } from "@/components/bank/PayRequestButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Betaalverzoek", robots: { index: false, follow: false } };

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(c / 100);

// Public page behind a ZekerFlex Bank betaalverzoek link / QR. Paying needs a
// ZekerFlex account (the money moves between two ZekerFlex Bank accounts).
export default async function BetaalverzoekPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const r = await getRequest(id);
  if (!r) notFound();
  const principal = await getPrincipal();
  const url = `${env.APP_BASE_URL}/betaalverzoek/${r.id}`;

  return (
    <main className="min-h-screen bg-paper-soft px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <LogoGlyph size={28} />
          <span className="font-display text-lg font-bold text-ink">ZekerFlex Bank</span>
        </Link>
        <section className="card overflow-hidden">
          <div className="bg-gradient-to-br from-[#0E5C4A] to-[#062a22] p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Betaalverzoek van</p>
            <p className="mt-1 text-lg font-semibold">{r.holderName}</p>
            <p className="num mt-4 font-display text-4xl font-bold">{euro(r.amountCents)}</p>
            {r.description && <p className="mt-2 text-sm text-white/80">{r.description}</p>}
          </div>
          <div className="space-y-4 p-6">
            {r.status === "paid" ? (
              <p className="rounded-xl bg-ok/10 px-4 py-3 text-sm font-semibold text-ok">✓ Betaald{r.paidBy ? ` door ${r.paidBy}` : ""}. Bedankt!</p>
            ) : r.status === "cancelled" ? (
              <p className="rounded-xl bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Dit verzoek is verlopen of ingetrokken.</p>
            ) : principal ? (
              <PayRequestButton id={r.id} label={`Betaal ${euro(r.amountCents)} met ZekerFlex Bank`} />
            ) : (
              <>
                <Link href={`/login?callbackUrl=${encodeURIComponent(`/betaalverzoek/${r.id}`)}`} className="btn-primary block w-full py-3 text-center text-base">
                  Inloggen en betalen
                </Link>
                <p className="text-center text-xs text-neutralx-500">
                  Nog geen ZekerFlex?{" "}
                  <Link href="/register" className="font-semibold text-brand-600 hover:underline">
                    Maak gratis een account
                  </Link>{" "}
                  — je bankrekening is de eerste 30 dagen gratis.
                </p>
              </>
            )}
            {r.status === "open" && (
              <div className="flex flex-col items-center gap-2 border-t border-hair pt-4">
                <QrCode value={url} size={168} label={`QR-code voor het betaalverzoek van ${r.holderName}`} />
                <p className="text-xs text-neutralx-500">Scan om op je telefoon te betalen · geldig tot {new Date(r.expiresAt).toLocaleDateString("nl-NL")}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
