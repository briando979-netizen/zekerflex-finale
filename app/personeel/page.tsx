import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { vulIn } from "@/lib/i18n/vul-in";
import { LoonstrokenBlok } from "@/components/personeel/LoonstrokenBlok";
import { TakenBlok } from "@/components/personeel/TakenBlok";
import { medewerkerContext } from "@/lib/horeca-personeel/context";
import { personeelTeksten } from "@/lib/horeca-personeel/teksten";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mijn werk", robots: { index: false } };

// De omgeving van een medewerker van een horecazaak (lib/horeca-personeel): het dashboard dat de beheerder voor zijn rol heeft
// ingesteld. Geen rol in ZekerFlex nodig: alleen de verwijzing naar de zaak en een actieve regel in de lijst van de beheerder.
// Een bezoeker zonder inlog gaat naar het inlogscherm; iemand die geen medewerker (meer) is, ziet dat er geen toegang is.
export default async function PersoneelPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=%2Fpersoneel");
  const t = personeelTeksten(await getLocale());
  const c = await medewerkerContext();
  if (!c) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-10">
        <p role="alert" className="text-sm font-medium text-ink">
          {t.omgeving.geenToegang}
        </p>
      </div>
    );
  }
  const taal = t.taal;
  const blokken = c.dashboard.blokken;
  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{vulIn(t.omgeving.titel, { zaak: c.zaak.naam })}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">{vulIn(t.omgeving.hallo, { naam: c.naam.split(" ")[0] ?? c.naam })}</h1>
          <p className="mt-1 text-sm text-neutralx-600">{c.dashboard.naam}</p>
        </div>
        <Link href="/api/auth/signout" className="btn-ghost min-h-[44px] text-sm">
          {t.omgeving.uitloggen}
        </Link>
      </header>

      {blokken.length === 0 && <p className="text-sm text-neutralx-600">{t.omgeving.geenBlokken}</p>}

      {blokken.includes("mededelingen") && (
        <section aria-labelledby="pers-meded" className="space-y-3">
          <h2 id="pers-meded" className="font-display text-xl font-bold text-ink">
            {t.omgeving.mededelingenKop}
          </h2>
          {c.mededelingen.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.omgeving.geenMededelingen}</p>
          ) : (
            <ul className="space-y-2">
              {c.mededelingen.map((m) => (
                <li key={m.id} className="rounded-2xl border border-hair bg-white p-4">
                  <p className="whitespace-pre-line text-sm text-ink">{m.tekst}</p>
                  <p className="mt-1 text-xs text-neutralx-500">{new Intl.DateTimeFormat(taal, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(m.datum))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {blokken.includes("taken") && <TakenBlok t={t.omgeving} />}

      {blokken.includes("loonstroken") && <LoonstrokenBlok t={t.omgeving} taal={taal} />}
    </main>
  );
}
