import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { KLUS_TYPE_EMOJI } from "@/lib/shifts/klus-type";
import { FOTO_MAP } from "@/lib/marketing/fotos";

// ---------------------------------------------------------------------------
// Een telefoon met een voorbeeld van de werker-app voor /starten-als-uitzendkracht (21 nov 2026): de klussenlijst met het
// filter op Uitzendklussen, het filter zelf, en een uitzendklus met "Vraag uitzendcontract aan". Alleen een voorbeeld (eigen
// foto, verzonnen klus "Orderpicker, Magazijn · Utrecht", zoals TelefoonDemo); de teksten komen uit de app zelf
// (lib/i18n/freelancer.ts), zodat de pagina en de app hetzelfde zeggen. Servercomponent, geen beweging.
// ---------------------------------------------------------------------------

const nl = FREELANCER_DICTS.nl;

export type UitzendScherm = "lijst" | "filter" | "klus";

function Vink({ aan }: { aan: boolean }) {
  return (
    <span aria-hidden className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${aan ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong bg-white"}`}>
      {aan && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
          <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function UitzendChip() {
  return <span className="rounded border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">{nl.market.uitzendLabel}</span>;
}

function KlusKaart({ titel, plek, wanneer, tarief, verdien }: { titel: string; plek: string; wanneer: string; tarief: string; verdien: string }) {
  return (
    <div className="rounded-xl border border-hair bg-white p-2.5 shadow-sm">
      <p className="text-[9px] font-semibold text-brand-600">{plek}</p>
      <p className="mt-0.5 text-[11px] font-bold leading-tight text-ink">{titel}</p>
      <p className="mt-1 text-[9px] text-neutralx-500">{wanneer}</p>
      <div className="mt-2 flex items-end justify-between">
        <UitzendChip />
        <span className="text-right">
          <span className="block text-[11px] font-bold text-ink">{tarief}</span>
          <span className="block text-[8px] text-neutralx-400">{verdien}</span>
        </span>
      </div>
    </div>
  );
}

function Lijst() {
  return (
    <div className="px-3 pt-3">
      <p className="font-display text-sm font-bold text-ink">{nl.nav.findJob}</p>
      <div className="mt-2 flex gap-1.5">
        <span className="rounded-full border border-brand-500 bg-brand-50 px-2 py-0.5 text-[9px] font-semibold text-brand-700">{nl.market.filterUitzend}</span>
        <span className="rounded-full border border-hairstrong bg-white px-2 py-0.5 text-[9px] text-neutralx-600">{nl.market.days}</span>
        <span className="rounded-full border border-hairstrong bg-white px-2 py-0.5 text-[9px] text-neutralx-600">{nl.market.location}</span>
      </div>
      <div className="mt-3 space-y-2">
        <KlusKaart titel="Orderpicker 📦" plek="Magazijn · Utrecht" wanneer="Ma 1 dec · 07:00 - 15:30" tarief="€ 15,50" verdien="Verdien ~ € 116" />
        <KlusKaart titel="Vakkenvuller 🛒" plek="Supermarkt · Amersfoort" wanneer="Di 2 dec · 18:00 - 22:00" tarief="€ 15,00" verdien="Verdien ~ € 60" />
        <KlusKaart titel="Medewerker inpak 📦" plek="Distributie · Nieuwegein" wanneer="Wo 3 dec · 08:00 - 16:30" tarief="€ 15,50" verdien="Verdien ~ € 124" />
      </div>
    </div>
  );
}

function Filter() {
  return (
    <div className="px-3 pt-3">
      <p className="text-center font-display text-sm font-bold text-ink">Filter</p>
      <p className="mt-3 text-[10px] font-semibold text-neutralx-500">{nl.market.filterTypeKop}</p>
      <div className="mt-1.5 space-y-1.5">
        {[
          [nl.market.filterFreelance, false],
          [nl.market.filterUitzend, true],
        ].map(([label, aan]) => (
          <div key={String(label)} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-medium text-ink ${aan ? "border-brand-500" : "border-hairstrong"}`}>
            <Vink aan={Boolean(aan)} />
            {label}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] font-semibold text-neutralx-500">{nl.market.branches}</p>
      <div className="mt-1.5 space-y-1.5">
        {[
          ["🤩", nl.start.alleBranches],
          ["📦", nl.cat.logistiek],
          ["🧑‍🍳", nl.cat.horeca],
          ["🛍️", nl.cat.retail],
        ].map(([icoon, label]) => (
          <div key={label} className="flex items-center gap-2 rounded-lg border border-brand-500 px-2 py-1.5 text-[10px] font-medium text-ink">
            <Vink aan />
            <span aria-hidden>{icoon}</span>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Klus() {
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${FOTO_MAP}/campagne-scanner.jpg`} alt="" className="h-24 w-full object-cover object-[50%_30%]" />
      <div className="px-3 pt-2.5">
        <p className="text-[9px] font-semibold text-brand-600">Magazijn · Utrecht</p>
        <p className="font-display text-sm font-bold leading-tight text-ink">Orderpicker 📦</p>
        <p className="mt-0.5 text-[9px] text-neutralx-500">Ma 1 dec | 07:00 - 15:30 | Utrecht</p>
        <div className="mt-2 flex items-center justify-between">
          <UitzendChip />
          <span className="text-xs font-bold text-ink">€ 15,50</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-1">
          {nl.market.typeUitzend.map((tekst, i) => (
            <li key={tekst} className="rounded-md border border-hair bg-paper-soft px-1.5 py-0.5 text-[8.5px] text-neutralx-700">
              {KLUS_TYPE_EMOJI.uitzenden[i] ?? "•"} {tekst}
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-hair bg-white px-3 py-2.5">
        <span className="block rounded-full bg-brand-500 py-1.5 text-center text-[10px] font-bold text-white">{nl.detail.partnerKnop}</span>
      </div>
    </div>
  );
}

/** De telefoon zelf; `bijschrift` staat eronder (bijv. "Voorbeeld uit de app"). */
export function UitzendTelefoon({ scherm, bijschrift }: { scherm: UitzendScherm; bijschrift: string }) {
  return (
    <figure className="mx-auto w-[240px]">
      <div className="relative h-[470px] overflow-hidden rounded-[2.2rem] border-[9px] border-[#0C0E12] bg-paper-soft shadow-2xl">
        <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-[#0C0E12]" aria-hidden />
        {scherm === "lijst" ? <Lijst /> : scherm === "filter" ? <Filter /> : <Klus />}
      </div>
      <figcaption className="mt-2 text-center text-xs text-neutralx-500">{bijschrift}</figcaption>
    </figure>
  );
}
