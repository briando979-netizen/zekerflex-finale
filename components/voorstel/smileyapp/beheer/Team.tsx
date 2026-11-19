"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ROLLEN, ROL_LABEL, STATUS_LABEL, type AccountStatus, type Rol } from "@/lib/voorstel/smileyapp-account-regels";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, KNOP_ROOD, LABEL, Melding, Pil, VELD, foutTekst, moment, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// Het team: wie in het beheer kan inloggen. Een beheerder nodigt iemand uit met
// naam en e-mailadres (die krijgt een mail om een wachtwoord te kiezen), wijzigt
// rollen, blokkeert en verwijdert. Een medewerker ziet de lijst, zonder knoppen.
// Je eigen account kun je hier niet aanpassen; de server controleert dat ook.

interface Lid {
  email: string;
  naam: string;
  rol: Rol;
  status: AccountStatus;
  aangemaakt: string;
  uitgenodigdDoor?: string;
  laatstIngelogd?: string;
  uitnodigingTot?: string;
}

const URL_TEAM = `${BEHEER_API}/team`;
const STATUS_KLEUR: Record<AccountStatus, string> = {
  uitgenodigd: "bg-smiley-sun text-smiley-ink",
  actief: "bg-smiley-mint text-smiley-leaf",
  geblokkeerd: "bg-smiley-coral/20 text-[#8E2A1E]",
};

