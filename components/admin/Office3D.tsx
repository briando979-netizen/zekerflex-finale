"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Empty, InfoList, Panel, Pill } from "@/components/admin/kit";
import type { CityData } from "@/lib/admin/city-data";
import { dayPhase, moonName, moonPhase, type Origin, sunAt, sunTimes, trafficFor, type VehicleKind } from "@/lib/admin/city-layout";
import { hourlyCounts, WEATHER_NL } from "@/lib/admin/city-life";
import { Chart } from "@/components/admin/kit-client";
import { isThemeId } from "@/lib/seasons/calendar";
import { count, euro } from "@/lib/admin/format";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";
import { ROOMS, roomOf, type CityEvent } from "@/components/admin/city/rooms";
import type { CityHandle, View } from "@/components/admin/city/scene";
import type { Pick } from "@/components/admin/city/world";

// ---------------------------------------------------------------------------
// Live kantoor in 3D, uitgebouwd tot een stad. In het midden staat het
// hoofdkantoor met dezelfde negen afdelingen en échte gebeurtenissen als de 2D-
// plattegrond (OfficeSim, /api/admin/office). Daaromheen draait alles op echte
// cijfers (/api/admin/office/city): klantpanden op het bedrijventerrein, een
// huisje per werker in de woonwijk, de bank, het datacenter, het magazijn en
// het opleidingscentrum. Elke gebeurtenis rijdt als voertuig van zijn herkomst
// naar het hoofdkantoor; daar brengt een robot hem naar zijn afdeling. Wie nu
// een dienst heeft, fietst naar de opdrachtgever. Dag en nacht volgen de echte
// zon boven Amsterdam. three.js laadt pas als deze weergave opent.
// ---------------------------------------------------------------------------

const VIEWS: [View, string][] = [
  ["stad", "Hele stad"],
  ["hq", "Hoofdkantoor"],
  ["bedrijven", "Bedrijventerrein"],
  ["bank", "Bank"],
  ["datacenter", "Datacenter"],
  ["magazijn", "Magazijn"],
  ["opleiding", "Opleiding"],
  ["woonwijk", "Woonwijk"],
  ["park", "Park"],
  ["polder", "Polder"],
];

const LEGEND: [string, string][] = [
  ["#16a34a", "Bus: planning & uren"],
  ["#d97706", "Bestelbus: webshop"],
  ["#eab308", "Geldwagen: bank & facturen"],
  ["#0284c7", "Postauto: mail & klantenservice"],
  ["#8b5cf6", "Auto: sales, juridisch & overig"],
  ["#4f6bed", "Stroomauto: AI"],
  ["#f97316", "Fietser: iemand op weg naar een dienst"],
  ["#94a3b8", "Grijze auto: gewoon verkeer, drukker als er meer mensen werken"],
  // dezelfde kleur als VISITOR_JACKET in components/admin/city/life.ts
  ["#0ea5e9", "Voetganger in felblauwe jas: een echte bezoeker die nu op zekerflex.com is (anoniem)"],
  ["#a8a29e", "Andere voetgangers, honden, eenden, vogels, koeien en schapen: sfeer, drukker overdag"],
];

const timeNl = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const pickFor = (v: View): Pick | null => (v === "stad" ? null : v === "polder" ? { kind: "polder" } : v === "bedrijven" ? { kind: "bedrijventerrein" } : v === "woonwijk" ? { kind: "woonwijk" } : { kind: "landmark", id: v });
const toneOf = (severity: string) => (severity === "critical" ? "crit" : severity === "warning" ? "warn" : "neutral");

const ORIGIN_NL: Record<string, string> = {
  bank: "ZekerFlex Bank",
  datacenter: "Datacenter",
  magazijn: "Webshop-magazijn",
  opleiding: "Opleidingscentrum",
  woonwijk: "Woonwijk",
  oost: "Afrit oost (van buiten de stad)",
  west: "Afrit west (van buiten de stad)",
};
const KIND_NL: Record<VehicleKind, string> = { bus: "Bus", bestelbus: "Bestelbus", geldwagen: "Geldwagen", postauto: "Postauto", auto: "Auto", stroomauto: "Stroomauto" };
/** Wie het deed, in gewone woorden ("system:invoice-reminders" → "systeem (invoice-reminders)"). */
const actorNl = (by: string) => {
  const i = by.indexOf(":");
  const kind = i < 0 ? by : by.slice(0, i);
  const rest = i < 0 ? "" : by.slice(i + 1);
  const word = kind === "system" ? "systeem" : kind === "user" ? "gebruiker" : kind === "integration" ? "koppeling" : null;
  if (!word) return by;
  return rest ? `${word} (${rest})` : word;
};

