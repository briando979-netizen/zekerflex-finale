import type { Kennis } from "@/lib/sitechat/antwoord";
import type { Fragment } from "@/lib/sitechat/regels";
import {
  BLOG,
  CONTACT,
  FUNCTIES,
  JOIN,
  KERNWOORDEN,
  KLANTEN,
  PAKKETTEN,
  PARTNER,
  QUOTES,
  STAPPEN,
  VIDEO,
  pakketRegel,
  veelgesteld,
} from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// Wat de AI-assistent op het SmileyApp-voorstel weet: alleen de teksten van
// smileyapp.nl, uit lib/voorstel/smileyapp.ts (dezelfde bron als de pagina's,
// dus ook dezelfde prijzen). Per vraag kiest lib/sitechat de passende stukken.
// Zolang niemand van SmileyApp in het beheer kan inloggen, leest er geen team
// mee en verwijst de assistent naar info@smileyapp.nl. Is er wel een team
// (lib/voorstel/smileyapp-accounts.ts, heeftTeam), dan geeft de route
// medewerker: true mee en kan een bezoeker om een medewerker vragen.
// ---------------------------------------------------------------------------

export const SMILEYAPP_KANAAL = "smileyapp";

const tekst = (b: (typeof BLOG)[number]) =>
  b.inhoud
    .map((x) => (x.type === "lijst" ? x.items.map((i) => `- ${i}`).join("\n") : x.type === "kop" ? `${x.tekst}.` : x.tekst))
    .join("\n");

const kort = (s: string, max = 1400) => (s.length > max ? `${s.slice(0, max)} …` : s);

export function smileyappKennis(o: { medewerker?: boolean } = {}): Kennis {
  const medewerker = o.medewerker === true;
  const vast: Fragment[] = [
    {
      titel: "Contact",
      tekst: `${CONTACT.naam}, e-mail ${CONTACT.email}. KvK-nummer ${CONTACT.kvk}. Postadres: ${CONTACT.postadres}. Kantooradres: ${CONTACT.kantooradres}. Smileyapp is onderdeel van ${CONTACT.onderdeelVan}. Klanten loggen in via smileyapp.online/login. Contact opnemen kan per e-mail.`,
      altijd: true,
    },
    {
      titel: "Pakketten en prijzen",
      tekst: `${PAKKETTEN.map(pakketRegel).join(".\n")}.`,
      altijd: true,
    },
  ];

  const pakketten: Fragment[] = PAKKETTEN.map((p) => ({
    titel: `Pakket: ${p.naam}`,
    tekst: [pakketRegel(p), p.onderdelen.length ? `Inbegrepen: ${p.onderdelen.join(", ")}.` : "", ...(p.uitleg ?? [])].filter(Boolean).join(" "),
  }));

  const product: Fragment[] = [
    { titel: "Zo werkt Smileyapp", tekst: JOIN.tekst.join(" ") },
    { titel: "Meten, weten, verbeteren", tekst: STAPPEN.map((s) => `${s.titel}: ${s.tekst}`).join(" ") },
    { titel: FUNCTIES.kop, tekst: `${FUNCTIES.punten.join(". ")}. ${FUNCTIES.widget}` },
    { titel: KERNWOORDEN.kop, tekst: KERNWOORDEN.items.map((k) => `${k.titel}: ${k.tekst}`).join(" ") },
    { titel: `${VIDEO.bovenkop}: ${VIDEO.kop}`, tekst: VIDEO.tekst },
    {
      titel: "Klanten en ervaringen",
      tekst: `Klanten: ${KLANTEN.map((k) => k.naam).join(", ")}. ${QUOTES.map((q) => `${q.organisatie}: "${q.tekst.join(" ")}"`).join(" ")}`,
    },
    { titel: "Partner worden", tekst: `${PARTNER.uitleg.join(" ")} Voordelen: ${PARTNER.voordelen.join(", ")}.` },
  ];

  const blog: Fragment[] = BLOG.map((b) => ({ titel: `Blog: ${b.titel}`, tekst: kort(tekst(b)) }));
  const vragen: Fragment[] = veelgesteld().map((v) => ({ titel: `Vraag: ${v.vraag}`, tekst: v.antwoord }));

  return {
    bedrijf: CONTACT.naam,
    omschrijving:
      "Smileyapp meet op een eenvoudige, snelle en leuke manier de klanttevredenheid, gastvrijheid, medewerkerstevredenheid en product/diensttevredenheid. Mensen scannen een QR-code en geven hun tevredenheid door door een smiley te swipen; de resultaten staan in een overzichtelijk dashboard.",
    regels: [
      "Noem prijzen precies zoals in de gegevens. Of een prijs met of zonder btw is, staat er niet bij: zeg dat dan eerlijk.",
      "Beloof niets wat niet in de gegevens staat, zoals een proefperiode, korting, koppeling of levertijd.",
      `Wil iemand een pakket afnemen, maatwerk of heb je geen antwoord: verwijs naar ${CONTACT.email}.`,
      "Vraagt iemand of dit de officiële website is: dit is een ontwerpvoorstel van ZekerFlex; de officiële website is smileyapp.nl.",
    ],
    fragmenten: [...vast, ...pakketten, ...product, ...vragen, ...blog],
    contact: `mail naar ${CONTACT.email}`,
    medewerker,
  };
}
