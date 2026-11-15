import type { Illustratie } from "@/lib/marketing/aanbod-uitgebreid";

// Getekende voorbeeldkaarten bij een aanbodpagina (alleen vormen en tekst, geen schermafdruk van echte gegevens). Elke kaart
// draagt het label "Voorbeeld", zodat niemand ze voor echte cijfers houdt. Puur: een servercomponent zonder gegevens.

function Voorbeeld() {
  return <span className="absolute right-3 top-3 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutralx-500">Voorbeeld</span>;
}

/** De telefoon van een kracht op de werkplek: ingecheckt, met de plek en het bewijs. */
export function IncheckKaart({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-64 rounded-2xl border border-hair bg-white p-5 shadow-xl ${className}`} aria-hidden>
      <Voorbeeld />
      <p className="text-sm font-semibold text-ink">Inchecken</p>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums text-ink">07:58</p>
      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center justify-between rounded-lg border border-hair px-3 py-2 text-neutralx-600">
          <span>Magazijn Noord</span>
          <span className="text-neutralx-400">▾</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-hair px-3 py-2 text-neutralx-600">
          <span>Op de locatie</span>
          <span className="font-semibold text-brand-600">✓</span>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-brand-mint px-3 py-2 text-center text-sm font-semibold text-ink">Ingecheckt →</div>
    </div>
  );
}

/** De aanwezigheid per locatie, zoals die bij het goedkeuren van uren terugkomt. */
export function AanwezigKaart({ className = "" }: { className?: string }) {
  const rijen = [
    { naam: "Kracht 1", hoe: "Geofence", tijd: "07:58" },
    { naam: "Kracht 2", hoe: "QR", tijd: "08:01" },
    { naam: "Kracht 3", hoe: "Baken", tijd: "08:03" },
  ];
  return (
    <div className={`relative w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-xl ${className}`} aria-hidden>
      <Voorbeeld />
      <p className="text-sm font-semibold text-ink">Magazijn Noord</p>
      <p className="text-xs text-neutralx-500">Bewijs per urenbriefje</p>
      <ul className="mt-4 divide-y divide-hair">
        {rijen.map((r) => (
          <li key={r.naam} className="flex items-center gap-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mintwash text-xs font-bold text-brand-700">{r.naam.slice(-1)}</span>
            <span className="flex-1 whitespace-nowrap text-sm font-medium text-ink">{r.naam}</span>
            <span className="whitespace-nowrap text-xs text-neutralx-500">{r.hoe}</span>
            <span className="rounded-md bg-mintwash px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-700">{r.tijd}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Een rij locaties die elk een eigen inchecktegel hebben. */
export function LocatieTegels({ className = "" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`} aria-hidden>
      {["Locatie 1", "Locatie 2", "Locatie 3"].map((n) => (
        <div key={n} className="rounded-xl border border-hair bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold text-ink">{n}</p>
          <div className="mt-3 rounded-md bg-mintwash px-2 py-1.5 text-center text-[11px] font-semibold text-brand-700">Inchecken →</div>
        </div>
      ))}
    </div>
  );
}

/** Een kleine plaat bovenaan een kaart met andere functies. */
export function Plaat({ soort }: { soort: Illustratie | "rooster" | "uren" }) {
  return (
    <div className="relative flex h-40 items-start justify-center overflow-hidden pt-5 rounded-t-2xl bg-mintwash" aria-hidden>
      <span className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand-mint/40" />
      <span className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-brand-100" />
      {soort === "incheck" && <IncheckKaart className="relative !w-44 !p-3 scale-90" />}
      {soort === "aanwezig" && <AanwezigKaart className="relative !max-w-[13rem] !p-3 scale-90" />}
      {soort === "rooster" && <LocatieTegels className="relative w-56" />}
      {soort === "uren" && <AanwezigKaart className="relative !max-w-[13rem] !p-3 scale-90" />}
    </div>
  );
}
