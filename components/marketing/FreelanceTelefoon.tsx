import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { KLUS_TYPE_EMOJI } from "@/lib/shifts/klus-type";
import { FOTO_MAP } from "@/lib/marketing/fotos";

// ---------------------------------------------------------------------------
// Een telefoon met een voorbeeld van de werker-app voor /voor-freelancers (21 nov 2026, eigenaar: de opbouw van een bekende
// freelancerpagina, met de uitstraling van ZekerFlex en zonder uitlegvideo's). Vier schermen: de klussenlijst, het profiel
// met de stappen, een freelance klus met "Reageer op deze klus" en het uren-scherm. Alleen een voorbeeld (eigen foto's,
// verzonnen klussen, zoals UitzendTelefoon); de teksten van de knoppen en de kenmerken komen uit de app zelf
// (lib/i18n/freelancer.ts). Servercomponent, geen beweging.
// ---------------------------------------------------------------------------

const nl = FREELANCER_DICTS.nl;

export type FreelanceScherm = "lijst" | "profiel" | "klus" | "uren";

function Vink() {
  return (
    <span aria-hidden className="grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-white">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
        <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function FreelanceChip() {
  return <span className="rounded border border-brand-300 bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold text-brand-700">{nl.market.freelanceLabel}</span>;
}

function KlusKaart({ foto, titel, plek, wanneer, tarief, verdien }: { foto: string; titel: string; plek: string; wanneer: string; tarief: string; verdien: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hair bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${FOTO_MAP}/${foto}`} alt="" className="h-14 w-full object-cover object-[50%_30%]" />
      <div className="p-2.5">
        <p className="text-[9px] font-semibold text-brand-600">{plek}</p>
        <p className="mt-0.5 text-[11px] font-bold leading-tight text-ink">{titel}</p>
        <p className="mt-1 text-[9px] text-neutralx-500">{wanneer}</p>
        <div className="mt-2 flex items-end justify-between">
          <FreelanceChip />
          <span className="text-right">
            <span className="block text-[11px] font-bold text-ink">{tarief}</span>
            <span className="block text-[8px] text-neutralx-400">{verdien}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Lijst() {
  return (
    <div className="px-3 pt-3">
      <p className="font-display text-sm font-bold text-ink">{nl.nav.findJob}</p>
      <div className="mt-2 flex gap-1.5">
        <span className="rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-[9px] font-semibold text-brand-700">{nl.market.filterFreelance}</span>
        <span className="rounded-full border border-hairstrong bg-white px-2 py-0.5 text-[9px] text-neutralx-600">{nl.market.days}</span>
        <span className="rounded-full border border-hairstrong bg-white px-2 py-0.5 text-[9px] text-neutralx-600">{nl.market.location}</span>
      </div>
      <div className="mt-3 space-y-2">
        <KlusKaart foto="horeca-terras-bediening.jpg" titel="Bediening terras ☀️" plek="Strandpaviljoen · Zandvoort" wanneer="Za 29 nov · 11:00 - 19:00" tarief="€ 22,50" verdien="Verdien ~ € 169" />
        <KlusKaart foto="campagne-festival-crew.jpg" titel="Op- en afbouw crew 🎪" plek="Evenementenhal · Utrecht" wanneer="Zo 30 nov · 08:00 - 16:00" tarief="€ 21,00" verdien="Verdien ~ € 158" />
      </div>
    </div>
  );
}

function Profiel() {
  const stappen = ["Werkvorm: zzp'er", "KVK-nummer", "ID-check", "Rekeningnummer (IBAN)", "Je branches"];
  return (
    <div className="px-3 pt-3">
      <p className="font-display text-sm font-bold text-ink">Je profiel</p>
      <div className="mt-3 flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${FOTO_MAP}/horeca-schort-portret.jpg`} alt="" className="h-11 w-11 rounded-full object-cover object-[50%_25%]" />
        <div>
          <p className="text-[11px] font-bold text-ink">Sanne</p>
          <p className="text-[9px] text-neutralx-500">Horeca · Utrecht</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-hair">
        <div className="h-full w-full rounded-full bg-brand-500" />
      </div>
      <p className="mt-1 text-[9px] font-semibold text-brand-700">Klaar voor je eerste klus</p>
      <ul className="mt-3 space-y-1.5">
        {stappen.map((s) => (
          <li key={s} className="flex items-center gap-2 rounded-lg border border-hair bg-white px-2 py-1.5 text-[10px] font-medium text-ink">
            <Vink />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Klus() {
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${FOTO_MAP}/horeca-terras-bediening.jpg`} alt="" className="h-24 w-full object-cover object-[50%_30%]" />
      <div className="px-3 pt-2.5">
        <p className="text-[9px] font-semibold text-brand-600">Strandpaviljoen · Zandvoort</p>
        <p className="font-display text-sm font-bold leading-tight text-ink">Bediening terras ☀️</p>
        <p className="mt-0.5 text-[9px] text-neutralx-500">Za 29 nov | 11:00 - 19:00 | Zandvoort</p>
        <div className="mt-2 flex items-center justify-between">
          <FreelanceChip />
          <span className="text-xs font-bold text-ink">€ 22,50</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-1">
          {nl.market.typeFreelance.map((tekst, i) => (
            <li key={tekst} className="rounded-md border border-hair bg-paper-soft px-1.5 py-0.5 text-[8.5px] text-neutralx-700">
              {KLUS_TYPE_EMOJI.freelance[i] ?? "•"} {tekst}
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-hair bg-white px-3 py-2.5">
        <span className="block rounded-full bg-brand-500 py-1.5 text-center text-[10px] font-bold text-white">{nl.apply.button}</span>
      </div>
    </div>
  );
}

function Uren() {
  const regels: [string, string][] = [
    ["Begin", "11:00"],
    ["Einde", "19:00"],
    ["Pauze", "30 min"],
  ];
  return (
    <div className="px-3 pt-3">
      <p className="font-display text-sm font-bold text-ink">{nl.nav.hours}</p>
      <div className="mt-3 rounded-xl border border-hair bg-white p-2.5 shadow-sm">
        <p className="text-[9px] font-semibold text-brand-600">Strandpaviljoen · Zandvoort</p>
        <p className="text-[11px] font-bold text-ink">Bediening terras ☀️</p>
        <dl className="mt-2 space-y-1">
          {regels.map(([k, v]) => (
            <div key={k} className="flex justify-between border-t border-hair pt-1 text-[10px]">
              <dt className="text-neutralx-500">{k}</dt>
              <dd className="font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 rounded-md bg-paper-soft px-2 py-1 text-[9px] text-neutralx-600">✓ Ingecheckt op locatie om 10:56</p>
      </div>
      <div className="mt-2 rounded-xl border border-hair bg-white p-2.5">
        <p className="text-[9px] text-neutralx-500">7,5 uur × € 22,50</p>
        <p className="text-sm font-bold text-ink">€ 168,75</p>
        <p className="mt-0.5 text-[9px] text-neutralx-500">De factuur maakt ZekerFlex voor je.</p>
      </div>
      <span className="mt-3 block rounded-full bg-brand-500 py-1.5 text-center text-[10px] font-bold text-white">{nl.ts.submit}</span>
    </div>
  );
}

/** De telefoon zelf; `bijschrift` staat eronder (bijv. "Voorbeeld uit de app"), of niets. */
export function FreelanceTelefoon({ scherm, bijschrift }: { scherm: FreelanceScherm; bijschrift?: string }) {
  return (
    <figure className="mx-auto w-[240px]">
      <div className="relative h-[470px] overflow-hidden rounded-[2.2rem] border-[9px] border-[#0C0E12] bg-paper-soft shadow-2xl">
        <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-[#0C0E12]" aria-hidden />
        {scherm === "lijst" ? <Lijst /> : scherm === "profiel" ? <Profiel /> : scherm === "klus" ? <Klus /> : <Uren />}
      </div>
      {bijschrift ? <figcaption className="mt-2 text-center text-xs text-neutralx-500">{bijschrift}</figcaption> : null}
    </figure>
  );
}
