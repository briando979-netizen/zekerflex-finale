import type { Metadata } from "next";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n/server";
import { UitnodigingForm } from "@/components/personeel/UitnodigingForm";
import { leesPersoneelVan, leesUitnodigingsToken } from "@/lib/horeca-personeel/store";
import { personeelTeksten } from "@/lib/horeca-personeel/teksten";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Uitnodiging", robots: { index: false } };

// De uitnodiging van een medewerker voor een horecazaak (lib/horeca-personeel). Openbaar bereikbaar: de ondertekende link is
// het bewijs, en de pagina laat niets zien als hij niet meer geldig is.
export default async function PersoneelUitnodigingPage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await props.searchParams;
  const t = personeelTeksten(await getLocale());
  const payload = token ? await leesUitnodigingsToken(token) : null;
  const data = payload ? await leesPersoneelVan(payload.tenantId) : null;
  const m = payload && data ? data.medewerkers.find((x) => x.id === payload.medewerkerId) : undefined;
  if (!payload || !token || !m || m.status !== "uitgenodigd" || m.email !== payload.email) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <p role="alert" className="text-sm font-medium text-ink">
          {t.uitnodiging.ongeldig}
        </p>
      </div>
    );
  }
  const [principal, bestaand] = await Promise.all([getPrincipal(), prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } })]);
  return (
    <UitnodigingForm
      t={t.uitnodiging}
      token={token}
      zaak={payload.tenantName}
      email={payload.email}
      naam={payload.naam}
      bestaatAl={Boolean(bestaand)}
      ingelogdMetZelfdeAdres={Boolean(principal && principal.email.toLowerCase() === payload.email)}
      ingelogdAls={principal && principal.email.toLowerCase() !== payload.email ? principal.email : null}
    />
  );
}
