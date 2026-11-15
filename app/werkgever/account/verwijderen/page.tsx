import { requirePrincipal } from "@/lib/auth";
import { getDict, getLocale } from "@/lib/i18n/server";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { ErasureScopeInfo } from "@/components/privacy/ErasureScopeInfo";
import { DeleteOwnAccountForm } from "@/components/app/DeleteOwnAccountForm";
import { DELETE_ACCOUNT_EN, DELETE_ACCOUNT_NL } from "@/components/app/delete-account-texts";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";

// Account verwijderen in de werkgeversapp (15 nov 2026). Een bedrijf ging naar de openbare pagina /account-verwijderen
// ("Terug naar inloggen"). Hier staat wat er met het bedrijf gebeurt; de actie is dezelfde als in de werkersapp en laat
// geen bedrijf zonder beheerder achter (lib/privacy/bedrijf-vertrek.ts).
export default async function VerwijderBedrijfsAccountPage() {
  await requirePrincipal();
  const [d, locale] = await Promise.all([getDict(), getLocale()]);
  const t = d.verwijderen;
  const en = locale === "en";

  return (
    <>
      <BackLink fallbackHref="/werkgever/instellingen" label={d.shell.settings} />

      <div className="my-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.titel}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 text-sm text-neutralx-500">{t.sub}</p>
      </div>

      <div className="space-y-6 rounded-2xl border border-hair bg-white p-5 shadow-card">
        <div>
          <p className="text-sm font-semibold text-ink">{t.bedrijfKop}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutralx-700">
            {t.punten.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t.jijKop}</p>
          <ErasureScopeInfo {...(en ? { texts: FREELANCER_DICTS.en.restTaal } : {})} />
        </div>
        <DeleteOwnAccountForm texts={en ? DELETE_ACCOUNT_EN : DELETE_ACCOUNT_NL} />
      </div>
    </>
  );
}
