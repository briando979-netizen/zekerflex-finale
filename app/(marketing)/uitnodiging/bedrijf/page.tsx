import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmployerInvite } from "@/lib/sales/invite";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Je ZekerFlex-account", robots: { index: false } };

export default async function EmployerInvitePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const invite = searchParams.token ? await verifyEmployerInvite(searchParams.token) : null;

  if (!invite) {
    return (
      <div className="shell py-24">
        <div className="mx-auto max-w-md rounded-2xl border border-hair bg-white p-8 text-center shadow-card">
          <h1 className="font-display text-xl font-bold text-ink">Link niet meer geldig</h1>
          <p className="mt-2 text-sm text-neutralx-600">
            Deze uitnodiging is verlopen of ongeldig. Vraag je ZekerFlex-contactpersoon om een nieuwe,
            of meld je gewoon zelf aan.
          </p>
          <Link href="/register?type=bedrijf" className="btn-primary mt-5 inline-block">
            Zelf aanmelden
          </Link>
        </div>
      </div>
    );
  }

  const q = new URLSearchParams({ type: "bedrijf", company: invite.companyName });
  if (invite.kvkNumber) q.set("kvk", invite.kvkNumber);
  if (invite.contactEmail) q.set("email", invite.contactEmail);
  q.set("invite", searchParams.token!);

  return (
    <div className="shell py-20 md:py-28">
      <div className="mx-auto max-w-lg">
        <p className="eyebrow text-brand-600">Persoonlijke uitnodiging</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink md:text-4xl">
          Welkom, {invite.companyName}
        </h1>
        <p className="mt-4 text-neutralx-600">
          {invite.repName} van ZekerFlex heeft alvast een account voor je klaargezet. Je
          bedrijfsgegevens zijn al ingevuld — je hoeft alleen nog je e-mailadres te bevestigen en een
          wachtwoord te kiezen.
        </p>

        <div className="mt-6 rounded-2xl border border-hair bg-white p-5 shadow-card">
          <dl className="divide-y divide-hair text-sm">
            <div className="flex justify-between py-2">
              <dt className="text-neutralx-500">Bedrijf</dt>
              <dd className="font-medium text-ink">{invite.companyName}</dd>
            </div>
            {invite.kvkNumber && (
              <div className="flex justify-between py-2">
                <dt className="text-neutralx-500">KVK-nummer</dt>
                <dd className="font-medium text-ink">{invite.kvkNumber}</dd>
              </div>
            )}
            {invite.contactEmail && (
              <div className="flex justify-between py-2">
                <dt className="text-neutralx-500">E-mail</dt>
                <dd className="font-medium text-ink">{invite.contactEmail}</dd>
              </div>
            )}
          </dl>
        </div>

        <Link href={`/register?${q.toString()}`} className="btn-primary mt-6 inline-block">
          Aanmelding afronden
        </Link>
        <p className="mt-3 text-xs text-neutralx-400">
          Klopt er iets niet? Je kunt alles nog aanpassen tijdens het aanmelden. Bekijk ook de{" "}
          <Link href="/uitleg" className="underline">
            uitlegfilmpjes
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
