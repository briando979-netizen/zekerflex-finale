import { LogoGlyph } from "@/components/brand/Logo";
import { naamInitialen } from "@/lib/naam/initialen";
import type { AuteurWeergave } from "@/lib/community/weergave";

/** De schrijver van een bericht: foto (of initialen, of het logo van het team), voornaam met letter, label en tijd. */
export function Auteur({ auteur, wanneer, klein = false }: { auteur: AuteurWeergave; wanneer: string; klein?: boolean }) {
  const maat = klein ? 32 : 40;
  // violet = verificatie (één kleur, één betekenis): alleen het ZekerFlex-team; werker en bedrijf rustig grijs
  const label = auteur.rol === "team" ? "bg-trust-soft text-trust-ink" : "bg-paper-200 text-neutralx-700";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-paper-200 text-xs font-semibold text-neutralx-600"
        style={{ width: maat, height: maat }}
        aria-hidden
      >
        {auteur.team ? (
          <LogoGlyph size={maat} />
        ) : auteur.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={auteur.avatar} alt="" width={maat} height={maat} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          naamInitialen(auteur.naam) || "?"
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-semibold text-ink">{auteur.naam}</span>
          {auteur.rolLabel && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${label}`}>{auteur.rolLabel}</span>}
        </span>
        <span className="block text-xs text-neutralx-500">{wanneer}</span>
      </span>
    </div>
  );
}