function EventList({ list, showRoom, onPick }: { list: CityEvent[]; showRoom: boolean; onPick: (id: string) => void }) {
  if (list.length === 0) return <Empty title="Hier gebeurde nog niets" body="De laatste 24 uur." />;
  return (
    <ul className="max-h-[44vh] space-y-1 overflow-y-auto pr-1">
      {list.slice(0, 30).map((e) => (
        <li key={e.id} className="text-[0.8125rem]">
          <button type="button" onClick={() => onPick(e.id)} className="w-full rounded-lg px-1.5 py-1 text-left transition hover:bg-[var(--a-elev)]">
            <span className="flex items-center gap-2">
              <Pill tone={toneOf(e.severity)}>{timeNl(e.at)}</Pill>
              {showRoom && (
                <span className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                  {roomOf(e.room).name}
                </span>
              )}
            </span>
            <span className="mt-0.5 block" style={{ color: "var(--a-text)" }}>
              {e.summary}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const More = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="mt-3 inline-block text-xs font-semibold underline-offset-2 hover:underline" style={{ color: "var(--a-accent, #4f6bed)" }}>
    {children} →
  </Link>
);

const Note = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
    {children}
  </p>
);

export function Office3D() {
  const host = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const city = useRef<CityHandle | null>(null);
  const pending = useRef<CityEvent[]>([]);
  const lastData = useRef<CityData | null>(null);
  const seen = useRef(new Set<string>());
  const [state, setState] = useState<"laden" | "klaar" | "geen-webgl">("laden");
  const [events, setEvents] = useState<CityEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [data, setData] = useState<CityData | null>(null);
  const [selected, setSelected] = useState<Pick | null>(null);
  const [touring, setTouring] = useState(false);
  const [legend, setLegend] = useState(false);
  const [clock, setClock] = useState("");
  const [latest, setLatest] = useState<CityEvent | null>(null);
  const [replay, setReplay] = useState<{ at: string; left: number; total: number } | null>(null);
  const [hourly, setHourly] = useState<{ labels: string[]; values: number[] } | null>(null);

  // Drukte per uur over de laatste 24 uur: eens per minuut (tot 200 gebeurtenissen).
  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/admin/office?limit=200", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: { events: CityEvent[] } = await r.json();
      setHourly(hourlyCounts(d.events.map((e) => Date.parse(e.at)), Date.now()));
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Een nieuwe gebeurtenis staat even in beeld (klik om het voertuig te volgen).
  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(() => setLatest(null), 9000);
    return () => clearTimeout(t);
  }, [latest]);

  // Klokje in beeld: de tijd en het dagdeel in Amsterdam, zoals de stad ze toont.
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const phase = dayPhase(sunAt(now).elevation);
      setClock(`${amsterdamClock(now)} · ${phase === "dag" ? "dag" : phase === "schemer" ? "schemering" : "nacht"} in Amsterdam`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  // Echte gebeurtenissen: elke 10 seconden ophalen; nieuwe gaan als voertuig de wachtrij in.
  useEffect(() => {
    let first = true;
    const load = async () => {
      const r = await fetch("/api/admin/office", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: { events: CityEvent[]; counts: Record<string, number> } = await r.json();
      setEvents(d.events);
      setCounts(d.counts);
      const fresh = d.events.filter((e) => !seen.current.has(e.id));
      fresh.forEach((e) => seen.current.add(e.id));
      const batch = (first ? fresh.slice(0, 6) : fresh).reverse();
      if (!first && fresh[0]) setLatest(fresh[0]);
      first = false;
      if (city.current) city.current.pushEvents(batch);
      else pending.current.push(...batch);
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // Cijfers van de stad: elke 30 seconden.
  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/admin/office/city", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: CityData = await r.json();
      lastData.current = d;
      setData(d);
      city.current?.setData(d);
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = host.current;
    const labelHost = labelsRef.current;
    if (!el || !labelHost) return;
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) {
        setState("geen-webgl");
        return;
      }
    } catch {
      setState("geen-webgl");
      return;
    }
    let disposed = false;
    let handle: CityHandle | null = null;
    (async () => {
      const { createCity } = await import("@/components/admin/city/scene");
      if (disposed) return;
      // voorbeeld van een feestdag of seizoen: /admin/kantoor?thema=kerst of ?seizoen=winter
      const q = new URLSearchParams(window.location.search);
      const thema = q.get("thema");
      const seizoen = q.get("seizoen");
      const weer = q.get("weer");
      handle = createCity(el, labelHost, {
        reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onPick: setSelected,
        onTourEnd: () => setTouring(false),
        ...(thema && isThemeId(thema) && thema !== "verjaardag" ? { theme: thema } : {}),
        ...(seizoen === "lente" || seizoen === "zomer" || seizoen === "herfst" || seizoen === "winter" ? { season: seizoen } : {}),
        ...(weer && weer in WEATHER_NL ? { weather: weer as keyof typeof WEATHER_NL } : {}),
      });
      city.current = handle;
      if (lastData.current) handle.setData(lastData.current);
      handle.pushEvents(pending.current.splice(0));
      setState("klaar");
    })().catch(() => !disposed && setState("geen-webgl"));
    return () => {
      disposed = true;
      handle?.dispose();
      city.current = null;
    };
  }, []);

  if (state === "geen-webgl") {
    return (
      <Panel title="Kantoor in 3D">
        <Empty title="Deze browser kan geen 3D tonen" body="Gebruik de plattegrond (2D) hierboven." />
      </Panel>
    );
  }

  const choose = (p: Pick | null) => {
    setSelected(p);
    city.current?.select(p);
  };
  const go = (v: View) => {
    setTouring(false);
    city.current?.tour(false);
    city.current?.fly(v);
    choose(pickFor(v));
  };
  const toggleTour = () => {
    const on = !touring;
    setTouring(on);
    city.current?.tour(on);
    if (on) choose(null);
  };
  const goCompany = (id: string) => {
    city.current?.fly({ company: id });
    choose({ kind: "company", id });
  };
  const pickEvent = (id: string) => choose({ kind: "event", id });
  // De laatste 24 uur versneld afspelen: alle echte gebeurtenissen rijden nog een keer, oudste eerst.
  const toggleReplay = async () => {
    if (replay) {
      city.current?.stopReplay();
      setReplay(null);
      return;
    }
    const r = await fetch("/api/admin/office?limit=200", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d: { events: CityEvent[] } = await r.json();
    const list = [...d.events].reverse();
    const first = list[0];
    if (!first) return;
    setReplay({ at: first.at, left: list.length, total: list.length });
    city.current?.fly("stad");
    city.current?.replay(list, (ev, left) => setReplay(ev ? { at: ev.at, left, total: list.length } : null));
  };
  const originNl = (from: Origin) => (from.startsWith("bedrijf:") ? (data?.companies.find((c) => `bedrijf:${c.id}` === from)?.name ?? "Klantpand") : (ORIGIN_NL[from] ?? from));

  const byRooms = (...rooms: string[]) => events.filter((e) => rooms.includes(e.room));
  let title = "Laatste gebeurtenissen";
  let subtitle = "Echte gebeurtenissen; elk voertuig brengt er één naar het hoofdkantoor";
  let body: ReactNode = (
    <>
      {hourly && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium" style={{ color: "var(--a-dim)" }}>
            Gebeurtenissen per uur, laatste 24 uur
          </p>
          <Chart title="Gebeurtenissen per uur over de laatste 24 uur" labels={hourly.labels} series={[{ label: "Gebeurtenissen", values: hourly.values, slot: 1 }]} kind="bars" height={110} />
        </div>
      )}
      <EventList list={events} showRoom onPick={pickEvent} />
    </>
  );

  if (selected?.kind === "room") {
    const room = roomOf(selected.id);
    title = room.name;
    subtitle = `${counts[room.id] ?? 0} in de laatste 24 uur`;
    body = <EventList list={events.filter((e) => roomOf(e.room).id === room.id)} showRoom={false} onPick={pickEvent} />;
  } else if (selected?.kind === "landmark") {
    const id = selected.id;
    if (id === "hq") {
      title = "Hoofdkantoor";
      subtitle = `${ROOMS.length} afdelingen; klik een afdeling voor zijn gebeurtenissen`;
      body = (
        <>
          <InfoList
            rows={[
              { label: "Gebeurtenissen laatste uur", value: data ? count(data.eventsLastHour) : "—" },
              {
                label: "Nu op zekerflex.com",
                value: data?.visitors ? `${count(data.visitors.total)} (${count(data.visitors.anoniem)} bezoekers, ${count(data.visitors.freelancer)} werkers, ${count(data.visitors.bedrijf)} bedrijven)` : "—",
              },
              { label: "Sales-leads", value: data ? `${count(data.leads.total)} (${count(data.leads.newToday)} nieuw vandaag)` : "—" },
            ]}
          />
          <Note>Elk voertuig dat hier stopt, geeft zijn gebeurtenis aan een robot. Die loopt ermee naar de afdeling die hem afhandelde. Nieuwe leads komen als auto binnen via de afrit in het westen.</Note>
          <EventList list={events} showRoom onPick={pickEvent} />
        </>
      );
    } else if (id === "bank") {
      title = "ZekerFlex Bank";
      subtitle = "Facturen en betalingen";
      body = (
        <>
          <InfoList
            rows={[
              { label: "Openstaand", value: data ? `${count(data.money.openInvoices)} facturen · ${euro(data.money.openCents)}` : "—" },
              { label: "Vandaag betaald", value: data ? `${count(data.money.paidToday)} · ${euro(data.money.paidTodayCents)}` : "—" },
            ]}
          />
          <Note>De gouden munt op het dak gloeit feller naarmate er vandaag meer betaald is. Geldwagens rijden voor elke factuur- of bankgebeurtenis.</Note>
          <EventList list={byRooms("bank", "finance")} showRoom={false} onPick={pickEvent} />
          <More href="/admin/facturen">Naar facturen</More>
        </>
      );
    } else if (id === "datacenter") {
      title = "Datacenter · AI";
      subtitle = "Het eigen taalmodel en de AI-taken";
      body = (
        <>
          <InfoList rows={[{ label: "AI-verzoeken vandaag", value: data ? count(data.ai.callsToday) : "—" }]} />
          <Note>De serverlampjes knipperen en de koelers draaien sneller bij meer AI-verzoeken.</Note>
          <EventList list={byRooms("ai")} showRoom={false} onPick={pickEvent} />
        </>
      );
    } else if (id === "magazijn") {
      title = "Webshop & magazijn";
      subtitle = "Bestellingen uit de webshop";
      body = (
        <>
          <InfoList
            rows={[
              { label: "Vandaag besteld", value: data ? count(data.shop.ordersToday) : "—" },
              { label: "Klaar om te versturen", value: data ? count(data.shop.toShip) : "—" },
            ]}
          />
          <Note>Bij het laadperron staat een busje per bestelling die nog weg moet (tot drie), en een doos per bestelling van vandaag.</Note>
          <EventList list={byRooms("shop")} showRoom={false} onPick={pickEvent} />
          <More href="/admin/shop">Naar de webshop</More>
        </>
      );
    } else if (id === "opleiding") {
      title = "Opleidingscentrum";
      subtitle = "Certificaten van werkers (VCA, BHV, heftruck …)";
      body = (
        <>
          <InfoList
            rows={[
              { label: "Certificaten", value: data ? count(data.certificates.total) : "—" },
              { label: "Wachten op controle", value: data ? count(data.certificates.pending) : "—" },
            ]}
          />
          <EventList list={events.filter((e) => e.action.startsWith("certificate"))} showRoom={false} onPick={pickEvent} />
        </>
      );
    } else {
      title = "Park & molen";
      subtitle = "De molen draait op wat er gebeurt";
      body = (
        <>
          <InfoList rows={[{ label: "Gebeurtenissen laatste uur", value: data ? count(data.eventsLastHour) : "—" }]} />
          <Note>Hoe meer er op het platform gebeurt, hoe sneller de wieken draaien. Stil staat hij nooit.</Note>
        </>
      );
    }
  } else if (selected?.kind === "woonwijk") {
    title = "Woonwijk";
    subtitle = "Eén huisje per werker";
    body = (
      <>
        <InfoList
          rows={[
            { label: "Werkers", value: data ? count(data.workers.total) : "—" },
            { label: "Nu aan het werk", value: data ? count(data.workers.workingNow) : "—" },
          ]}
        />
        <Note>De wijk groeit met elke nieuwe werker (tot 68 huizen). Wie nu een dienst heeft, fietst naar zijn opdrachtgever en zet de fiets daar in het rek. Werkers komen nooit los of met naam in beeld.</Note>
        <More href="/admin/gebruikers">Naar gebruikers</More>
      </>
    );
  } else if (selected?.kind === "bedrijventerrein" || selected?.kind === "kavel") {
    title = selected.kind === "kavel" ? "Bouwkavel" : "Bedrijventerrein";
    subtitle = data ? `${count(data.companiesTotal)} klanten, ${count(data.companies.length)} met een pand` : "Laden…";
    body = (
      <>
        <Note>
          Elke klant krijgt een pand dat hoger wordt met vestigingen en diensten; de drukste staat het dichtst bij het hoofdkantoor. Een groen lampje op het dak betekent open diensten.
          {data && data.companiesTotal > data.companies.length ? " Alleen de twaalf drukste klanten hebben een pand." : " Op de bouwkavel komt de volgende klant."}
        </Note>
        {data && data.companies.length > 0 ? (
          <ul className="space-y-1.5">
            {data.companies.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => goCompany(c.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition hover:bg-[var(--a-elev)]">
                  <span className="font-semibold" style={{ color: "var(--a-text)" }}>
                    {c.name}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                    {count(c.openShifts)} open · {count(c.shiftsWeek)} deze week · {count(c.workingNow)} aan het werk
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Nog geen klanten" body="Het eerste pand verschijnt zodra er een klant is." />
        )}
      </>
    );
  } else if (selected?.kind === "polder") {
    const w = data?.weather;
    const now = new Date();
    // de Nederlandse kalenderdag: tussen 00:00 en 01:00 (of 02:00 in de zomer) is het in UTC nog gisteren
    const nl = amsterdamParts(now);
    const sun = sunTimes(new Date(Date.UTC(nl.year, nl.month - 1, nl.day, 12)));
    const moon = moonPhase(now);
    title = "Polder, weer en natuur";
    subtitle = "Het weer, de zon en de maan boven Amsterdam, nu";
    body = (
      <>
        <InfoList
          rows={[
            { label: "Weer", value: w ? `${WEATHER_NL[w.kind]}, ${w.tempC} °C` : "nog niet bekend" },
            { label: "Wind", value: w ? `${w.windKmh} km/u` : "—" },
            { label: "Bewolking", value: w ? `${w.cloud}%` : "—" },
            { label: "Neerslag komend uur", value: w ? `${w.mmPerHour.toLocaleString("nl-NL")} mm` : "—" },
            { label: "Zon", value: sun.rise && sun.set ? `op ${amsterdamClock(sun.rise)}, onder ${amsterdamClock(sun.set)}` : "—" },
            { label: "Maan", value: `${moonName(moon.phase)}, ${Math.round(moon.lit * 100)}% verlicht` },
          ]}
        />
        <Note>Het weer, de zon en de maan zijn echt (weer: MET Norway, CC BY 4.0) en sturen de lucht, het licht, de wolken en de neerslag in de stad. De koeien, schapen en de boerderij zijn sfeer.</Note>
      </>
    );
  } else if (selected?.kind === "event") {
    const e = events.find((x) => x.id === selected.id);
    title = "Gebeurtenis";
    subtitle = e ? `${timeNl(e.at)} · ${roomOf(e.room).name}` : "Niet meer in de lijst";
    if (e) {
      const t = trafficFor(e, new Set(data?.companies.map((c) => c.id) ?? []));
      body = (
        <>
          <p className="mb-3 text-[0.875rem]" style={{ color: "var(--a-text)" }}>
            {e.summary}
          </p>
          <InfoList
            rows={[
              { label: "Afdeling", value: roomOf(e.room).name },
              { label: "Ernst", value: <Pill tone={toneOf(e.severity)}>{e.severity === "critical" ? "kritiek" : e.severity === "warning" ? "waarschuwing" : "gewoon"}</Pill> },
              { label: "Door", value: actorNl(e.by) },
              { label: "Vertrekt uit", value: originNl(t.from) },
              { label: "Voertuig", value: KIND_NL[t.kind] },
            ]}
          />
          <Note>Rijdt het voertuig nog, dan rijdt de blauwe ring mee en volgt de camera het, tot je zelf draait of schuift.</Note>
        </>
      );
    } else body = <Empty title="Deze gebeurtenis staat niet meer in de lijst" body="De lijst toont de laatste 40 gebeurtenissen van de laatste 24 uur." />;
  } else if (selected?.kind === "company") {
    const c = data?.companies.find((x) => x.id === selected.id);
    title = c?.name ?? "Klant";
    subtitle = "Klantpand op het bedrijventerrein";
    body = c ? (
      <>
        <InfoList
          rows={[
            { label: "Vestigingen", value: count(c.branches) },
            { label: "Open diensten", value: count(c.openShifts) },
            { label: "Diensten komende 7 dagen", value: count(c.shiftsWeek) },
            { label: "Nu aan het werk", value: `${count(c.workingNow)} (fietsen in het rek)` },
          ]}
        />
        <EventList list={events.filter((e) => e.tenantId === c.id)} showRoom onPick={pickEvent} />
        <More href={`/admin/bedrijven/${c.id}`}>Naar dit bedrijf</More>
      </>
    ) : (
      <Empty title="Laden…" />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Ga naar een plek in de stad">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => go(id)} className="rounded-full border px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--a-elev)]" style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleTour}
          aria-pressed={touring}
          className="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
          style={touring ? { borderColor: "#4f6bed", background: "#4f6bed", color: "#fff" } : { borderColor: "#4f6bed", color: "#4f6bed" }}
        >
          {touring ? "Stop rondleiding" : "▶ Rondleiding"}
        </button>
        <button
          type="button"
          onClick={() => void toggleReplay()}
          aria-pressed={Boolean(replay)}
          className="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
          style={replay ? { borderColor: "#0d9488", background: "#0d9488", color: "#fff" } : { borderColor: "#0d9488", color: "#0d9488" }}
        >
          {replay ? "Stop afspelen" : "⏪ Laatste 24 uur afspelen"}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div
          ref={host}
          className="relative h-[70vh] min-h-[440px] overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--a-border)" }}
          role="group"
          aria-label={`Live ZekerFlex-stad in 3D: het hoofdkantoor met ${ROOMS.length} afdelingen, ${data?.companies.length ?? 0} klantpanden, ${data?.workers.total ?? 0} werkers in de woonwijk en ${events.length} echte gebeurtenissen van de laatste 24 uur`}
        >
          <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
          {state === "laden" && (
            <div className="absolute inset-0 grid place-items-center" role="status">
              <span className="rounded-full px-3 py-1.5 text-xs font-medium shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>
                Stad laden…
              </span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
            {legend && (
              <ul className="mb-2 space-y-1 rounded-xl px-3 py-2 text-[11px] shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>
                {LEGEND.map(([color, text]) => (
                  <li key={text} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
                    {text}
                  </li>
                ))}
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#dc2626" }} aria-hidden />
                  Zwaailicht: rood = kritiek, oranje = waarschuwing
                </li>
                <li className="pt-1" style={{ color: "var(--a-dim)" }}>
                  Zon, maan, wind, wolken, regen en sneeuw zijn echt: het weer in Amsterdam nu (bron: MET Norway, CC BY 4.0). Bomen en versiering volgen het seizoen en de Nederlandse feestdagen; rond het kantoor staan verkeerslichten.
                </li>
              </ul>
            )}
            <button type="button" onClick={() => setLegend((v) => !v)} aria-expanded={legend} className="rounded-full px-3 py-1 text-[11px] font-semibold shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>
              {legend ? "Verberg uitleg" : "Wat zie je?"}
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-full px-3 py-1 text-[11px] shadow sm:block" style={{ background: "var(--a-panel)", color: "var(--a-dim)" }}>
            Sleep om te draaien · scroll om te zoomen · klik een gebouw of voertuig
          </p>
          {clock && (
            <p className="pointer-events-none absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-medium shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>
              {clock}
              {data?.weather ? ` · ${data.weather.tempC} °C, ${WEATHER_NL[data.weather.kind]}` : ""}
            </p>
          )}
          <div aria-live="polite" className="absolute left-3 top-12 max-w-[calc(100%-1.5rem)] sm:top-3 sm:max-w-[55%]">
            {replay ? (
              <p className="rounded-full px-3 py-1 text-[11px] font-semibold shadow" style={{ background: "#0d9488", color: "#fff" }}>
                Afspelen · {timeNl(replay.at)} · {count(replay.total - replay.left)} van {count(replay.total)}
              </p>
            ) : latest && (
              <button type="button" onClick={() => pickEvent(latest.id)} className="block max-w-full truncate rounded-full px-3 py-1 text-left text-[11px] font-medium shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>
                <span aria-hidden style={{ color: latest.severity === "critical" ? "#dc2626" : latest.severity === "warning" ? "#f59e0b" : "#16a34a" }}>
                  ●
                </span>{" "}
                Nieuw · {timeNl(latest.at)} · {latest.summary}
              </button>
            )}
          </div>
        </div>
        <Panel title={title} subtitle={subtitle} {...(selected ? { actions: <button type="button" className="a-button text-xs" onClick={() => choose(null)}>Alles</button> } : {})}>
          {body}
        </Panel>
      </div>
    </div>
  );
}
