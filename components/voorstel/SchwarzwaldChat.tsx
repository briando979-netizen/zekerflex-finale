"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { SiteChat, type ChatHulp } from "@/components/sitechat/SiteChat";
import { wilBoeken } from "@/lib/sitechat/regels";

// De chat van Het Schwarzwald: de algemene SiteChat in hun huisstijl, met
// "Reserveren" als eigen actie. Reserveren loopt via hun eigen agenda (zelfde
// API, regels en limieten als /reserveren); daarna komt de reservering als
// melding in het gesprek, zodat het team ziet wat er via de chat geboekt is.

export interface ChatActiviteit {
  slug: string;
  naam: string;
  min: number;
  max: number;
}

const AGENDA = "/api/voorstel/schwarzwald/agenda";
const CHAT = "/api/voorstel/schwarzwald/chat";
const VELD = "mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const KNOP = "rounded-full bg-schw-night px-4 py-2 text-sm font-bold text-schw-cream disabled:opacity-50";

interface Slot {
  tijd: string;
  status: "vrij" | "bijna-vol" | "vol";
}

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL")}`;
const fout = (d: unknown, standaard: string) => (d as { error?: { message?: string } } | null)?.error?.message ?? standaard;

function ChatReserveren({
  hulp,
  activiteiten,
  morgen,
  bekend,
  accountPad,
}: {
  hulp: ChatHulp;
  activiteiten: ChatActiviteit[];
  morgen: string;
  bekend: { naam: string; email: string; telefoon: string } | null;
  accountPad: string;
}) {
  const [slug, setSlug] = useState("");
  const [datum, setDatum] = useState(morgen);
  const [personen, setPersonen] = useState("");
  const [sloten, setSloten] = useState<Slot[] | null>(null);
  const [prijs, setPrijs] = useState<number | null>(null);
  const [tijd, setTijd] = useState("");
  const [gegevens, setGegevens] = useState({ naam: bekend?.naam ?? "", email: bekend?.email ?? "", telefoon: bekend?.telefoon ?? "", akkoord: false });
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const [klaar, setKlaar] = useState<{ id: string; tekst: string } | null>(null);
  const gekozen = activiteiten.find((a) => a.slug === slug);

  async function zoek(e: FormEvent) {
    e.preventDefault();
    const n = Number(personen || gekozen?.min || 0);
    if (!gekozen) return setMelding("Kies eerst een activiteit.");
    if (!datum || datum < morgen) return setMelding("Kies een datum vanaf morgen.");
    if (!Number.isInteger(n) || n < gekozen.min || n > gekozen.max) return setMelding(`Voor ${gekozen.naam} kun je online met ${gekozen.min} tot ${gekozen.max} personen boeken.`);
    setBezig(true);
    setMelding("");
    setTijd("");
    try {
      const r = await fetch(`${AGENDA}?activiteit=${encodeURIComponent(slug)}&personen=${n}&datum=${datum}`, { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { sloten?: Slot[]; prijs?: number | null; status?: string } | null;
      if (!r.ok) throw new Error(fout(d, "De vrije tijden konden niet worden opgehaald."));
      setPersonen(String(n));
      setSloten(d?.sloten ?? []);
      setPrijs(d?.prijs ?? null);
      if (d?.status === "gesloten") setMelding("Op deze dag zijn we gesloten. Kies een andere datum.");
    } catch (err) {
      setMelding(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  async function boek(e: FormEvent) {
    e.preventDefault();
    if (!gegevens.akkoord) return setMelding("Zet het vinkje om de proefboeking te bevestigen.");
    setBezig(true);
    setMelding("");
    try {
      const r = await fetch(AGENDA, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activiteit: slug, datum, tijd, personen: Number(personen), naam: gegevens.naam, email: gegevens.email, telefoon: gegevens.telefoon, opmerking: "Geboekt via de chat", akkoord: true }),
      });
      const d = (await r.json().catch(() => null)) as { id?: string } | null;
      if (!r.ok || !d?.id) throw new Error(fout(d, "Reserveren is niet gelukt."));
      await fetch(CHAT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: hulp.gesprekId, actie: "geboekt", boeking: d.id }) }).catch(() => undefined);
      setKlaar({ id: d.id, tekst: `${gekozen?.naam ?? ""}, ${new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`))} om ${tijd}, ${personen} personen` });
      hulp.ververs();
    } catch (err) {
      setMelding(err instanceof Error ? err.message : "Reserveren is niet gelukt.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <div role="status" className="space-y-2 text-sm">
        <p className="font-bold">Gereserveerd! Nummer {klaar.id}</p>
        <p className="first-letter:uppercase">{klaar.tekst}.</p>
        <p>
          {bekend ? "Je vindt hem in " : "Bewaar je nummer. Met een account zie je je reserveringen terug in "}
          <Link href={accountPad} className="font-semibold underline">
            Mijn account
          </Link>
          .
        </p>
        <button type="button" onClick={hulp.sluitActie} className={KNOP}>
          Sluiten
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-bold">Reserveren</p>
      <form onSubmit={(e) => void zoek(e)} noValidate className="space-y-2">
        <label className="block font-semibold">
          Activiteit
          <select
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSloten(null);
              setPersonen(String(activiteiten.find((a) => a.slug === e.target.value)?.min ?? ""));
            }}
            className={VELD}
          >
            <option value="" disabled>
              Kies een activiteit
            </option>
            {activiteiten.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.naam}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <label className="block font-semibold">
            Datum
            <input type="date" required min={morgen} value={datum} onChange={(e) => { setDatum(e.target.value); setSloten(null); }} className={VELD} />
          </label>
          <label className="block font-semibold">
            Personen
            <input type="number" inputMode="numeric" required min={gekozen?.min ?? 1} max={gekozen?.max ?? 500} value={personen} onChange={(e) => { setPersonen(e.target.value); setSloten(null); }} className={VELD} />
          </label>
        </div>
        <button type="submit" disabled={bezig} className={KNOP}>
          {bezig && !sloten ? "Bezig…" : "Toon vrije tijden"}
        </button>
      </form>

      {sloten && sloten.length === 0 && <p>Op deze dag zijn geen tijden. Kies een andere datum.</p>}
      {sloten && sloten.length > 0 && (
        <fieldset>
          <legend className="font-semibold">Kies een tijd{prijs !== null ? ` · richtprijs ${euro(prijs)} voor ${personen} personen` : ""}</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sloten.map((s) => (
              <button
                key={s.tijd}
                type="button"
                disabled={s.status === "vol"}
                aria-pressed={tijd === s.tijd}
                aria-label={s.status === "vol" ? `${s.tijd}, vol` : s.status === "bijna-vol" ? `${s.tijd}, bijna vol` : s.tijd}
                onClick={() => setTijd(s.tijd)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                  tijd === s.tijd ? "bg-schw-orange text-schw-night ring-schw-orange" : "bg-white ring-schw-night/15"
                }`}
              >
                {s.tijd}
                {s.status === "bijna-vol" ? " · bijna vol" : ""}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {tijd && (
        <form onSubmit={(e) => void boek(e)} noValidate className="space-y-2">
          <label className="block font-semibold">
            Naam
            <input required autoComplete="name" value={gegevens.naam} onChange={(e) => setGegevens({ ...gegevens, naam: e.target.value })} className={VELD} />
          </label>
          <label className="block font-semibold">
            E-mailadres
            <input type="email" required autoComplete="email" value={gegevens.email} onChange={(e) => setGegevens({ ...gegevens, email: e.target.value })} className={VELD} />
          </label>
          <label className="block font-semibold">
            Telefoonnummer
            <input type="tel" required autoComplete="tel" value={gegevens.telefoon} onChange={(e) => setGegevens({ ...gegevens, telefoon: e.target.value })} className={VELD} />
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" required checked={gegevens.akkoord} onChange={(e) => setGegevens({ ...gegevens, akkoord: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF5F1F]" />
            <span>Ik begrijp dat dit een ontwerpvoorstel is: deze reservering is een proefboeking, er wordt niemand gemaild en mijn gegevens worden na 30 dagen gewist.</span>
          </label>
          <button type="submit" disabled={bezig} className="rounded-full bg-schw-orange px-4 py-2 text-sm font-bold text-schw-night disabled:opacity-50">
            {bezig ? "Bezig…" : `Reserveer om ${tijd}`}
          </button>
        </form>
      )}

      {melding && (
        <p role="alert" className="rounded-xl bg-[#FDE2E2] p-2.5 text-xs font-semibold text-[#B91C1C]">
          {melding}
        </p>
      )}
    </div>
  );
}

