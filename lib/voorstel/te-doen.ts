// "Te doen" op het beheer-dashboard: alles wat aandacht vraagt in één lijst,
// elk punt met het tabblad waar het team het afhandelt. Puur, los te testen.

export interface TeDoenTellingen {
  teBevestigen: number;
  nieuweAanvragen: number;
  wachtOpAntwoord: number;
  reviewsNieuw: number;
  sollicitatiesNieuw: number;
  wachtlijstVrij: number;
  openTaken: number;
  /** groepen van vandaag en morgen zonder begeleider */
  zonderBegeleider: number;
  /** komende groepen met een begeleider die tegelijk elders staat */
  begeleiderDubbel: number;
  /** gasten in de websitechat die op een medewerker wachten (of op antwoord van de medewerker) */
  chatWacht?: number;
}

export interface TeDoenPunt {
  sleutel: keyof TeDoenTellingen;
  aantal: number;
  tekst: string;
  /** tabblad, eventueel met een filter erachter ("reserveringen=zonder-begeleider") */
  tab: string;
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

/** Alleen de punten waar iets ligt, de dringendste (gasten die wachten) eerst. */
export function teDoen(t: TeDoenTellingen): TeDoenPunt[] {
  const punten: TeDoenPunt[] = [
    { sleutel: "chatWacht", aantal: t.chatWacht ?? 0, tekst: `${meervoud(t.chatWacht ?? 0, "gast wacht", "gasten wachten")} in de websitechat op een medewerker`, tab: "chat" },
    { sleutel: "wachtlijstVrij", aantal: t.wachtlijstVrij, tekst: `${meervoud(t.wachtlijstVrij, "wachtende gast kan", "wachtende gasten kunnen")} nu boeken: bel ze`, tab: "wachtlijst" },
    { sleutel: "wachtOpAntwoord", aantal: t.wachtOpAntwoord, tekst: `${meervoud(t.wachtOpAntwoord, "gast wacht", "gasten wachten")} op antwoord op een bericht`, tab: "klanten" },
    { sleutel: "begeleiderDubbel", aantal: t.begeleiderDubbel, tekst: `${meervoud(t.begeleiderDubbel, "groep heeft", "groepen hebben")} een begeleider die tegelijk elders staat`, tab: "reserveringen=dubbel" },
    { sleutel: "zonderBegeleider", aantal: t.zonderBegeleider, tekst: `${meervoud(t.zonderBegeleider, "groep", "groepen")} vandaag of morgen nog zonder begeleider`, tab: "reserveringen=zonder-begeleider" },
    { sleutel: "teBevestigen", aantal: t.teBevestigen, tekst: `${meervoud(t.teBevestigen, "reservering", "reserveringen")} nog bevestigen`, tab: "reserveringen" },
    { sleutel: "nieuweAanvragen", aantal: t.nieuweAanvragen, tekst: `${meervoud(t.nieuweAanvragen, "nieuwe aanvraag", "nieuwe aanvragen")} oppakken`, tab: "aanvragen" },
    { sleutel: "sollicitatiesNieuw", aantal: t.sollicitatiesNieuw, tekst: `${meervoud(t.sollicitatiesNieuw, "nieuwe sollicitatie", "nieuwe sollicitaties")} bekijken`, tab: "sollicitaties" },
    { sleutel: "reviewsNieuw", aantal: t.reviewsNieuw, tekst: `${meervoud(t.reviewsNieuw, "beoordeling wacht", "beoordelingen wachten")} op goedkeuring`, tab: "reviews" },
    { sleutel: "openTaken", aantal: t.openTaken, tekst: `${meervoud(t.openTaken, "open taak", "open taken")}`, tab: "dashboard" },
  ];
  return punten.filter((p) => p.aantal > 0);
}