function LidRij({ lid, ik, magBeheren, doe }: { lid: Lid; ik: boolean; magBeheren: boolean; doe: (body: Record<string, unknown>, klaar: string) => Promise<boolean> }) {
  const [bezig, setBezig] = useState(false);
  const [zeker, setZeker] = useState(false);
  const stuur = async (body: Record<string, unknown>, klaar: string) => {
    setBezig(true);
    await doe(body, klaar);
    setBezig(false);
    setZeker(false);
  };
  return (
    <li className={`${KAART} ${lid.status === "geblokkeerd" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-display text-lg font-bold text-smiley-ink">
            {lid.naam}
            {ik && <span className="ml-2 rounded-full bg-smiley-ink/10 px-2 py-0.5 align-middle font-sans text-xs font-bold">jij</span>}
          </p>
          <p className="break-all text-sm text-smiley-mute">{lid.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pil label={ROL_LABEL[lid.rol]} kleur={lid.rol === "beheerder" ? "bg-smiley-ink text-white" : "bg-smiley-ink/10 text-smiley-ink"} />
          <Pil label={STATUS_LABEL[lid.status]} kleur={STATUS_KLEUR[lid.status]} />
        </div>
      </div>
      <p className="mt-2 text-xs text-smiley-mute">
        {lid.status === "uitgenodigd"
          ? `Uitgenodigd${lid.uitgenodigdDoor ? ` door ${lid.uitgenodigdDoor}` : ""}${lid.uitnodigingTot ? `; de link werkt tot ${moment(lid.uitnodigingTot)}` : ""}.`
          : lid.laatstIngelogd
            ? `Laatst ingelogd op ${moment(lid.laatstIngelogd)}.`
            : "Nog niet ingelogd."}
      </p>
      {magBeheren && !ik && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-smiley-ink/10 pt-4">
          <div>
            <label htmlFor={`rol-${lid.email}`} className="block text-xs font-semibold text-smiley-mute">
              Rol
            </label>
            <select id={`rol-${lid.email}`} value={lid.rol} disabled={bezig} onChange={(e) => void stuur({ actie: "rol", email: lid.email, rol: e.target.value }, "Rol gewijzigd.")} className={`mt-1 w-auto py-2 text-sm ${VELD}`}>
              {ROLLEN.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {lid.status === "uitgenodigd" && (
            <button type="button" disabled={bezig} onClick={() => void stuur({ actie: "uitnodigen", naam: lid.naam, email: lid.email, rol: lid.rol }, `Nieuwe uitnodiging verstuurd naar ${lid.email}. De vorige link werkt niet meer.`)} className={KNOP_LICHT}>
              Opnieuw uitnodigen
            </button>
          )}
          <button type="button" disabled={bezig} onClick={() => void stuur({ actie: "blokkeren", email: lid.email, geblokkeerd: lid.status !== "geblokkeerd" }, lid.status === "geblokkeerd" ? "Account gedeblokkeerd." : "Account geblokkeerd.")} className={KNOP_LICHT}>
            {lid.status === "geblokkeerd" ? "Deblokkeren" : "Blokkeren"}
          </button>
          {zeker ? (
            <>
              <span className="text-sm font-semibold text-[#8E2A1E]">Account van {lid.naam} verwijderen?</span>
              <button type="button" disabled={bezig} onClick={() => void stuur({ actie: "verwijderen", email: lid.email }, "Account verwijderd.")} className={KNOP_ROOD}>
                Ja, verwijder
              </button>
              <button type="button" disabled={bezig} onClick={() => setZeker(false)} className={KNOP_LICHT}>
                Nee
              </button>
            </>
          ) : (
            <button type="button" disabled={bezig} onClick={() => setZeker(true)} className={KNOP_ROOD}>
              Verwijderen
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function Team({ bijgewerkt }: { bijgewerkt: () => void }) {
  const [data, setData] = useState<{ ik: { email: string; rol: Rol }; accounts: Lid[] } | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<Rol>("medewerker");
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      setData(await vraag<{ ik: { email: string; rol: Rol }; accounts: Lid[] }>(URL_TEAM));
    } catch (e) {
      setFout(foutTekst(e, "Laden lukte niet."));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  /** Eén wijziging; daarna de lijst van de server overnemen (de regels kunnen meer raken dan één veld). */
  const doe = useCallback(
    async (body: Record<string, unknown>, klaar: string): Promise<boolean> => {
      setFout("");
      setOk("");
      try {
        const d = await vraag<{ verstuurd?: boolean }>(URL_TEAM, { method: "POST", body });
        await laad();
        bijgewerkt();
        if (d.verstuurd === false) setFout("De uitnodiging is aangemaakt, maar de mail kon niet worden afgeleverd. Controleer het e-mailadres en nodig opnieuw uit.");
        else setOk(klaar);
        return true;
      } catch (e) {
        setFout(foutTekst(e, "Dat lukte niet."));
        return false;
      }
    },
    [laad, bijgewerkt],
  );

  async function nodigUit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    if (await doe({ actie: "uitnodigen", naam, email, rol }, `Uitnodiging verstuurd naar ${email.trim()}. De link in de mail werkt 14 dagen.`)) {
      setNaam("");
      setEmail("");
      setRol("medewerker");
    }
    setBezig(false);
  }

  const magBeheren = data?.ik.rol === "beheerder";
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Iedereen in deze lijst kan inloggen in het beheer en ziet de aanvragen en de gesprekken. Alleen een beheerder kan mensen uitnodigen, rollen wijzigen, blokkeren en verwijderen.
      </p>
      <Melding fout={fout} ok={ok} />

      {magBeheren && (
        <section aria-labelledby="sm-uitnodigen-kop" className={KAART}>
          <h3 id="sm-uitnodigen-kop" className="font-display text-xl font-bold text-smiley-ink">
            Nodig iemand uit
          </h3>
          <p className="mt-1 text-sm text-smiley-mute">Diegene krijgt een mail met een knop om een wachtwoord te kiezen.</p>
          <form onSubmit={(e) => void nodigUit(e)} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <div>
              <label htmlFor="sm-uit-naam" className={LABEL}>
                Naam
              </label>
              <input id="sm-uit-naam" type="text" required minLength={2} maxLength={80} autoComplete="off" value={naam} onChange={(e) => setNaam(e.target.value)} className={`mt-1.5 ${VELD}`} />
            </div>
            <div>
              <label htmlFor="sm-uit-email" className={LABEL}>
                E-mailadres
              </label>
              <input id="sm-uit-email" type="email" required maxLength={200} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1.5 ${VELD}`} />
            </div>
            <div>
              <label htmlFor="sm-uit-rol" className={LABEL}>
                Rol
              </label>
              <select id="sm-uit-rol" value={rol} onChange={(e) => setRol(e.target.value === "beheerder" ? "beheerder" : "medewerker")} className={`mt-1.5 ${VELD}`}>
                {ROLLEN.map((r) => (
                  <option key={r} value={r}>
                    {ROL_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={bezig} className={`py-3 ${KNOP}`}>
              {bezig ? "Bezig…" : "Uitnodigen"}
            </button>
          </form>
        </section>
      )}

      {data === null ? (
        <p className="text-sm text-smiley-mute">Laden…</p>
      ) : data.accounts.length === 0 ? (
        <p className={`${KAART} text-smiley-mute`}>Er is nog niemand uitgenodigd. Nodig hierboven de eerste beheerder uit.</p>
      ) : (
        <ul aria-label="Teamleden" className="space-y-3">
          {data.accounts.map((a) => (
            <LidRij key={a.email} lid={a} ik={!!data.ik.email && data.ik.email === a.email} magBeheren={magBeheren} doe={doe} />
          ))}
        </ul>
      )}
    </div>
  );
}
