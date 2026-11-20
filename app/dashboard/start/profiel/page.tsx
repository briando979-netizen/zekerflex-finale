import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { WerkerStartWizard } from "@/components/app/WerkerStartWizard";
import { KlaarVoorKlusKaart } from "@/components/app/KlaarVoorKlusKaart";
import { getFreelancerDict } from "@/lib/i18n/server";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { nogVoorEersteKlusVan } from "@/lib/onboarding/klaar-voor-klus-server";

export const dynamic = "force-dynamic";

/**
 * "Laat weten wie je bent" als eigen volscherm (naar de app van YoungOnes, 21 nov 2026): de stappen van de aanmelding
 * (richting, branches, gegevens, ID, foto) en daarna wat er nog nodig is vóór de eerste klus. Ontdekken toont alleen de
 * turquoise kaart "Ga door met je profiel" die hierheen leidt; is alles klaar, dan terug naar Ontdekken.
 */
export default async function StartProfielPage() {
  const principal = await requirePrincipal();
  const ft = await getFreelancerDict();
  const poort = await werkerPoortStand(principal.userId).catch(() => null);
  const onboardingOpen = poort !== null && !poort.klaar;
  const nogVoorKlus = !onboardingOpen ? await nogVoorEersteKlusVan(principal.userId).catch(() => []) : [];
  if (!onboardingOpen && nogVoorKlus.length === 0) redirect("/dashboard/klussen");
  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-10 pt-4">
      <div className="mb-3 flex justify-end">
        <Link href="/dashboard/klussen" aria-label={ft.start.sluiten} className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-2xl leading-none text-ink">
          <span aria-hidden>×</span>
        </Link>
      </div>
      {poort && onboardingOpen ? (
        <WerkerStartWizard
          workerKind={poort.workerKind}
          emailVerified={Boolean(principal.emailVerifiedAt)}
          profileComplete={poort.gegevensIngevuld && poort.identiteitIngestuurd}
          gegevensIngevuld={poort.gegevensIngevuld}
          identiteitIngestuurd={poort.identiteitIngestuurd}
          werkrechtOk
          tweestapAan={poort.tweestapAan}
          fotoGezet={poort.fotoGezet}
          brancheKeuze={poort.brancheKeuze}
        />
      ) : (
        <KlaarVoorKlusKaart stukken={nogVoorKlus} />
      )}
    </div>
  );
}
