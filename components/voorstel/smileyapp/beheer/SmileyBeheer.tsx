"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { BASE, beeld } from "@/lib/voorstel/smileyapp";
import type { Aanvraag } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { API, ApiFout, BEHEER_API, Melding, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";
import { Aanvragen } from "@/components/voorstel/smileyapp/beheer/Aanvragen";
import { Agenda } from "@/components/voorstel/smileyapp/beheer/Agenda";
import { BlogBeheer } from "@/components/voorstel/smileyapp/beheer/BlogBeheer";
import { Cijfers } from "@/components/voorstel/smileyapp/beheer/Cijfers";
import { Gesprekken } from "@/components/voorstel/smileyapp/beheer/Gesprekken";
import { Overzicht, type TabSleutel } from "@/components/voorstel/smileyapp/beheer/Overzicht";
import { PakkettenBeheer } from "@/components/voorstel/smileyapp/beheer/PakkettenBeheer";
import { QrCode } from "@/components/voorstel/smileyapp/beheer/QrCode";
import { Rekenhulp } from "@/components/voorstel/smileyapp/beheer/Rekenhulp";
import { ReviewsBeheer } from "@/components/voorstel/smileyapp/beheer/ReviewsBeheer";
import { Team } from "@/components/voorstel/smileyapp/beheer/Team";
import { VergelijkBeheer } from "@/components/voorstel/smileyapp/beheer/VergelijkBeheer";
import { VragenBeheer } from "@/components/voorstel/smileyapp/beheer/VragenBeheer";
import { Weekmail } from "@/components/voorstel/smileyapp/beheer/Weekmail";

// Het beheer van SmileyApp als eigen scherm (zonder de omlijsting van de site,
// zie AlleenOpSite in de layout): donkere zijbalk met het logo en de
// tabbladen, op de telefoon een bovenbalk met een rij tabbladen die je veegt.
// Het gekozen tabblad staat in de adresbalk (#demo), zodat de link uit de
// meldingsmail meteen op de goede plek uitkomt.

const TABS: readonly (readonly [TabSleutel, string])[] = [
  ["overzicht", "Overzicht"],
  ["demo", "Demo-aanvragen"],
  ["partners", "Partners"],
  ["agenda", "Agenda"],
  ["gesprekken", "Gesprekken"],
  ["cijfers", "Cijfers"],
  ["blog", "Blog"],
  ["reviews", "Reviews"],
  ["vragen", "Vragen"],
  ["vergelijken", "Vergelijken"],
  ["pakketten", "Pakketten"],
  ["qr", "QR-code"],
  ["team", "Team"],
];
const isTab = (h: string): h is TabSleutel => TABS.some(([k]) => k === h);

interface Gegevens {
  ik: { naam: string; email: string; rol: "beheerder" | "medewerker"; via: "smileyapp" | "zekerflex" };
  aanvragen: Aanvraag[];
  tellers: { chatWacht: number; chatOngelezen: number; team: number };
}

function Uitloggen({ via, klasse }: { via: "smileyapp" | "zekerflex"; klasse: string }) {
  // via ZekerFlex binnen (platformbeheerder): daar uitloggen
  if (via === "zekerflex") {
    return (
      <form action={logoutAction}>
        <button type="submit" className={klasse}>
          Uitloggen
        </button>
      </form>
    );
  }
  return (
    <button
      type="button"
      className={klasse}
      onClick={() =>
        void vraag(`${API}/account`, { method: "POST", body: { actie: "uitloggen" } })
          .catch(() => undefined)
          .finally(() => window.location.reload())
      }
    >
      Uitloggen
    </button>
  );
}

export function SmileyBeheer({ wie, via, vandaag, pakketNamen }: { wie: string; via: "smileyapp" | "zekerflex"; vandaag: string; pakketNamen: Record<string, string> }) {
  const [tab, setTab] = useState<TabSleutel>("overzicht");
  const [data, setData] = useState<Gegevens | null>(null);
  const [fout, setFout] = useState("");

  const laad = useCallback(async () => {
    try {
      setData(await vraag<Gegevens>(BEHEER_API));
      setFout("");
    } catch (e) {
      // de sessie is verlopen of ingetrokken: terug naar de inlogkaart
      if (e instanceof ApiFout && e.status === 401) window.location.reload();
      else setFout(foutTekst(e, "Laden lukte niet."));
    }
  }, []);

  useEffect(() => {
    void laad();
    const t = setInterval(() => {
      if (!document.hidden) void laad();
    }, 60_000);
    return () => clearInterval(t);
  }, [laad]);

  useEffect(() => {
    const lees = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (isTab(h)) setTab(h);
    };
    lees();
    window.addEventListener("hashchange", lees);
    return () => window.removeEventListener("hashchange", lees);
  }, []);

  const naar = useCallback(
    (t: TabSleutel) => {
      setTab(t);
      window.history.replaceState(window.history.state, "", `#${t}`);
      window.scrollTo({ top: 0 });
      void laad();
    },
    [laad],
  );

  const bijgewerkt = useCallback((a: Aanvraag) => setData((d) => (d ? { ...d, aanvragen: d.aanvragen.map((x) => (x.id === a.id ? a : x)) } : d)), []);
  const verwijderd = useCallback((id: string) => setData((d) => (d ? { ...d, aanvragen: d.aanvragen.filter((x) => x.id !== id) } : d)), []);
  const herlaad = useCallback(() => void laad(), [laad]);

  const aanvragen = data?.aanvragen ?? [];
  const nieuw = (soort: Aanvraag["soort"]) => aanvragen.filter((a) => a.soort === soort && a.status === "nieuw").length;
  const teller: Record<TabSleutel, number> = { overzicht: 0, demo: nieuw("demo"), partners: nieuw("partner"), agenda: 0, gesprekken: data?.tellers.chatWacht ?? 0, cijfers: 0, blog: 0, reviews: 0, vragen: 0, vergelijken: 0, pakketten: 0, qr: 0, team: 0 };
  const titel = TABS.find(([k]) => k === tab)?.[1] ?? "";
  // smal (px-3) op de telefoon: logo, "Website" en "Uitloggen" passen dan ook op 320 px naast elkaar
  const LICHT = "rounded-full px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10 sm:px-4";
  const DONKER = "rounded-full px-4 py-2 text-sm font-semibold text-smiley-ink ring-1 ring-smiley-ink/15 hover:bg-smiley-mint";

  return (
    <div className="min-h-screen bg-smiley-cream lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sm-niet-printen bg-smiley-ink text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-6 lg:pb-4 lg:pt-7">
          <Link href={BASE} aria-label="Naar de website van Smileyapp" className="flex items-center gap-3">
            <Image src={beeld("logo.webp")} alt="" width={500} height={260} priority className="h-10 w-auto lg:h-16" />
          </Link>
          <p className="mt-4 hidden text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun lg:block">Beheer</p>
          <div className="flex items-center gap-2 lg:hidden">
            <Link href={BASE} className={LICHT}>
              Website
            </Link>
            <Uitloggen via={via} klasse={LICHT} />
          </div>
        </div>
        <nav aria-label="Beheer" className="lg:flex-1">
          {/* relative: de sr-only tekst in een tab mag niet aan het afknippen van de vegende rij ontsnappen */}
          <div role="tablist" aria-label="Onderdelen van het beheer" className="relative flex gap-1 overflow-x-auto px-4 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`sm-tab-${k}`}
                aria-selected={tab === k}
                aria-controls="sm-paneel"
                onClick={() => naar(k)}
                className={`relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-left text-sm font-semibold transition-colors lg:w-full lg:rounded-xl lg:px-3 lg:py-2.5 ${
                  tab === k ? "bg-smiley-sun text-smiley-ink" : "text-white/85 hover:bg-white/10"
                }`}
              >
                {label}
                {teller[k] > 0 && (
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold lg:ml-auto ${tab === k ? "bg-smiley-ink text-white" : "bg-smiley-sun text-smiley-ink"}`}>
                    {teller[k]}
                    <span className="sr-only"> nieuw</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
        <p className="hidden px-6 pb-6 text-xs leading-relaxed text-white/60 lg:block">Dit beheer hoort bij het ontwerpvoorstel van ZekerFlex voor SmileyApp.</p>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-smiley-ink/10 bg-white px-4 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-smiley-mute">Smileyapp · beheer</p>
            <h2 className="font-display text-2xl font-bold text-smiley-ink">{titel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-smiley-mute">
              Ingelogd als {wie}
              {data?.ik.rol === "medewerker" ? " (medewerker)" : ""}
            </p>
            <Link href={BASE} className={`hidden lg:inline-block ${DONKER}`}>
              Naar de website
            </Link>
            <span className="hidden lg:inline">
              <Uitloggen via={via} klasse={DONKER} />
            </span>
          </div>
        </header>
        <div id="sm-paneel" role="tabpanel" aria-labelledby={`sm-tab-${tab}`} className="mx-auto max-w-[1100px] space-y-4 px-4 py-6 sm:px-8">
          <Melding fout={fout} />
          {data === null && !fout && <p className="text-sm text-smiley-mute">Laden…</p>}
          {tab === "overzicht" && data && <Overzicht aanvragen={aanvragen} chatWacht={data.tellers.chatWacht} team={data.tellers.team} vandaag={vandaag} naar={naar} />}
          {tab === "overzicht" && data && <Weekmail rol={data.ik.rol} via={data.ik.via} email={data.ik.email} />}
          {tab === "overzicht" && data && <Rekenhulp rol={data.ik.rol} />}
          {tab === "demo" && data && <Aanvragen key="demo" soort="demo" lijst={aanvragen} pakketNamen={pakketNamen} bijgewerkt={bijgewerkt} verwijderd={verwijderd} />}
          {tab === "partners" && data && <Aanvragen key="partner" soort="partner" lijst={aanvragen} pakketNamen={pakketNamen} bijgewerkt={bijgewerkt} verwijderd={verwijderd} />}
          {tab === "agenda" && <Agenda vandaag={vandaag} bijgewerkt={herlaad} />}
          {tab === "gesprekken" && <Gesprekken bijgewerkt={herlaad} />}
          {tab === "cijfers" && <Cijfers />}
          {tab === "blog" && <BlogBeheer vandaag={vandaag} />}
          {tab === "reviews" && <ReviewsBeheer vandaag={vandaag} />}
          {tab === "vragen" && data && <VragenBeheer rol={data.ik.rol} />}
          {tab === "vergelijken" && data && <VergelijkBeheer rol={data.ik.rol} />}
          {tab === "pakketten" && <PakkettenBeheer />}
          {tab === "qr" && <QrCode />}
          {tab === "team" && <Team bijgewerkt={herlaad} />}
        </div>
      </div>
    </div>
  );
}
