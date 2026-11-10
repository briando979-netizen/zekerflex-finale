import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { isReservedTestAddress } from "@/lib/mail";
import { werkerPoortStand } from "@/lib/onboarding/werker-poort-server";
import { werkerOnboardingKlaar } from "@/lib/onboarding/werker-poort";
import { eersteIndrukVoor } from "@/lib/onboarding/eerste-indruk-server";
import { startStap } from "@/lib/onboarding/eerste-indruk";
import { inIosApp } from "@/lib/app-mode-server";
import { EersteIndrukScherm } from "@/components/app/EersteIndrukScherm";
import { amsterdamParts } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

// "Maak een goede eerste indruk": OPTIONELE stappen (profielfoto, werkervaring, meldingen) na de ID-controle.
// De poort van de werker-app (lib/onboarding/werker-poort.ts) blijft van kracht: deze pagina staat
// bewust NIET in de lijst met schermen die tijdens de onboarding open zijn. Wie nog niet klaar is,
// gaat hier server-side terug naar Verificatie (de client-poort in de layout toont dan ook al de
// start). Testaccounts (.test/.example) vallen buiten de poort, net als in de layout.
export default async function EersteIndrukPage(props: { searchParams: Promise<{ stap?: string }> }) {
  const { stap } = await props.searchParams;
  const principal = await requirePrincipal();
  if (!isReservedTestAddress(principal.email)) {
    const poort = await werkerPoortStand(principal.userId).catch(() => null);
    // de foto zelf is hier juist de open stap, dus die telt niet mee voor het terugsturen
    if (poort && !werkerOnboardingKlaar({ ...poort, fotoGezet: true })) redirect("/dashboard/verificatie");
  }
  const stand = await eersteIndrukVoor(principal.userId, { iosApp: await inIosApp() });
  // de gevraagde stap (?stap=), anders de eerste die nog open staat
  const start = startStap(stand, stap);
  const nu = amsterdamParts(new Date());
  return (
    <EersteIndrukScherm
      userId={principal.userId}
      naam={principal.fullName}
      heeftFoto={stand.heeftFoto}
      meldingenOpen={!stand.heeftMeldingen}
      start={start}
      huidigJaar={nu.year}
      huidigeMaand={nu.month}
    />
  );
}
