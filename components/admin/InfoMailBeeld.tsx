import { timeAgoNl } from "@/lib/admin/format";
import { antwoordOnderwerp, antwoordTekst, type InfoSoort } from "@/lib/mail/info-indeling";
import { MAX_ANTWOORDEN_PER_UUR, MAX_LEEFTIJD_DAGEN, type InfoStand } from "@/lib/mail/info-ronde";
import { Empty, Panel, Pill } from "@/components/admin/kit";
import { InfoMailKnoppen } from "@/components/admin/InfoMailKnoppen";

const SOORT_NAAM: Record<InfoSoort, string> = { terugkaatser: "Terugkaatser", automatisch: "Automatisch", bedrijf: "Bedrijf", werkzoekend: "Werkzoekend", rest: "Overig" };
const SOORT_TOON: Record<InfoSoort, "neutral" | "ok" | "warn" | "crit"> = { terugkaatser: "crit", automatisch: "neutral", bedrijf: "warn", werkzoekend: "ok", rest: "neutral" };

/**
 * Beheer → Mail: wat de info-ronde (lib/mail/info-ronde.ts) met de postbus info@ doet, of in de proefstand zou doen.
 * Alleen het beeld; de gegevens haalt components/admin/InfoMailPanel.tsx op.
 */
export function InfoMailBeeld({ echt, stand }: { echt: boolean; stand: InfoStand | null }) {
  const voorbeeld = stand?.voorbeeld ?? { onderwerp: antwoordOnderwerp("Ik zoek werk"), tekst: antwoordTekst() };
  const beslissingen = stand?.beslissingen ?? [];
  return (
    <Panel
      flush
      title="Postbus info@ afhandelen"
      subtitle={
        echt
          ? `Echt: elke 5 minuten gaan automatische mails naar een eigen map, krijgt iemand die werk zoekt één eerste antwoord (hooguit ${MAX_ANTWOORDEN_PER_UUR} per uur) en krijg jij een melding bij een mail van een bedrijf. Er wordt nooit iets verwijderd.`
          : `Proef: hij deelt elke 5 minuten de nieuwe mails in en schrijft hieronder op wat hij zou doen. Er wordt niets verplaatst en niets verstuurd. Mails ouder dan ${MAX_LEEFTIJD_DAGEN} dagen blijven altijd met rust.`
      }
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={echt ? "ok" : "neutral"}>{echt ? "Echt" : "Proef"}</Pill>
          <InfoMailKnoppen echt={echt} />
        </span>
      }
    >
      {stand?.fout ? (
        <p role="alert" className="px-4 py-3 text-[0.8125rem] sm:px-5" style={{ color: "var(--a-text)", borderTop: "1px solid var(--a-border)" }}>
          De laatste ronde ({timeAgoNl(stand.at)}) kon de postbus niet lezen: {stand.fout}.
        </p>
      ) : null}
      {beslissingen.length === 0 ? (
        <Empty title="Nog geen beslissingen" body="De eerste ronde komt binnen 5 minuten na het live zetten. Daarna staan hier de laatste 20 mails met wat ermee gebeurt." />
      ) : (
        <ul>
          {beslissingen.map((b, i) => (
            <li key={`${b.at}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                  {b.onderwerp || "(geen onderwerp)"}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>
                  {b.van} · {timeAgoNl(b.at)}
                </span>
                <span className="block text-xs" style={{ color: "var(--a-dim)" }}>
                  {b.actie}
                </span>
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                {!b.echt ? <span className="text-xs" style={{ color: "var(--a-mute)" }}>proef</span> : null}
                <Pill tone={SOORT_TOON[b.soort] ?? "neutral"}>{SOORT_NAAM[b.soort] ?? b.soort}</Pill>
              </span>
            </li>
          ))}
        </ul>
      )}
      <details className="px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
        <summary className="cursor-pointer text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          Lees het eerste antwoord aan iemand die werk zoekt
        </summary>
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Onderwerp: {voorbeeld.onderwerp}
        </p>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg p-3 text-[0.8125rem] leading-relaxed" style={{ color: "var(--a-text)", background: "var(--a-panel-2)", border: "1px solid var(--a-border)", fontFamily: "inherit" }}>
          {voorbeeld.tekst}
        </pre>
      </details>
    </Panel>
  );
}
