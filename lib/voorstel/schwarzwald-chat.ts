import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import { ACTIVITEITEN, CONTACT, DOELGROEPEN, THEMAFEESTEN } from "@/lib/voorstel/schwarzwald";
import { GROEP_ANDERE_DAGEN, boekbaar, plusDagen } from "@/lib/voorstel/schwarzwald-agenda";
import { leesInstellingen, maakConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { paginaPaden, type Blok } from "@/lib/voorstel/schwarzwald-paginas";
import { paginaVoorSite } from "@/lib/voorstel/schwarzwald-cms";
import { openStatus, openingsRegels } from "@/lib/voorstel/open-status";
import type { Kennis } from "@/lib/sitechat/antwoord";
import type { Fragment } from "@/lib/sitechat/regels";

// ---------------------------------------------------------------------------
// Wat de chatassistent van Het Schwarzwald weet: contact, de openingstijden
// zoals het team ze instelt, de activiteiten met de prijzen uit het beheer,
// themafeesten, doelgroepen en de teksten van hun eigen pagina's (met de
// bewerkingen uit het CMS). Per vraag kiest lib/sitechat de passende stukken.
// ---------------------------------------------------------------------------

export const SCHWARZWALD_KANAAL = "schwarzwald";

const plat = (blokken: readonly Blok[]): string =>
  blokken
    .map((b) => {
      if (b.type === "kop") return `${b.tekst}.`;
      if (b.type === "alinea") return b.runs.map((r) => r.t).join("");
      if (b.type === "lijst") return b.items.map((i) => `- ${i.map((r) => r.t).join("")}`).join("\n");
      if (b.type === "usps") return b.items.join(" · ");
      if (b.type === "tabel") return b.rijen.map((r) => r.join(" | ")).join("\n");
      if (b.type === "pakketten") return b.pakketten.map((p) => `${p.naam} (${p.prijs}): ${p.onderdelen.map((o) => o.titel).join(", ")}`).join("\n");
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// paginateksten: 5 minuten bewaard per serverproces (gedeeld via globalThis, zie AGENTS.md)
const CACHE = globalThis as unknown as { __schwChatPaginas?: { op: number; fragmenten: Fragment[] } };

async function paginaFragmenten(): Promise<Fragment[]> {
  const c = CACHE.__schwChatPaginas;
  if (c && Date.now() - c.op < 5 * 60_000) return c.fragmenten;
  const paginas = await Promise.all(paginaPaden().map(async (pad) => ({ pad, p: await paginaVoorSite(pad).catch(() => undefined) })));
  const fragmenten = paginas.flatMap(({ pad, p }) => {
    if (!p) return [];
    const tekst = plat(p.blokken);
    return tekst ? [{ titel: `Pagina ${p.titel} (${pad})`, tekst: tekst.length > 1400 ? `${tekst.slice(0, 1400)} …` : tekst }] : [];
  });
  CACHE.__schwChatPaginas = { op: Date.now(), fragmenten };
  return fragmenten;
}

const euro = (n: number) => `€ ${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")}`;

export async function schwarzwaldKennis(): Promise<Kennis> {
  const instellingen = await leesInstellingen();
  const cfg = maakConfig(instellingen);
  const nu = new Date();
  const vandaag = amsterdamDayKey(nu);
  const klok = amsterdamParts(nu);
  const binnenkortDicht = cfg.gesloten.filter((d) => d >= vandaag && d <= plusDagen(vandaag, 60)).sort();
  const online = ACTIVITEITEN.filter((a) => boekbaar(a, cfg));

  const vast: Fragment[] = [
    {
      titel: "Contact en adres",
      tekst: `${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}. Telefoon ${CONTACT.telefoon}, e-mail ${CONTACT.email}. Gasten geven gemiddeld een ${CONTACT.score} (${CONTACT.aantalReviews} beoordelingen).`,
      altijd: true,
    },
    {
      titel: "Openingstijden",
      tekst: [
        `Vandaag is het ${new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(nu)}, ${String(klok.hour).padStart(2, "0")}:${String(klok.minute).padStart(2, "0")} uur. ${openStatus(vandaag, klok.hour * 60 + klok.minute, cfg).tekst}.`,
        ...openingsRegels(cfg.open).map((r) => `${r.dagen}: ${r.tijd}`),
        `Op andere dagen alleen voor groepen vanaf ${GROEP_ANDERE_DAGEN} personen, op reservering.`,
        ...(binnenkortDicht.length ? [`Extra gesloten op: ${binnenkortDicht.join(", ")}.`] : []),
      ].join("\n"),
      altijd: true,
    },
    {
      titel: "Reserveren",
      tekst: `Online te boeken: ${online.map((a) => a.naam).join(", ")}. In deze chat kan de gast op de knop "Reserveren" klikken om een activiteit, datum en tijd te kiezen en meteen te boeken; de vrije tijden staan daar. Themafeesten, bruiloften, het restaurant, de anti-slipcursus en grote groepen gaan via het aanvraagformulier op de pagina Reserveren, of telefonisch. Een reservering wijzigen of annuleren kan in Mijn account.`,
      altijd: true,
    },
  ];

  const activiteiten: Fragment[] = ACTIVITEITEN.map((a) => {
    const regel = cfg.regels[a.slug];
    const prijs =
      regel?.prijsPerRoom !== undefined
        ? `${euro(regel.prijsPerRoom.prijs)} per room van maximaal ${regel.prijsPerRoom.perRoom} spelers`
        : regel?.prijsPP !== undefined
          ? `${euro(regel.prijsPP)} p.p.${regel.prijsPPZondag !== undefined && regel.prijsPPZondag !== regel.prijsPP ? `, op zondag ${euro(regel.prijsPPZondag)} p.p.` : ""}`
          : a.prijs;
    return {
      titel: `Activiteit: ${a.naam}`,
      tekst: [
        a.kort,
        `Prijs: ${prijs}. Duur: ${a.duur}. Groep: ${a.groep}${regel ? ` (online: ${regel.min} tot ${regel.max} personen)` : ""}.`,
        a.binnen ? "Binnen, dus ook bij slecht weer." : "",
        a.feiten.join(" "),
        a.arrangement ? `Arrangement: ${a.arrangement.stappen.join(" → ")}, ${a.arrangement.prijs}.` : "",
        regel ? "Online te boeken via de knop Reserveren." : "Niet online te boeken: via het aanvraagformulier of telefonisch.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  const themas: Fragment[] = THEMAFEESTEN.map((t) => ({ titel: `Themafeest: ${t.naam}`, tekst: `${t.kort}. ${t.tekst}${t.prijs ? ` Prijs: ${t.prijs}.` : ""} Aanvragen via het formulier op de pagina Reserveren.` }));
  const doelgroepen: Fragment[] = DOELGROEPEN.map((d) => ({ titel: `Voor: ${d.naam}`, tekst: `${d.kop}. ${d.intro ?? ""} ${d.punten.join(" ")}`.trim() }));

  return {
    bedrijf: CONTACT.naam,
    omschrijving:
      "Het Schwarzwald in Rijssen organiseert uitjes en feesten in de bossen: buggy's, quads, escaperooms, themafeesten en meer, met een eigen restaurant. Binnenkort opent er een indoor entertainment megacenter.",
    regels: [
      'Wil de gast reserveren, zeg dan dat hij in deze chat op "Reserveren" kan klikken; daar staan de vrije tijden. Beloof zelf nooit dat er plek is.',
      "Noem prijzen precies zoals in de gegevens, met 'vanaf' als dat erbij staat.",
      "Vraagt iemand of dit de officiële website is: dit is een ontwerpvoorstel van ZekerFlex; voor een zekere reservering kan de gast bellen.",
    ],
    fragmenten: [...vast, ...activiteiten, ...themas, ...doelgroepen, ...(await paginaFragmenten())],
    contact: `bel ${CONTACT.telefoon}`,
  };
}
