"use client";

// Gedeelde hulpjes voor het SmileyApp-beheer (alleen in de browser): ophalen,
// opmaak en kleine bouwstenen. De regels zelf staan in lib/voorstel (puur).

export const API = "/api/voorstel/smileyapp";
export const BEHEER_API = `${API}/beheer`;

/** Een fout van de server, met de status (401 = niet meer ingelogd, 423 = alleen voor een beheerder). */
export class ApiFout extends Error {
  readonly status: number;
  constructor(tekst: string, status: number) {
    super(tekst);
    this.name = "ApiFout";
    this.status = status;
  }
}

export async function vraag<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    ...(init?.body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) } : {}),
  });
  const d = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new ApiFout(d.error?.message ?? "Er ging iets mis. Probeer het opnieuw.", r.status);
  return d;
}

export const foutTekst = (e: unknown, anders = "Er ging iets mis. Probeer het opnieuw.") => (e instanceof Error && e.message ? e.message : anders);

/** "19 nov 14:05" in Nederlandse tijd, op elke telefoon gelijk. */
export const moment = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
};

export const KAART = "rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(14,42,32,0.06)] ring-1 ring-smiley-ink/5 sm:p-6";
export const VELD = "w-full rounded-2xl border-0 bg-white px-4 py-2.5 text-base text-smiley-ink ring-1 ring-smiley-ink/15 focus:outline-none focus:ring-2 focus:ring-smiley-leaf";
export const LABEL = "block text-sm font-semibold text-smiley-ink";
export const KNOP = "rounded-full bg-smiley-ink px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-smiley-deep disabled:opacity-50";
export const KNOP_LICHT = "rounded-full bg-white px-4 py-2 text-sm font-semibold text-smiley-ink ring-1 ring-smiley-ink/15 hover:bg-smiley-mint disabled:opacity-50";
export const KNOP_ROOD = "rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#8E2A1E] ring-1 ring-[#8E2A1E]/30 hover:bg-smiley-coral/15 disabled:opacity-50";

export function Pil({ label, kleur }: { label: string; kleur: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${kleur}`}>{label}</span>;
}

export function Melding({ fout, ok }: { fout?: string; ok?: string }) {
  if (fout)
    return (
      <p role="alert" className="rounded-2xl bg-smiley-coral/15 p-3 text-sm font-semibold text-[#8E2A1E]">
        {fout}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="rounded-2xl bg-smiley-mint p-3 text-sm font-semibold text-smiley-leaf">
        {ok}
      </p>
    );
  return null;
}