export function SchwarzwaldChat({
  activiteiten,
  morgen,
  bekend,
  telefoon,
  accountPad,
}: {
  activiteiten: ChatActiviteit[];
  morgen: string;
  bekend: { naam: string; email: string; telefoon: string } | null;
  telefoon: string;
  accountPad: string;
}) {
  return (
    <div className="print:hidden">
      <SiteChat
        api={CHAT}
        opslag="schw-chat"
        titel="Het Schwarzwald"
        begroeting={`Hoi${bekend ? ` ${bekend.naam.split(" ")[0]}` : ""}! Ik ben de assistent van Het Schwarzwald. Vraag me alles over onze activiteiten, prijzen en openingstijden, of reserveer meteen.`}
        suggesties={["Wat kost buggy rijden?", "Wat zijn de openingstijden?", "Wat kunnen we doen met 20 collega's?", "Ik wil reserveren"]}
        contact={`bel ${telefoon}`}
        stijl={{ knop: "bg-schw-orange text-schw-night", kop: "bg-schw-night text-schw-cream", gast: "bg-schw-night text-schw-cream", actie: "bg-schw-orange text-schw-night" }}
        actieLabel="Reserveren"
        wilActie={wilBoeken}
        renderActie={(hulp) => <ChatReserveren hulp={hulp} activiteiten={activiteiten} morgen={morgen} bekend={bekend} accountPad={accountPad} />}
      />
    </div>
  );
}
