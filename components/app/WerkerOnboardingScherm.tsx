import { getFreelancerDict } from "@/lib/i18n/server";
import { WerkerStartWizard } from "@/components/app/WerkerStartWizard";
import type { WerkerPoortStand } from "@/lib/onboarding/werker-poort-server";

/**
 * Wat een werker ziet zolang de onboarding niet is ingevuld (lib/onboarding/werker-poort.ts):
 * alleen de stappen. "Klaar" betekent hier ingevuld: een ID-controle of document dat bij een
 * medewerker ligt, telt mee. De e-mail is al bevestigd (de layout eist dat eerder).
 */
export async function WerkerOnboardingScherm({ stand }: { stand: WerkerPoortStand }) {
  const t = (await getFreelancerDict()).start;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold leading-tight text-ink">{t.poortTitel}</h1>
      <p className="mb-5 mt-1 text-sm leading-relaxed text-neutralx-600">{t.poortTekst}</p>
      <WerkerStartWizard
        poort
        workerKind={stand.workerKind}
        emailVerified
        profileComplete={stand.gegevensIngevuld && stand.identiteitIngestuurd}
        gegevensIngevuld={stand.gegevensIngevuld}
        identiteitIngestuurd={stand.identiteitIngestuurd}
        werkrechtOk={stand.werkrechtIngevuld}
        tweestapAan={stand.tweestapAan}
        brancheKeuze={stand.brancheKeuze}
      />
    </div>
  );
}
