import { tekstDelen } from "@/lib/community/regels";

/**
 * Tekst van een gebruiker in de community: altijd platte tekst met regeleinden (geen HTML, geen markdown). Alleen een
 * webadres wordt een link, met rel="nofollow ugc noopener". Geen hooks: bruikbaar op de server en in de browser.
 */
export function PlatteTekst({ tekst, className = "" }: { tekst: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line break-words ${className}`}>
      {tekstDelen(tekst).map((d, i) =>
        d.soort === "link" ? (
          <a key={i} href={d.href} rel="nofollow ugc noopener" target="_blank" className="break-all font-medium text-brand-700 underline underline-offset-2 hover:text-brand-600">
            {d.tekst}
          </a>
        ) : (
          <span key={i}>{d.tekst}</span>
        ),
      )}
    </p>
  );
}
