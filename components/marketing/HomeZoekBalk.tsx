"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ZOEK_CHIPS, ZOEK_PLACEHOLDER, ZOEK_VOORBEELDEN, kiesWegwijzer, type Wegwijzer } from "@/lib/marketing/home-breed";

// ---------------------------------------------------------------------------
// De antwoordende instap bovenaan de brede voorpagina (19 nov 2026). Dit is nu
// een échte, pratende gids: je typt een vraag ("ik zoek werk in de horeca",
// "wat kost personeel inhuren?") en krijgt een kort antwoord in de hero, met de
// juiste doorklik-knop eronder.
//
// Het antwoord komt van de bestaande, openbare marketing-chat (/api/chat): die
// praat met de ZekerFlex-AI-adapter (lib/ai), kent de kennisbank en valt zelf
// netjes terug op vaste, kloppende antwoorden als het model er niet is. Hij
// streamt platte tekst, met als laatste regel soms "[[vervolgvraag|…]]"; die
// knippen we eraf en tonen we als tik-bare vervolgvragen.
//
// Fail-soft: antwoordt de AI even niet, dan tonen we toch meteen de juiste knop
// via de trefwoord-routering (kiesWegwijzer). Puur client, zonder prisma/kv/zod.
// ---------------------------------------------------------------------------

interface Beurt {
  rol: "jij" | "gids";
  /** de ruwe tekst, inclusief een eventuele "[[…]]"-staart (die knippen we bij het tonen eraf) */
  tekst: string;
  /** de doorklik-knop die bij deze vraag hoort (vooraf bepaald, altijd goed) */
  wegwijzer?: Wegwijzer;
  /** een foutbubbel (krijgt role="alert" en een knop "Opnieuw") */
  fout?: boolean;
  /** de vraag die opnieuw geprobeerd kan worden */
  opnieuw?: string;
}

/** De "[[a|b|c]]"-staart van het antwoord eraf knippen (geen lookbehind: Safari-veilig). */
function splitStaart(ruw: string): { tekst: string; suggesties: string[] } {
  const i = ruw.indexOf("\n[[");
  if (i === -1) return { tekst: ruw, suggesties: [] };
  const staart = ruw.slice(i + 3);
  const af = staart.endsWith("]]");
  return {
    tekst: ruw.slice(0, i),
    suggesties: af ? staart.slice(0, -2).split("|").map((s) => s.trim()).filter(Boolean) : [],
  };
}

