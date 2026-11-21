import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Aannemen lukt niet omdat de werker zelf nog iets moet invullen (lib/fiscal/eligibility.ts): KVK/btw/KOR, het
// rekeningnummer, het recht om te werken, of bij een uitzendkracht BSN en overeenkomst. De message is voor de werker ("Vul ze
// in bij Verificatie"). Accepteert een werkgever de reactie van zo'n kracht (app/werkgever/diensten/[shiftId]/actions.ts), dan
// leest hij een eigen, neutrale zin (kandidaatKaart.werkerNietKlaar); dit merk vertelt die actie dat het om zo'n fout gaat.
// Puur bestand (alleen lib/errors).
// ---------------------------------------------------------------------------

const MERK = "werker-niet-klaar";

/** 412 met de reden voor de werker (en de sleutel voor zijn app-taal), gemerkt als "de werker mist nog gegevens". */
export function werkerNietKlaarFout(reden: string, sleutel?: string): AppError {
  const fout = new AppError("PRECONDITION_FAILED", reden, 412, { reden: MERK });
  return sleutel ? fout.metSleutel(sleutel) : fout;
}

/** Komt deze fout doordat de werker nog gegevens mist (werkerNietKlaarFout)? */
export function isWerkerNietKlaar(err: unknown): boolean {
  if (!(err instanceof AppError)) return false;
  const details = err.details;
  return typeof details === "object" && details !== null && (details as { reden?: unknown }).reden === MERK;
}
