"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Empty, Notice, Panel, Pill, type Tone } from "@/components/admin/kit";
import type { BeheerItem, BeheerOverzicht } from "@/lib/community/beheer";

// ---------------------------------------------------------------------------
// Beheer → Community (app/admin/community/page.tsx). Gemelde berichten eerst, dan het nieuwste, dan wie is uitgesloten.
// Na elke actie de stand die de server teruggeeft (AGENTS.md: na een wijziging de serverversie overnemen).
// ---------------------------------------------------------------------------

type Actie =
  | { actie: "tonen" | "verbergen" | "verwijderen" | "uitsluiten"; onderwerpId: string; reactieId: string | null; reden: string }
  | { actie: "vastpinnen" | "losmaken"; onderwerpId: string }
  | { actie: "toelaten"; userId: string }
  | { actie: "schrijven"; dicht: boolean };

const STATUS: Record<BeheerItem["status"], { label: string; tone: Tone }> = {
  zichtbaar: { label: "Zichtbaar", tone: "ok" },
  verborgen: { label: "Verborgen", tone: "warn" },
  verwijderd: { label: "Verwijderd", tone: "crit" },
};

export function CommunityBeheer({ begin }: { begin: BeheerOverzicht }) {
  const router = useRouter();
  const [data, setData] = useState<BeheerOverzicht>(begin);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function doe(body: Actie): Promise<boolean> {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/admin/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await r.json().catch(() => null)) as (BeheerOverzicht & { error?: { message?: string } }) | null;
      if (!r.ok || !d || d.error) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
      setData(d);
      router.refresh();
      return true;
    } catch (e) {
      setFout((e as Error).message);
      return false;
    } finally {
      setBezig(false);
    }
  }

  const dicht = data.instelling.schrijvenDicht;
  return (
    <div className="space-y-6">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}

      <Panel
        title="Nieuwe berichten"
        subtitle={dicht ? "Staan dicht: niemand kan een onderwerp starten of reageren (jij wel). Lezen en melden blijft open." : "Staan open: iedereen met een account kan meedoen."}
        actions={
          <button type="button" className={`a-btn ${dicht ? "a-btn-primary" : "a-btn-ghost"}`} disabled={bezig} onClick={() => void doe({ actie: "schrijven", dicht: !dicht })}>
            {dicht ? "Weer openzetten" : "Tijdelijk dichtzetten"}
          </button>
        }
      >
        <p className="px-4 py-3 text-sm sm:px-5" style={{ color: "var(--a-mute)" }}>
          Handig bij een golf spam. Na drie meldingen van verschillende mensen is een bericht vanzelf verborgen tot je het hier bekijkt.
        </p>
      </Panel>

      <Panel title="Gemeld" subtitle="Bekijk het bericht en kies: tonen (de meldingen tellen dan niet meer), verbergen of verwijderen." flush>
        {data.gemeld.length === 0 ? (
          <Empty title="Niets gemeld" body="Zodra iemand een bericht meldt, staat het hier. Je krijgt dan ook een bericht van de melder." />
        ) : (
          <ul>
            {data.gemeld.map((item) => (
              <BeheerKaart key={item.sleutel} item={item} bezig={bezig} doe={doe} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Nieuwste berichten" subtitle="De laatste onderwerpen en reacties (zonder de gemelde hierboven)." flush>
        {data.recent.length === 0 ? (
          <Empty title="Nog geen berichten" body="Het welkomstonderwerp staat al klaar op /community." />
        ) : (
          <ul>
            {data.recent.map((item) => (
              <BeheerKaart key={item.sleutel} item={item} bezig={bezig} doe={doe} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Uitgesloten" subtitle="Wie hier staat, kan nog lezen maar niet meer posten, reageren of Handig geven." flush>
        {data.uitgesloten.length === 0 ? (
          <Empty title="Niemand uitgesloten" />
        ) : (
          <ul>
            {data.uitgesloten.map((u) => (
              <li key={u.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-0 text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                  <a href={`/admin/gebruikers/${u.userId}`} className="font-semibold underline">
                    {u.naam}
                  </a>{" "}
                  <span style={{ color: "var(--a-mute)" }}>
                    · sinds {u.sinds}
                    {u.reden ? ` · ${u.reden}` : ""}
                  </span>
                </span>
                <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => void doe({ actie: "toelaten", userId: u.userId })}>
                  Weer toelaten
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function BeheerKaart({ item, bezig, doe }: { item: BeheerItem; bezig: boolean; doe: (a: Actie) => Promise<boolean> }) {
  const redenId = useId();
  const [reden, setReden] = useState("");
  const [zeker, setZeker] = useState<"verwijderen" | "uitsluiten" | null>(null);
  const status = STATUS[item.status];
  const bericht = { onderwerpId: item.onderwerpId, reactieId: item.reactieId, reden };

  return (
    <li className="space-y-2 px-4 py-4 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="neutral" dot={false}>
          {item.soort === "onderwerp" ? "Onderwerp" : "Reactie"}
        </Pill>
        <Pill tone={status.tone}>{status.label}</Pill>
        {item.verborgenDoor === "meldingen" && <Pill tone="warn">Vanzelf verborgen na meldingen</Pill>}
        {item.tellend > 0 && <Pill tone="crit">{item.tellend === 1 ? "1 melding" : `${item.tellend} meldingen`}</Pill>}
        {item.vastgepind && <Pill tone="plan">Vastgepind</Pill>}
        <span className="text-xs" style={{ color: "var(--a-mute)" }}>
          {item.wanneer}
        </span>
      </div>
      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        <a href={item.pad} target="_blank" rel="noopener noreferrer" className="underline">
          {item.soort === "reactie" ? `Reactie bij: ${item.titel}` : item.titel}
        </a>
      </p>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>
        Door {item.auteur.naam}
        {item.auteur.rolLabel ? ` · ${item.auteur.rolLabel}` : ""}
        {item.auteur.userId && (
          <>
            {" · "}
            <a href={`/admin/gebruikers/${item.auteur.userId}`} className="underline">
              bekijk account
            </a>
          </>
        )}
        {item.auteur.uitgesloten ? " · uitgesloten" : ""}
      </p>
      {item.tekst && (
        <p className="whitespace-pre-line break-words text-sm" style={{ color: "var(--a-text)" }}>
          {item.tekst}
        </p>
      )}
      {item.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.fotos.map((f) => (
            <a key={f} href={f} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f} alt="Foto bij het bericht" className="h-20 w-20 rounded-lg object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {item.meldingen.length > 0 && (
        <ul className="space-y-1 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
          {item.meldingen.map((m, i) => (
            <li key={i}>
              <span className="font-semibold">{m.reden}</span> · {m.wanneer}
              {m.toelichting ? `: ${m.toelichting}` : ""}
            </li>
          ))}
        </ul>
      )}
      {item.beheerReden && (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Reden van beheer: {item.beheerReden}
        </p>
      )}
      {item.status !== "verwijderd" && (
        <div className="space-y-2">
          <label htmlFor={redenId} className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
            Reden (de schrijver ziet hem bij verbergen of verwijderen)
          </label>
          <input id={redenId} className="a-input w-full" maxLength={300} value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Bijvoorbeeld: reclame" />
          <div className="flex flex-wrap gap-2">
            {item.status !== "zichtbaar" || item.tellend > 0 ? (
              <button type="button" className="a-btn a-btn-primary text-xs" disabled={bezig} onClick={() => void doe({ actie: "tonen", ...bericht })}>
                Tonen
              </button>
            ) : null}
            {item.status === "zichtbaar" && (
              <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => void doe({ actie: "verbergen", ...bericht })}>
                Verbergen
              </button>
            )}
            {zeker === "verwijderen" ? (
              <button type="button" className="a-btn a-btn-primary text-xs" disabled={bezig} onClick={() => void doe({ actie: "verwijderen", ...bericht }).then(() => setZeker(null))}>
                Ja, verwijder definitief
              </button>
            ) : (
              <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => setZeker("verwijderen")}>
                Verwijderen
              </button>
            )}
            {item.auteur.userId && !item.auteur.uitgesloten && (
              zeker === "uitsluiten" ? (
                <button type="button" className="a-btn a-btn-primary text-xs" disabled={bezig} onClick={() => void doe({ actie: "uitsluiten", ...bericht }).then(() => setZeker(null))}>
                  Ja, sluit {item.auteur.naam} uit
                </button>
              ) : (
                <button type="button" className="a-btn a-btn-ghost text-xs" disabled={bezig} onClick={() => setZeker("uitsluiten")}>
                  Uitsluiten van de community
                </button>
              )
            )}
            {item.vastgepind !== null && (
              <button
                type="button"
                className="a-btn a-btn-ghost text-xs"
                disabled={bezig}
                onClick={() => void doe(item.vastgepind ? { actie: "losmaken", onderwerpId: item.onderwerpId } : { actie: "vastpinnen", onderwerpId: item.onderwerpId })}
              >
                {item.vastgepind ? "Losmaken" : "Vastpinnen"}
              </button>
            )}
            {zeker && (
              <button type="button" className="a-btn a-btn-ghost text-xs" onClick={() => setZeker(null)}>
                Annuleren
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