export function HomeZoekBalk() {
  const veldId = useId();
  const [tekst, setTekst] = useState("");
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [bezig, setBezig] = useState(false);
  const [geFocust, setGeFocust] = useState(false);
  const [spook, setSpook] = useState("");
  const [rustig, setRustig] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const draadRef = useRef<HTMLDivElement>(null);

  // "Minder beweging": dan geen zichzelf-typende voorbeeldvraag en geen knipperende cursor.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lees = () => setRustig(mq.matches);
    lees();
    mq.addEventListener("change", lees);
    return () => mq.removeEventListener("change", lees);
  }, []);

  // Het levende moment: zolang de balk leeg en ongefocust is, 'typt' hij zelf
  // voorbeeldvragen die hij ook echt zou beantwoorden, en wist ze weer.
  useEffect(() => {
    if (rustig || bezig || beurten.length > 0 || tekst !== "" || geFocust) {
      setSpook("");
      return;
    }
    let voorbeeld = 0;
    let positie = 0;
    let wissen = false;
    let timer: ReturnType<typeof setTimeout>;
    const tik = () => {
      const doel = ZOEK_VOORBEELDEN[voorbeeld] ?? "";
      if (!wissen) {
        positie += 1;
        setSpook(doel.slice(0, positie));
        if (positie >= doel.length) {
          wissen = true;
          timer = setTimeout(tik, 1800); // even laten staan
        } else {
          timer = setTimeout(tik, 55 + Math.random() * 45);
        }
      } else {
        positie -= 1;
        setSpook(doel.slice(0, Math.max(positie, 0)));
        if (positie <= 0) {
          wissen = false;
          voorbeeld = (voorbeeld + 1) % ZOEK_VOORBEELDEN.length;
          timer = setTimeout(tik, 420);
        } else {
          timer = setTimeout(tik, 28);
        }
      }
    };
    timer = setTimeout(tik, 900);
    return () => clearTimeout(timer);
  }, [rustig, bezig, beurten.length, tekst, geFocust]);

  // Het gesprek naar onderen scrollen als er iets bij komt (binnen het paneel, niet de pagina).
  useEffect(() => {
    const el = draadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [beurten]);

  async function vraag(ruweVraag: string, opnieuw = false) {
    const schoon = ruweVraag.trim();
    if (!schoon || bezig) return;

    const wegwijzer = kiesWegwijzer(schoon);
    // Opnieuw: de vraag staat al in het gesprek; haal alleen de foutbubbel weg.
    const basis = opnieuw ? beurten.filter((b) => !b.fout) : [...beurten, { rol: "jij" as const, tekst: schoon }];
    const metGids: Beurt[] = [...basis, { rol: "gids", tekst: "", wegwijzer }];
    setBeurten(metGids);
    setTekst("");
    setBezig(true);

    // De voorgaande beurten als gespreksgeschiedenis (zonder de lege gids-bubbel en zonder fouten).
    const geschiedenis = basis
      .filter((b) => !b.fout && b.tekst.trim())
      .slice(-8)
      .map((b) => ({ role: b.rol === "jij" ? ("user" as const) : ("assistant" as const), content: splitStaart(b.tekst).tekst || b.tekst }))
      .filter((m) => m.content.trim().length > 0);

    const toonFout = () => {
      setBeurten((huidig) => {
        const kopie = [...huidig];
        kopie[kopie.length - 1] = {
          rol: "gids",
          tekst: "De gids is even niet bereikbaar. Je kunt het zo opnieuw proberen — of gebruik meteen de knop hieronder.",
          fout: true,
          opnieuw: schoon,
          wegwijzer,
        };
        return kopie;
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: "/", messages: geschiedenis }),
      });
      if (!res.ok || !res.body) {
        toonFout();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let ruw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        ruw += decoder.decode(value, { stream: true });
        const nu = ruw;
        setBeurten((huidig) => {
          const kopie = [...huidig];
          kopie[kopie.length - 1] = { rol: "gids", tekst: nu, wegwijzer };
          return kopie;
        });
      }
      if (!ruw.trim()) toonFout();
    } catch {
      toonFout();
    } finally {
      setBezig(false);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }

  function verzend(e: React.FormEvent) {
    e.preventDefault();
    void vraag(tekst);
  }

  const toonSpook = spook !== "" && tekst === "" && !geFocust && beurten.length === 0;

  return (
    <div className="mx-auto mt-7 w-full max-w-2xl text-left">
      {/* Het gesprek met de gids */}
      {beurten.length > 0 && (
        <div
          ref={draadRef}
          role="log"
          aria-label="Gesprek met de ZekerFlex-gids"
          aria-busy={bezig}
          className="mb-3 max-h-[44vh] space-y-3 overflow-y-auto rounded-2xl border border-white/12 bg-white/[0.05] p-3 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] backdrop-blur sm:p-4"
        >
          {beurten.map((b, i) => (
            <Bubbel
              key={i}
              beurt={b}
              laatste={i === beurten.length - 1}
              bezig={bezig}
              rustig={rustig}
              onSuggestie={(s) => void vraag(s)}
              onOpnieuw={(q) => void vraag(q, true)}
            />
          ))}
        </div>
      )}

      {/* De balk zelf */}
      <form onSubmit={verzend} className="group" role="search">
        <label htmlFor={veldId} className="eyebrow mb-2 block text-left text-brand-mint">
          {beurten.length > 0 ? "Stel gerust nog een vraag" : "Wat kan ZekerFlex voor je doen?"}
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur transition focus-within:border-brand-mint/60 focus-within:bg-white/[0.1] focus-within:shadow-[0_34px_90px_-28px_rgba(16,235,160,0.35)]">
          <span aria-hidden className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-brand-mint/15 text-brand-mint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l1.7 3.8L17.5 8.5l-3.8 1.7L12 14l-1.7-3.8L6.5 8.5l3.8-1.7L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M18 14l.8 1.8 1.8.8-1.8.8L18 19l-.8-1.6-1.8-.8 1.8-.8L18 14Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="relative min-w-0 flex-1">
            <input
              id={veldId}
              ref={inputRef}
              name="zoek"
              type="text"
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              onFocus={() => setGeFocust(true)}
              onBlur={() => setGeFocust(false)}
              placeholder={toonSpook ? "" : ZOEK_PLACEHOLDER}
              autoComplete="off"
              aria-label="Stel je vraag aan de ZekerFlex-gids"
              className="w-full bg-transparent px-1 py-2 text-base text-white placeholder:text-white/45 focus:outline-none"
            />
            {toonSpook && (
              <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center px-1 text-base text-white/45">
                <span className="truncate">{spook}</span>
                {!rustig && <span className="ml-0.5 inline-block h-[1.15em] w-px animate-pulse bg-brand-mint/70" />}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={bezig || !tekst.trim()}
            className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-brand-mint px-4 py-2.5 text-sm font-bold text-ink shadow-glow transition hover:brightness-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="hidden sm:inline">{bezig ? "Bezig…" : "Vraag het"}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      {/* De snelkeuzeknoppen: altijd bereikbaar, wat ingetogener zodra er een gesprek loopt */}
      <ul className={`flex flex-wrap justify-center gap-2 ${beurten.length > 0 ? "mt-3 opacity-80" : "mt-4"}`}>
        {ZOEK_CHIPS.map((c) => (
          <li key={c.href + c.label}>
            <Link
              href={c.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-sm font-semibold text-white/80 transition hover:border-brand-mint hover:text-brand-mint"
            >
              {c.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eén beurt in het gesprek: jouw vraag (rechts), of het antwoord van de gids (met knop). */
function Bubbel({
  beurt,
  laatste,
  bezig,
  rustig,
  onSuggestie,
  onOpnieuw,
}: {
  beurt: Beurt;
  laatste: boolean;
  bezig: boolean;
  rustig: boolean;
  onSuggestie: (vraag: string) => void;
  onOpnieuw: (vraag: string) => void;
}) {
  if (beurt.rol === "jij") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-mint/90 px-3.5 py-2 text-sm font-medium text-ink">{beurt.tekst}</p>
      </div>
    );
  }

  const { tekst, suggesties } = splitStaart(beurt.tekst);
  const streamt = laatste && bezig;
  const wachtNogOpEersteWoord = streamt && tekst.trim() === "";

  return (
    <div className="flex gap-2.5">
      <span aria-hidden className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-mint/15 text-brand-mint">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3l1.7 3.8L17.5 8.5l-3.8 1.7L12 14l-1.7-3.8L6.5 8.5l3.8-1.7L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        {wachtNogOpEersteWoord ? (
          <span className="inline-flex items-center gap-1 py-1" aria-label="De gids denkt na">
            <Stip /> <Stip vertraging="0.15s" /> <Stip vertraging="0.3s" />
          </span>
        ) : (
          <p className={`whitespace-pre-line text-[15px] leading-relaxed ${beurt.fout ? "text-amber-200" : "text-white/90"}`} {...(beurt.fout ? { role: "alert" } : {})}>
            {tekst}
            {streamt && !rustig && <span className="ml-0.5 inline-block h-[1.05em] w-px translate-y-[0.15em] animate-pulse bg-brand-mint/80 align-middle" />}
          </p>
        )}

        {/* De doorklik-knop + vervolgvragen verschijnen als het antwoord klaar is */}
        {!streamt && (beurt.wegwijzer || suggesties.length > 0 || beurt.opnieuw) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {beurt.wegwijzer && (
              <Link
                href={beurt.wegwijzer.href}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-mint px-3.5 py-2 text-sm font-bold text-ink shadow-glow transition hover:brightness-105 active:scale-[0.97]"
              >
                {beurt.wegwijzer.knop}
                <span aria-hidden>→</span>
              </Link>
            )}
            {beurt.opnieuw && (
              <button
                type="button"
                onClick={() => onOpnieuw(beurt.opnieuw ?? "")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-2 text-sm font-semibold text-white/85 transition hover:border-brand-mint hover:text-brand-mint"
              >
                ↻ Opnieuw
              </button>
            )}
            {suggesties.slice(0, 3).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestie(s)}
                className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-brand-mint hover:text-brand-mint"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stip({ vertraging = "0s" }: { vertraging?: string }) {
  return <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-pulse" style={{ animationDelay: vertraging }} />;
}
