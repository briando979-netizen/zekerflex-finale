import { env } from "@/lib/env";
import { STATUS_LABEL, vensterTekst, type Afspraak } from "@/lib/installatie/model";
import { maakToken } from "@/lib/installatie/store";

/** Een afspraak zoals de beheerder hem ziet, met de twee links. De links zijn de sleutel: alleen in het beheer tonen. */
export function afspraakVoorAdmin(a: Afspraak) {
  const basis = env.APP_BASE_URL.replace(/\/$/, "");
  return {
    id: a.id,
    klantNaam: a.klantNaam,
    adres: a.adres,
    plaats: a.plaats,
    venster: vensterTekst(a.venster),
    monteurNaam: a.monteurNaam,
    status: a.status,
    statusLabel: STATUS_LABEL[a.status],
    gemaakt: a.gemaakt,
    klantLink: `${basis}/installatie/${maakToken(a.id, "klant")}`,
    monteurLink: `${basis}/monteur/${maakToken(a.id, "monteur")}`,
  };
}
