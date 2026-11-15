// Getekende voorbeelden bij /rijschool-software: alleen vormen en tekst, geen schermafdrukken van echte gegevens. Elk voorbeeld
// draagt het label "Voorbeeld". De namen zijn verzonnen; de onderdelen van de leskaart zijn de echte (lib/rijschool/leskaart.ts).
// Puur: servercomponenten zonder gegevens.

function Label() {
  return <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutralx-500">Voorbeeld</span>;
}

/** De lesagenda van een week voor één instructeur. */
export function AgendaKaart({ className = "" }: { className?: string }) {
  const dagen = ["ma", "di", "wo", "do", "vr"];
  const lessen: { dag: number; rij: number; naam: string; soort: "les" | "proef" | "examen" }[] = [
    { dag: 0, rij: 0, naam: "Anna", soort: "les" },
    { dag: 0, rij: 2, naam: "Sem", soort: "les" },
    { dag: 1, rij: 1, naam: "Lotte", soort: "proef" },
    { dag: 2, rij: 0, naam: "Daan", soort: "les" },
    { dag: 2, rij: 3, naam: "Anna", soort: "les" },
    { dag: 3, rij: 2, naam: "Noor", soort: "examen" },
    { dag: 4, rij: 1, naam: "Sem", soort: "les" },
  ];
  const kleur = { les: "bg-brand-100 text-brand-700", proef: "bg-plan-soft text-plan-ink", examen: "bg-money-soft text-money-ink" } as const;
  return (
    <div className={`w-full max-w-md rounded-2xl border border-hair bg-white p-5 shadow-xl ${className}`} aria-hidden>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Agenda deze week</p>
        <Label />
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2 text-center text-[11px] text-neutralx-500">
        {dagen.map((d, i) => (
          <div key={d}>
            <p className="font-medium uppercase">{d}</p>
            <div className="mt-2 grid h-40 grid-rows-4 gap-1.5">
              {[0, 1, 2, 3].map((r) => {
                const les = lessen.find((l) => l.dag === i && l.rij === r);
                return les ? (
                  <div key={r} className={`flex items-center justify-center rounded-md px-1 text-[11px] font-semibold ${kleur[les.soort]}`}>
                    {les.naam}
                  </div>
                ) : (
                  <div key={r} className="rounded-md bg-paper" />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutralx-500">
        <span>■ <span className="text-brand-700">Les</span></span>
        <span>■ <span className="text-plan-ink">Proefles</span></span>
        <span>■ <span className="text-money-ink">Examen</span></span>
      </p>
    </div>
  );
}

/** De leerling in zijn eigen app: volgende les, tegoed en voortgang. */
export function LeerlingTelefoon({ className = "" }: { className?: string }) {
  return (
    <div className={`w-60 rounded-[2rem] border-[6px] border-ink bg-white p-4 shadow-2xl ${className}`} aria-hidden>
      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-hairstrong" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Hoi Anna</p>
        <Label />
      </div>
      <div className="mt-3 rounded-xl bg-mintwash p-3">
        <p className="text-[11px] text-neutralx-600">Volgende les</p>
        <p className="mt-0.5 text-sm font-semibold text-ink">Dinsdag 10:00</p>
        <p className="text-[11px] text-neutralx-600">met je vaste instructeur</p>
      </div>
      <div className="mt-3 rounded-xl border border-hair p-3">
        <div className="flex items-center justify-between text-[11px] text-neutralx-600">
          <span>Tegoed</span>
          <span className="font-semibold text-ink">4 uur 30 min</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-paper">
          <div className="h-1.5 w-2/3 rounded-full bg-brand-500" />
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-hair p-3">
        <p className="text-[11px] text-neutralx-600">Voortgang</p>
        <div className="mt-2 space-y-2">
          {[["Auto en bediening", "w-4/5"], ["Kijken en inschatten", "w-3/5"], ["Verkeer en voorrang", "w-2/5"]].map(([n, w]) => (
            <div key={n}>
              <p className="text-[10px] text-ink">{n}</p>
              <div className="mt-1 h-1.5 rounded-full bg-paper">
                <div className={`h-1.5 rounded-full bg-brand-mint ${w}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** De leskaart na een les: per onderdeel een score van 1 tot 5. */
export function LeskaartKaart({ className = "" }: { className?: string }) {
  const rijen: [string, number, string][] = [
    ["Wegrijden en stoppen", 4, "Zelfstandig"],
    ["Schakelen en snelheid", 3, "Met een beetje hulp"],
    ["Kijktechniek", 3, "Met een beetje hulp"],
    ["Sturen en koers houden", 5, "Examenniveau"],
  ];
  return (
    <div className={`w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-xl ${className}`} aria-hidden>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Leskaart na de les</p>
        <Label />
      </div>
      <ul className="mt-4 space-y-3">
        {rijen.map(([naam, score, label]) => (
          <li key={naam}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink">{naam}</span>
              <span className="text-neutralx-500">{label}</span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-2 flex-1 rounded-full ${n <= score ? "bg-brand-500" : "bg-paper"}`} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-[11px] text-neutralx-600">Huiswerk: oefen het schakelen bij lage snelheid. Uitleg staat in je app.</p>
    </div>
  );
}

/** Een leerling met tegoed en pakket, zoals de rijschool hem ziet. */
export function TegoedKaart({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full max-w-sm rounded-2xl border border-hair bg-white p-5 shadow-xl ${className}`} aria-hidden>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Anna de Vries</p>
        <Label />
      </div>
      <p className="mt-1 text-xs text-neutralx-500">Pakket: 20 lessen</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-mintwash p-3">
          <p className="font-display text-xl font-bold text-ink">4 u 30</p>
          <p className="text-[11px] text-neutralx-600">tegoed over</p>
        </div>
        <div className="rounded-xl bg-paper p-3">
          <p className="font-display text-xl font-bold text-ink">11</p>
          <p className="text-[11px] text-neutralx-600">lessen gedaan</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-hair text-xs">
        {[["Les afgerond", "− 1 u"], ["Pakket gekocht", "+ 20 u"], ["Les afgerond", "− 1 u"]].map(([a, b], i) => (
          <li key={i} className="flex items-center justify-between py-2">
            <span className="text-neutralx-600">{a}</span>
            <span className="font-semibold tabular-nums text-ink">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** De website van een rijschool met de proefles-planner. */
export function SiteKaart({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full max-w-md overflow-hidden rounded-2xl border border-hair bg-white shadow-xl ${className}`} aria-hidden>
      <div className="flex items-center gap-1.5 border-b border-hair bg-paper px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-hairstrong" />
        <span className="h-2.5 w-2.5 rounded-full bg-hairstrong" />
        <span className="h-2.5 w-2.5 rounded-full bg-hairstrong" />
        <span className="ml-3 flex-1 truncate rounded bg-white px-2 py-0.5 text-[10px] text-neutralx-500">www.jouwrijschool.nl</span>
        <Label />
      </div>
      <div className="p-5">
        <p className="font-display text-xl font-bold leading-tight text-ink">Rijles in jouw stad bij Rijschool Voorbeeld</p>
        <p className="mt-2 text-xs text-neutralx-600">Plan je proefles online en volg je voortgang na elke les in de app.</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
          {["Di 10:00", "Wo 14:30", "Vr 09:00"].map((t, i) => (
            <span key={t} className={`rounded-lg border px-2 py-2 font-medium ${i === 1 ? "border-brand-500 bg-mintwash text-brand-700" : "border-hair text-neutralx-600"}`}>
              {t}
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-brand-500 py-2.5 text-center text-xs font-semibold text-white">Proefles plannen</div>
      </div>
    </div>
  );
}
