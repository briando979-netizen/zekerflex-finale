"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { employerOnboardingAction, type EmployerOnboardingState } from "@/app/werkgever/onboarding/actions";
import { KvkZoeker } from "@/components/kvk/KvkZoeker";
import { BUITEN_LANDEN, EU_LANDEN, landSoort } from "@/lib/onboarding/buitenland";
import { btn, input } from "@/components/studio/ui";

// Bedrijf verifiëren in de studio (Studio → Bedrijf): dezelfde server-actie als de stap in de
// werkgever-onboarding (KVK in het Handelsregister, of btw-/registratienummer buiten Nederland),
// maar zonder iets over klussen of flexwerkers.

function Verstuur() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn.primary}>
      {pending ? "Controleren…" : "Bedrijf verifiëren"}
    </button>
  );
}

const label = "mb-1 block text-xs font-semibold text-[#303030]";
const hint = "mt-1 block text-xs text-[#707070]";

export function KvkFormulier({ kvkPrefill, landPrefill }: { kvkPrefill?: string | undefined; landPrefill?: string | undefined }) {
  const router = useRouter();
  const id = useId();
  const [state, actie] = useFormState<EmployerOnboardingState, FormData>(employerOnboardingAction, { error: null, done: false });
  const [land, setLand] = useState(state.values?.land ?? landPrefill ?? "NL");
  const soort = landSoort(land) ?? "NL";
  const v = state.values;

  // gelukt: de pagina laat de nieuwe stand zien (geverifieerd, of in controle)
  useEffect(() => {
    if (state.done) router.refresh();
  }, [state.done, router]);

  if (state.done) {
    return (
      <p role="status" className="rounded-xl bg-[#cdfed4] px-3 py-2.5 text-sm text-[#014b1a]">
        {state.inControle
          ? "Je gegevens kloppen. We controleren nog of je bij dit bedrijf hoort, meestal binnen een werkdag; je krijgt bericht."
          : `Gelukt: ${state.companyName ?? "je bedrijf"} is geverifieerd.`}
      </p>
    );
  }

  return (
    <form action={actie} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fed1d7] px-3 py-2.5 text-sm text-[#8e0b21]">
          {state.error}
        </p>
      )}
      <KvkZoeker
        label="Zoek je bedrijf in het Handelsregister"
        vulFormulier={{ kvk: "kvkNumber", address: "addressLine", houseNumber: "houseNumber", postalCode: "postalCode", name: "branchName" }}
        alleenAlsLeeg={["name"]}
      />
      <div>
        <label htmlFor={`${id}-land`} className={label}>Land van je bedrijf</label>
        <select id={`${id}-land`} name="land" value={land} onChange={(e) => setLand(e.target.value)} className={input}>
          <option value="NL">Nederland</option>
          <optgroup label="Europese Unie">
            {EU_LANDEN.map((l) => (
              <option key={l.code} value={l.code}>{l.naam}</option>
            ))}
          </optgroup>
          <optgroup label="Buiten de EU">
            {BUITEN_LANDEN.map((l) => (
              <option key={l.code} value={l.code}>{l.naam}</option>
            ))}
          </optgroup>
        </select>
      </div>
      {soort === "NL" && (
        <div>
          <label htmlFor={`${id}-kvk`} className={label}>KVK-nummer</label>
          <input id={`${id}-kvk`} name="kvkNumber" required inputMode="numeric" placeholder="12345678" defaultValue={v?.kvkNumber ?? kvkPrefill ?? ""} className={input} />
          <span className={hint}>8 cijfers, bijvoorbeeld van je KVK-uittreksel.</span>
        </div>
      )}
      {soort === "EU" && (
        <div>
          <label htmlFor={`${id}-btw`} className={label}>Btw-nummer</label>
          <input id={`${id}-btw`} name="btwNummer" required autoCapitalize="characters" placeholder="DE123456789" defaultValue={v?.btwNummer ?? ""} className={input} />
          <span className={hint}>We controleren het in het Europese btw-register (VIES).</span>
        </div>
      )}
      {soort === "BUITEN" && (
        <div>
          <label htmlFor={`${id}-reg`} className={label}>Registratienummer van je bedrijf</label>
          <input id={`${id}-reg`} name="registratieNummer" required defaultValue={v?.registratieNummer ?? ""} className={input} />
          <span className={hint}>Een medewerker van ZekerFlex controleert het met de hand.</span>
        </div>
      )}
      <div>
        <label htmlFor={`${id}-naam`} className={label}>Naam van je bedrijf</label>
        <input id={`${id}-naam`} name="branchName" required autoComplete="organization" defaultValue={v?.branchName ?? ""} aria-invalid={state.fieldErrors?.branchName ? true : undefined} className={input} />
        {state.fieldErrors?.branchName && <span role="alert" className="mt-1 block text-xs text-[#b42318]">{state.fieldErrors.branchName}</span>}
      </div>
      <div>
        <label htmlFor={`${id}-adres`} className={label}>Adres (straat)</label>
        <input id={`${id}-adres`} name="addressLine" required autoComplete="street-address" defaultValue={v?.addressLine ?? ""} aria-invalid={state.fieldErrors?.addressLine ? true : undefined} className={input} />
        {state.fieldErrors?.addressLine && <span role="alert" className="mt-1 block text-xs text-[#b42318]">{state.fieldErrors.addressLine}</span>}
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div>
          <label htmlFor={`${id}-pc`} className={label}>Postcode</label>
          <input id={`${id}-pc`} name="postalCode" required autoComplete="postal-code" placeholder="1012 AB" defaultValue={v?.postalCode ?? ""} aria-invalid={state.fieldErrors?.postalCode ? true : undefined} className={input} />
          {state.fieldErrors?.postalCode && <span role="alert" className="mt-1 block text-xs text-[#b42318]">{state.fieldErrors.postalCode}</span>}
        </div>
        <div>
          <label htmlFor={`${id}-nr`} className={label}>Huisnummer</label>
          <input id={`${id}-nr`} name="houseNumber" required autoComplete="off" placeholder="10" defaultValue={v?.houseNumber ?? ""} aria-invalid={state.fieldErrors?.houseNumber ? true : undefined} className={input} />
          {state.fieldErrors?.houseNumber && <span role="alert" className="mt-1 block text-xs text-[#b42318]">{state.fieldErrors.houseNumber}</span>}
        </div>
      </div>
      <div className="flex justify-end">
        <Verstuur />
      </div>
    </form>
  );
}
