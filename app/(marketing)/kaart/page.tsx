import type { Metadata } from "next";
import Link from "next/link";
import { ZekerKaart } from "@/components/kaart/ZekerKaart";

// ZekerFlex Kaart: de eigen kaart en GPS van ZekerFlex, als product. Nog niet in
// Google en nergens gelinkt tot de eigenaar de prijs en de plek op de site kiest.
export const metadata: Metadata = {
  title: { absolute: "ZekerFlex Kaart · eigen kaart en GPS van Nederland" },
  description: "Een eigen kaart van Nederland met 3D-gebouwen, luchtfoto, adres zoeken, je plek volgen en ritten opnemen. Zelf gehost, zonder Google.",
  robots: { index: false, follow: false },
};

const FUNCTIES = [
  { titel: "Kaart van heel Nederland", tekst: "Elke straat, elk pand en elk pad uit OpenStreetMap, op onze eigen server. Geen kosten per kaartweergave, geen afhankelijkheid van Google." },
  { titel: "3D-gebouwen", tekst: "Kantel de kaart en zie de stad in 3D. Handig voor een aanrijroute, een ophaalpunt of een uitleg ter plekke." },
  { titel: "Luchtfoto", tekst: "De actuele luchtfoto van Nederland (Beeldmateriaal Nederland, PDOK), met straatnamen erover." },
  { titel: "Adres zoeken", tekst: "Elk Nederlands adres, elke straat, postcode en plaats, uit de officiële basisregistratie (PDOK)." },
  { titel: "GPS en volgen", tekst: "Je eigen plek op de kaart, en de kaart die met je meebeweegt als je rijdt of loopt." },
  { titel: "Route plannen", tekst: "Van je eigen plek of een adres naar waar je moet zijn, met de auto, de fiets of lopend. Met de reistijd, de afstand en elke afslag in het Nederlands, uitgerekend op onze eigen server." },
  { titel: "Ritten opnemen", tekst:"Neem een rit op met afstand, tijd en snelheid, en neem hem mee als GPX naar elke routeplanner of sportapp." },
  { titel: "Meten", tekst: "Tik punten op de kaart en zie meteen de afstand: voor een route, een terrein of een kavel." },
  { titel: "Licht, donker en deelbaar", tekst: "Kies een lichte of donkere kaart. Het adres in je browser onthoudt de plek, zodat je een kaartbeeld kunt delen." },
];

const VOOR_WIE = [
  { titel: "Rijscholen", tekst: "Lesritten opnemen, examenroutes laten zien en ophaaladressen op de kaart." },
  { titel: "Bedrijven met mensen onderweg", tekst: "Ritten en kilometers, werkplekken en aanrijroutes voor je personeel." },
  { titel: "Je eigen website", tekst: "Een kaart in je eigen huisstijl op je site, zonder Google-sleutel of rekening per bezoeker." },
];

export default function KaartPage() {
  return (
    <div className="bg-paper">
      <section className="shell-4k pb-6 pt-10 lg:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">ZekerFlex Kaart</p>
          <h1 className="fluid-h2 mt-3 text-balance font-display font-bold">Je eigen kaart en GPS van Nederland</h1>
          <p className="fluid-lead mt-4 text-neutralx-600">
            Met 3D-gebouwen, luchtfoto, adres zoeken, je plek volgen en ritten opnemen. Zelf gehost op open data, zonder Google en zonder kosten per bezoeker.
          </p>
        </div>
      </section>

      <section className="shell-4k">
        <ZekerKaart className="h-[72vh] min-h-[28rem] rounded-3xl shadow-xl ring-1 ring-black/5" />
        <p className="mt-3 text-xs text-neutralx-500">
          Probeer het: zoek een adres, zet 3D aan, of tik op &quot;Waar ben ik?&quot;. Een rit opnemen werkt het best op je telefoon, buiten. Je locatie blijft in je eigen browser.
        </p>
      </section>

      <section className="shell-4k py-14">
        <h2 className="font-display text-3xl font-bold tracking-tight">Wat het kan</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FUNCTIES.map((f) => (
            <li key={f.titel} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="font-display text-lg font-bold">{f.titel}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{f.tekst}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-14 font-display text-3xl font-bold tracking-tight">Voor wie</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {VOOR_WIE.map((f) => (
            <li key={f.titel} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="font-display text-lg font-bold">{f.titel}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{f.tekst}</p>
            </li>
          ))}
        </ul>

        <div className="mt-14 flex flex-col items-start gap-4 rounded-3xl bg-ink p-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">ZekerFlex Kaart op je eigen site of in je app?</h2>
            <p className="mt-1 text-white/80">We laten je graag zien wat het voor jouw bedrijf kan doen.</p>
          </div>
          <Link href="/demo" className="rounded-full bg-white px-6 py-3 font-semibold text-ink">
            Plan een demo
          </Link>
        </div>

        <p className="mt-8 text-xs text-neutralx-500">
          Kaartgegevens © OpenStreetMap-bijdragers (ODbL), tegels via Protomaps. Adressen en luchtfoto: PDOK, Kadaster en Beeldmateriaal Nederland (open data, CC BY 4.0).
        </p>
      </section>
    </div>
  );
}
