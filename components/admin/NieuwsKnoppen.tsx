"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KNOP = "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50";
const RAND = { color: "var(--a-text)", border: "1px solid var(--a-border-strong)" } as const;
const VOL = { color: "var(--a-panel)", background: "var(--a-text)" } as const;

async function stuur(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/admin/nieuws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.ok;
}

/** De knoppen bovenaan Beheer → Nieuwsroom: de stand (eerst goedkeuren of vanzelf plaatsen) en "Nu nieuws ophalen". */
export function NieuwsStandKnoppen({ vanzelf }: { vanzelf: boolean }) {
  const router = useRouter();
  const [bezig, setBezig] = useState<"" | "stand" | "ronde">("");
  const [zeker, setZeker] = useState(false);
  const [melding, setMelding] = useState("");

  async function doe(soort: "stand" | "ronde", body: Record<string, unknown>, klaar: string) {
    setBezig(soort);
    setMelding(soort === "ronde" ? "Bezig met ophalen en schrijven. Dat kan een paar minuten duren." : "");
    const ok = await stuur(body).catch(() => false);
    setBezig("");
    setZeker(false);
    setMelding(ok ? klaar : "Dat lukte niet. Probeer het opnieuw.");
    if (ok) router.refresh();
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {zeker ? (
        <>
          <span className="text-xs" style={{ color: "var(--a-text)" }}>
            Nieuwe berichten zonder controle op de site zetten?
          </span>
          <button type="button" disabled={bezig !== ""} onClick={() => void doe("stand", { actie: "stand", vanzelf: true }, "Berichten gaan nu vanzelf op de site.")} className={KNOP} style={VOL}>
            Ja, vanzelf plaatsen
          </button>
          <button type="button" disabled={bezig !== ""} onClick={() => setZeker(false)} className={KNOP} style={RAND}>
            Nee
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={bezig !== "" || !vanzelf} aria-pressed={!vanzelf} onClick={() => void doe("stand", { actie: "stand", vanzelf: false }, "Berichten wachten nu eerst op jou.")} className={KNOP} style={RAND}>
            Eerst goedkeuren
          </button>
          <button type="button" disabled={bezig !== "" || vanzelf} aria-pressed={vanzelf} onClick={() => setZeker(true)} className={KNOP} style={RAND}>
            Vanzelf plaatsen
          </button>
          <button type="button" disabled={bezig !== ""} onClick={() => void doe("ronde", { actie: "ronde" }, "Klaar. De uitslag staat hieronder.")} className={KNOP} style={VOL}>
            {bezig === "ronde" ? "Bezig…" : "Nu nieuws ophalen"}
          </button>
        </>
      )}
      {melding ? (
        <span role="status" className="text-xs" style={{ color: "var(--a-text)" }}>
          {melding}
        </span>
      ) : null}
    </span>
  );
}

/** De knoppen bij één bericht: plaatsen, van de site halen of weggooien. */
export function NieuwsBerichtKnoppen({ slug, status }: { slug: string; status: "concept" | "geplaatst" | "verborgen" }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");

  async function doe(actie: "plaats" | "verberg" | "wis") {
    setBezig(true);
    setFout("");
    const ok = await stuur({ actie, slug }).catch(() => false);
    setBezig(false);
    setZeker(false);
    if (ok) router.refresh();
    else setFout("Dat lukte niet.");
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {status !== "geplaatst" ? (
        <button type="button" disabled={bezig} onClick={() => void doe("plaats")} className={KNOP} style={VOL}>
          Plaatsen
        </button>
      ) : (
        <button type="button" disabled={bezig} onClick={() => void doe("verberg")} className={KNOP} style={RAND}>
          Van de site halen
        </button>
      )}
      {zeker ? (
        <>
          <button type="button" disabled={bezig} onClick={() => void doe("wis")} className={KNOP} style={VOL}>
            Ja, weggooien
          </button>
          <button type="button" disabled={bezig} onClick={() => setZeker(false)} className={KNOP} style={RAND}>
            Nee
          </button>
        </>
      ) : status !== "geplaatst" ? (
        <button type="button" disabled={bezig} onClick={() => setZeker(true)} className={KNOP} style={RAND}>
          Weggooien
        </button>
      ) : null}
      {fout ? (
        <span role="alert" className="text-xs" style={{ color: "var(--a-text)" }}>
          {fout}
        </span>
      ) : null}
    </span>
  );
}
