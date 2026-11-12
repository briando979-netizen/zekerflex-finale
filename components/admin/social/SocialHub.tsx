"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { BEELDEN } from "@/lib/social/beelden";
import { KANALEN, deelLink, plaatsAdres, tekstVoorKanaal, type KanaalId } from "@/lib/social/kanalen";
import { amsterdamLocalInput } from "@/lib/time/amsterdam";
import type { KanaalKaart, PostRegel, SocialOverzicht } from "@/lib/social/overzicht";
import type { Doelgroep, PostStatus, Reactie } from "@/lib/social/model";

// ---------------------------------------------------------------------------
// Admin → Sales & groei → Sociale media. Eén scherm met vijf tabbladen: Overzicht, Berichten,
// Kanalen, Campagne, Autopilot. Alles wat hier staat is echt: berichten uit onze eigen opslag,
// bezoeken met een sociaal netwerk als herkomst, en een koppeling die alleen "verbonden" heet als
// Meta het token echt accepteerde. Wat niet kan (nog), staat er eerlijk bij.
// ---------------------------------------------------------------------------

type Tab = "overzicht" | "berichten" | "reacties" | "kanalen" | "campagne" | "autopilot";
const TABS: { id: Tab; label: string }[] = [
  { id: "overzicht", label: "Overzicht" },
  { id: "berichten", label: "Berichten" },
  { id: "reacties", label: "Reacties" },
  { id: "kanalen", label: "Kanalen" },
  { id: "campagne", label: "Campagne" },
  { id: "autopilot", label: "Autopilot" },
];

const STATUS: Record<PostStatus, { naam: string; tone: Tone }> = {
  concept: { naam: "Concept", tone: "neutral" },
  gepland: { naam: "Gepland", tone: "plan" },
  gepost: { naam: "Geplaatst", tone: "ok" },
  deels: { naam: "Deels geplaatst", tone: "warn" },
  handmatig: { naam: "Jij plaatst", tone: "warn" },
  mislukt: { naam: "Mislukt", tone: "crit" },
};

const TOESTAND: Record<KanaalKaart["toestand"], { naam: string; tone: Tone }> = {
  verbonden: { naam: "Verbonden", tone: "ok" },
  profiel: { naam: "Profiel ingevuld", tone: "plan" },
  leeg: { naam: "Nog niet ingesteld", tone: "neutral" },
};

const PUBLIEK: Record<KanaalKaart["publiek"], string> = { werkers: "voor werkers", werkgevers: "voor werkgevers", beide: "werkers en werkgevers" };

const tijd = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "geen tijd gekozen";

async function api<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/admin/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return data;
}

function kopieer(tekst: string, klaar: (ok: boolean) => void) {
  const nav = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!nav) return klaar(false);
  nav.writeText(tekst).then(
    () => klaar(true),
    () => klaar(false),
  );
}

export function SocialHub() {
  const [o, setO] = useState<SocialOverzicht | null>(null);
  const [tab, setTab] = useState<Tab>("overzicht");
  const [fout, setFout] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<PostRegel | null>(null);

  const laad = useCallback(async () => {
    const res = await fetch("/api/admin/social", { cache: "no-store" });
    if (res.ok) setO((await res.json()) as SocialOverzicht);
    else setFout("Het overzicht kon niet worden geladen. Vernieuw de pagina.");
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  const naarBerichten = (p: PostRegel | null) => {
    setBewerk(p);
    setTab("berichten");
  };

  return (
    <div className="space-y-4">
      <PageHead
        title="Sociale media"
        subtitle="Alle kanalen van ZekerFlex op één plek: berichten schrijven en inplannen, kanalen koppelen, campagnes maken en een autopilot die elke week berichten klaarzet. Er gaat niets weg zonder jouw goedkeuring, tenzij je de autopilot dat zelf laat doen."
      />
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}

      <div role="tablist" aria-label="Onderdelen" className="flex flex-wrap gap-1 rounded-xl p-1" style={{ background: "var(--a-elev)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="rounded-lg px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors"
            style={tab === t.id ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
          >
            {t.label}
            {t.id === "berichten" && o && o.kpi.tePlaatsen + o.kpi.mislukt > 0 ? ` · ${o.kpi.tePlaatsen + o.kpi.mislukt}` : ""}
            {t.id === "reacties" && o && o.kpi.reactiesOpen > 0 ? ` · ${o.kpi.reactiesOpen}` : ""}
          </button>
        ))}
      </div>

      {!o ? (
        <Panel>
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Even laden…</p>
        </Panel>
      ) : (
        <>
          {tab === "overzicht" && <OverzichtTab o={o} naarBerichten={naarBerichten} naarTab={setTab} laad={laad} />}
          {tab === "berichten" && <BerichtenTab o={o} bewerk={bewerk} setBewerk={setBewerk} laad={laad} />}
          {tab === "reacties" && <ReactiesTab o={o} laad={laad} />}
          {tab === "kanalen" && <KanalenTab o={o} laad={laad} />}
          {tab === "campagne" && <CampagneTab o={o} laad={laad} naarBerichten={() => naarBerichten(null)} />}
          {tab === "autopilot" && <AutopilotTab o={o} laad={laad} />}
        </>
      )}
    </div>
  );
}

// --- Overzicht ---------------------------------------------------------------------------------

function OverzichtTab({ o, naarBerichten, naarTab, laad }: { o: SocialOverzicht; naarBerichten: (p: PostRegel | null) => void; naarTab: (t: Tab) => void; laad: () => Promise<void> }) {
  const nu = new Date(o.nu).getTime();
  const week = useMemo(
    () =>
      o.posts
        .filter((p) => p.plan && new Date(p.plan).getTime() >= nu - 3600_000 && new Date(p.plan).getTime() <= nu + 7 * 86400_000 && p.status !== "gepost")
        .sort((a, b) => ((a.plan ?? "") < (b.plan ?? "") ? -1 : 1)),
    [o.posts, nu],
  );
  const aandacht = o.posts.filter((p) => p.status === "handmatig" || p.status === "deels" || p.status === "mislukt");
  const teKeuren = o.posts.filter((p) => p.status === "concept" && p.bron !== "handmatig");
  const verbonden = o.kanalen.filter((k) => k.toestand !== "leeg").length;
  const bezoeken = o.kanalen.filter((k) => k.bezoeken30d > 0).sort((a, b) => b.bezoeken30d - a.bezoeken30d);
  const maxBezoek = bezoeken[0]?.bezoeken30d ?? 1;

  return (
    <div className="space-y-4">
      <KpiStrip
        items={[
          { label: "Kanalen ingesteld", value: `${verbonden} van ${o.kanalen.length}`, hint: o.meta.verbonden ? "Facebook/Instagram verbonden" : "Meta nog niet verbonden" },
          { label: "Gepland", value: String(o.kpi.gepland), hint: "goedgekeurd en ingepland" },
          { label: "Jij plaatst", value: String(o.kpi.tePlaatsen), hint: "tekst staat klaar", tone: o.kpi.tePlaatsen > 0 ? "warn" : "neutral" },
          { label: "Geplaatst, 30 dagen", value: String(o.kpi.geplaatst30d) },
          { label: "Bezoeken via sociaal", value: String(o.kpi.bezoeken30d), hint: "paginaweergaven, 30 dagen" },
        ]}
      />

      {(aandacht.length > 0 || teKeuren.length > 0 || o.kpi.reactiesOpen > 0) && (
        <Panel title="Aan de beurt" subtitle="Wat op jou wacht">
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {aandacht.map((p) => (
              <RegelKort key={p.id} p={p} onOpen={() => naarBerichten(p)} />
            ))}
            {o.kpi.reactiesOpen > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--a-text)" }}>
                    {o.kpi.reactiesOpen} reactie{o.kpi.reactiesOpen === 1 ? "" : "s"} wacht{o.kpi.reactiesOpen === 1 ? "" : "en"} op een antwoord
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>Op Facebook of Instagram: klachten en lastige vragen laat de autopilot voor jou liggen.</p>
                </div>
                <Pill tone="warn">Reactie</Pill>
                <button type="button" className="a-button" onClick={() => naarTab("reacties")}>Bekijk</button>
              </li>
            )}
            {teKeuren.length > 0 && (
              <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--a-text)" }}>
                    {teKeuren.length} bericht{teKeuren.length === 1 ? "" : "en"} wacht{teKeuren.length === 1 ? "" : "en"} op jouw goedkeuring
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>Door de AI klaargezet: lees ze na, pas aan en keur goed.</p>
                </div>
                <Pill tone="warn">Concept</Pill>
                <button type="button" className="a-button" onClick={() => naarBerichten(null)}>Bekijk</button>
              </li>
            )}
          </ul>
        </Panel>
      )}

      <Panel title="Kanalen" subtitle="Eén kaart per kanaal">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {o.kanalen.map((k) => (
            <KanaalKaartTegel key={k.id} k={k} onOpen={() => naarTab("kanalen")} />
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Komende 7 dagen" subtitle="Ingepland of nog te keuren" actions={<button type="button" className="a-button" onClick={() => naarBerichten(null)}>Nieuw bericht</button>}>
          {week.length === 0 ? (
            <Empty title="Niets ingepland" body="Schrijf een bericht, maak een campagne of zet de autopilot aan." />
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
              {week.map((p) => (
                <RegelKort key={p.id} p={p} onOpen={() => naarBerichten(p)} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Bezoeken via sociale media" subtitle="Paginaweergaven op onze site, laatste 30 dagen">
          {bezoeken.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--a-mute)" }}>
              Nog geen bezoeken van sociale media gemeten. Dat komt vanzelf zodra berichten een link naar de site hebben en mensen erop klikken.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {bezoeken.map((k) => (
                <li key={k.id}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--a-text)" }}>{k.naam}</span>
                    <span className="num" style={{ color: "var(--a-mute)" }}>{k.bezoeken30d}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--a-elev)" }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (k.bezoeken30d / maxBezoek) * 100)}%`, background: "var(--a-ok)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs" style={{ color: "var(--a-dim)" }}>
            Volgers, likes en bereik staan hier niet: die kennen alleen de platforms zelf. Wat hier staat is wat ZekerFlex zelf ziet.
          </p>
        </Panel>
      </div>

      <Panel title="Wat nog niet kan" subtitle="Eerlijk, zodat je weet waar je aan toe bent">
        <ul className="list-disc space-y-1.5 pl-5 text-sm" style={{ color: "var(--a-mute)" }}>
          <li>Automatisch plaatsen kan alleen op Facebook en Instagram (met de Meta-koppeling). LinkedIn, TikTok, YouTube, X en Google geven die toegang pas na een eigen goedkeuring of tegen betaling; daar zet ZekerFlex de tekst klaar en plaats jij met één klik.</li>
          <li>Praten met ze (reacties lezen en beantwoorden) werkt alleen op Facebook en Instagram, met dezelfde Meta-koppeling en extra rechten op het token. Privéberichten (DM&apos;s) volgen nog: die vragen een aparte machtiging van Meta.</li>
          <li>Het scherm maakt zelf geen foto&apos;s of video&apos;s: de autopilot kiest een eigen foto die bij het onderwerp past, en bij een eigen bericht kies je er een uit de lijst of plak je een adres. Video&apos;s maak je in de Video-editor.</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="a-button" href="/admin/studio">Studio</Link>
          <Link className="a-button" href="/admin/video">Video-editor</Link>
          <Link className="a-button" href="/admin/ads">Advertenties</Link>
          <button type="button" className="a-button" onClick={() => void laad()}>Vernieuwen</button>
        </div>
      </Panel>
    </div>
  );
}

function RegelKort({ p, onOpen, tekstOnder }: { p: PostRegel; onOpen: () => void; tekstOnder?: string }) {
  const s = STATUS[p.status];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: "var(--a-text)" }}>{p.tekst}</p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
          {tekstOnder ?? `${tijd(p.plan)} · ${p.kanalen.map((k) => KANALEN.find((x) => x.id === k)?.naam ?? k).join(", ")}`}
        </p>
      </div>
      <Pill tone={s.tone}>{s.naam}</Pill>
      <button type="button" className="a-button" onClick={onOpen}>Open</button>
    </li>
  );
}

function KanaalKaartTegel({ k, onOpen }: { k: KanaalKaart; onOpen: () => void }) {
  const t = TOESTAND[k.toestand];
  return (
    <div className="flex flex-col justify-between rounded-xl border p-3.5" style={{ borderColor: "var(--a-border)", background: "var(--a-panel)" }}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold" style={{ color: "var(--a-text)" }}>{k.naam}</p>
          <Pill tone={t.tone}>{t.naam}</Pill>
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>{PUBLIEK[k.publiek]} · {k.wijze === "api" ? (k.toestand === "verbonden" ? "plaatst zelf" : "plaatst zelf na koppelen") : "jij plaatst"}</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt style={{ color: "var(--a-dim)" }}>Gepland</dt><dd className="num text-sm font-semibold" style={{ color: "var(--a-text)" }}>{k.gepland}</dd></div>
        <div><dt style={{ color: "var(--a-dim)" }}>Geplaatst</dt><dd className="num text-sm font-semibold" style={{ color: "var(--a-text)" }}>{k.geplaatst}</dd></div>
        <div><dt style={{ color: "var(--a-dim)" }}>Bezoeken</dt><dd className="num text-sm font-semibold" style={{ color: "var(--a-text)" }}>{k.bezoeken30d}</dd></div>
      </dl>
      <div className="mt-3 flex gap-2">
        {k.config.profielUrl ? <a className="a-button" href={k.config.profielUrl} target="_blank" rel="noopener noreferrer">Open profiel</a> : null}
        <button type="button" className="a-button" onClick={onOpen}>{k.toestand === "leeg" ? "Instellen" : "Beheren"}</button>
      </div>
    </div>
  );
}

// --- Berichten ----------------------------------------------------------------------------------

interface Formulier {
  id: string | null;
  tekst: string;
  hashtags: string;
  kanalen: KanaalId[];
  beeldUrl: string;
  beeldIdee: string;
  link: string;
  plan: string;
  doelgroep: Doelgroep;
  goedgekeurd: boolean;
}

const LEEG: Formulier = { id: null, tekst: "", hashtags: "", kanalen: ["facebook", "instagram", "linkedin"], beeldUrl: "", beeldIdee: "", link: "", plan: "", doelgroep: "algemeen", goedgekeurd: false };

function vanPost(p: PostRegel): Formulier {
  return {
    id: p.id,
    tekst: p.tekst,
    hashtags: p.hashtags.join(" "),
    kanalen: p.kanalen,
    beeldUrl: p.beeldUrl ?? "",
    beeldIdee: p.beeldIdee,
    link: p.link,
    plan: p.plan ? amsterdamLocalInput(p.plan) : "",
    doelgroep: p.doelgroep,
    goedgekeurd: p.goedgekeurd,
  };
}

function BerichtenTab({ o, bewerk, setBewerk, laad }: { o: SocialOverzicht; bewerk: PostRegel | null; setBewerk: (p: PostRegel | null) => void; laad: () => Promise<void> }) {
  const [f, setF] = useState<Formulier>(bewerk ? vanPost(bewerk) : LEEG);
  const [busy, setBusy] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | PostStatus>("alle");
  const [invalshoek, setInvalshoek] = useState("");

  useEffect(() => {
    setF(bewerk ? vanPost(bewerk) : LEEG);
    setFout(null);
    setOk(null);
  }, [bewerk]);

  const zet = <K extends keyof Formulier>(k: K, v: Formulier[K]) => setF((x) => ({ ...x, [k]: v }));
  const wissel = (id: KanaalId) => zet("kanalen", f.kanalen.includes(id) ? f.kanalen.filter((x) => x !== id) : [...f.kanalen, id]);

  const schrijf = async () => {
    setBusy("schrijf");
    setFout(null);
    try {
      const r = await api<{ posts: { tekst: string; hashtags: string[]; beeldIdee: string }[]; bron: "model" | "sjabloon" }>({ actie: "schrijf", doelgroep: f.doelgroep, invalshoek: invalshoek || undefined, aantal: 1 });
      const p = r.posts[0];
      if (p) setF((x) => ({ ...x, tekst: p.tekst, hashtags: p.hashtags.join(" "), beeldIdee: p.beeldIdee }));
      setOk(r.bron === "model" ? "De AI schreef een voorstel. Lees het goed na voor je het bewaart." : "Het eigen model was niet bereikbaar: dit is een vaste, gecontroleerde tekst.");
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const bewaar = async (goedkeuren: boolean) => {
    setBusy("bewaar");
    setFout(null);
    setOk(null);
    try {
      await api({
        actie: "bewaar",
        ...(f.id ? { id: f.id } : {}),
        tekst: f.tekst,
        hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean),
        kanalen: f.kanalen,
        beeldUrl: f.beeldUrl,
        beeldIdee: f.beeldIdee,
        link: f.link,
        planLokaal: f.plan || null,
        goedgekeurd: goedkeuren,
        doelgroep: f.doelgroep,
      });
      await laad();
      setBewerk(null);
      setF(LEEG);
      setOk(goedkeuren ? "Bewaard en goedgekeurd: het bericht gaat op de gekozen tijd weg." : "Bewaard als concept.");
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doe = async (body: unknown, melding: string) => {
    setFout(null);
    try {
      await api(body);
      await laad();
      setOk(melding);
    } catch (e) {
      setFout((e as Error).message);
    }
  };

  const lijst = o.posts.filter((p) => filter === "alle" || p.status === filter);
  const hashtagsLijst = f.hashtags.split(/[\s,]+/).filter(Boolean);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel title={f.id ? "Bericht aanpassen" : "Nieuw bericht"} subtitle="Schrijf zelf of laat de AI een voorstel maken">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Doelgroep" className="a-input w-auto" value={f.doelgroep} onChange={(e) => zet("doelgroep", e.target.value as Doelgroep)}>
              <option value="algemeen">Werkers en werkgevers</option>
              <option value="freelancer">Voor werkers</option>
              <option value="werkgever">Voor werkgevers</option>
            </select>
            <input aria-label="Invalshoek voor de AI" className="a-input min-w-[10rem] flex-1" placeholder="Invalshoek (optioneel), bv. snel personeel in de horeca" value={invalshoek} onChange={(e) => setInvalshoek(e.target.value)} />
            <button type="button" className="a-button" disabled={busy !== null} onClick={() => void schrijf()}>{busy === "schrijf" ? "Schrijft…" : "Laat de AI schrijven"}</button>
          </div>

          <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="s-tekst">Tekst</label>
          <textarea id="s-tekst" className="a-input min-h-[8rem]" value={f.tekst} onChange={(e) => zet("tekst", e.target.value)} placeholder="Wat wil je vertellen?" />
          <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="s-tags">Hashtags (met een spatie ertussen)</label>
          <input id="s-tags" className="a-input" value={f.hashtags} onChange={(e) => zet("hashtags", e.target.value)} placeholder="flexwerk zzp horeca" />

          <fieldset>
            <legend className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>Kanalen</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KANALEN.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={f.kanalen.includes(k.id)}
                  onClick={() => wissel(k.id)}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={f.kanalen.includes(k.id) ? { background: "var(--a-text)", color: "var(--a-panel)", borderColor: "var(--a-text)" } : { borderColor: "var(--a-border)", color: "var(--a-mute)" }}
                >
                  {k.naam}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="s-beeld">Beeld (kies een eigen foto of plak een https-adres)</label>
              <select
                aria-label="Kies een eigen foto"
                className="a-input mb-1.5"
                value={BEELDEN.some((b) => f.beeldUrl.endsWith(b.pad)) ? (BEELDEN.find((b) => f.beeldUrl.endsWith(b.pad))?.pad ?? "") : ""}
                onChange={(e) => zet("beeldUrl", e.target.value ? `${window.location.origin}${e.target.value}` : "")}
              >
                <option value="">Geen eigen foto gekozen</option>
                {BEELDEN.map((b) => <option key={b.pad} value={b.pad}>{b.label}</option>)}
              </select>
              <input id="s-beeld" className="a-input" value={f.beeldUrl} onChange={(e) => zet("beeldUrl", e.target.value)} placeholder="https://…" />
              {f.beeldUrl && /^https:\/\//.test(f.beeldUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.beeldUrl} alt="Gekozen beeld" className="mt-1.5 h-20 w-auto rounded-md border" style={{ borderColor: "var(--a-border)" }} />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="s-link">Link naar de site</label>
              <input id="s-link" className="a-input" value={f.link} onChange={(e) => zet("link", e.target.value)} placeholder="https://zekerflex.com" />
            </div>
          </div>
          {f.beeldIdee && <p className="text-xs" style={{ color: "var(--a-dim)" }}>Gedachte voor het beeld: {f.beeldIdee}</p>}
          <div>
            <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="s-plan">Plaatsen op (Nederlandse tijd)</label>
            <input id="s-plan" type="datetime-local" className="a-input w-auto" value={f.plan} onChange={(e) => zet("plan", e.target.value)} />
          </div>

          {f.kanalen.length > 0 && f.tekst.trim() && (
            <details className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--a-border)" }}>
              <summary className="cursor-pointer text-xs font-medium" style={{ color: "var(--a-mute)" }}>Zo komt het op elk kanaal</summary>
              <div className="mt-2 space-y-3">
                {f.kanalen.map((id) => {
                  const t = tekstVoorKanaal(id, f.tekst, hashtagsLijst);
                  const def = KANALEN.find((x) => x.id === id);
                  return (
                    <div key={id}>
                      <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>{def?.naam} <span style={{ color: "var(--a-dim)" }}>· {t.length} van {def?.maxTekens} tekens</span></p>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs" style={{ color: "var(--a-mute)" }}>{t}</p>
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          {ok && <Notice tone="ok">{ok}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button a-button-primary" disabled={busy !== null} onClick={() => void bewaar(true)}>{busy === "bewaar" ? "Bezig…" : "Goedkeuren en inplannen"}</button>
            <button type="button" className="a-button" disabled={busy !== null} onClick={() => void bewaar(false)}>Bewaar als concept</button>
            {f.id && <button type="button" className="a-button" onClick={() => setBewerk(null)}>Nieuw bericht</button>}
          </div>
        </div>
      </Panel>

      <Panel
        title="Alle berichten"
        subtitle={`${o.posts.length} bericht${o.posts.length === 1 ? "" : "en"}`}
        actions={
          <select aria-label="Filter op status" className="a-input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="alle">Alle</option>
            {(Object.keys(STATUS) as PostStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].naam}</option>)}
          </select>
        }
      >
        {lijst.length === 0 ? (
          <Empty title="Geen berichten" body="Schrijf links je eerste bericht, of laat de autopilot er een week klaarzetten." />
        ) : (
          <ul className="space-y-3">
            {lijst.map((p) => (
              <PostKaart key={p.id} p={p} onBewerk={() => setBewerk(p)} doe={doe} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PostKaart({ p, onBewerk, doe }: { p: PostRegel; onBewerk: () => void; doe: (body: unknown, melding: string) => Promise<void> }) {
  const s = STATUS[p.status];
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const site = p.link || "https://zekerflex.com";
  return (
    <li className="rounded-xl border p-3.5" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={s.tone}>{s.naam}</Pill>
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>{tijd(p.plan)}</span>
          {p.bron !== "handmatig" && <span className="text-xs" style={{ color: "var(--a-dim)" }}>· {p.bron === "autopilot" ? "autopilot" : p.bron === "campagne" ? "campagne" : "AI"}</span>}
        </div>
        {!p.goedgekeurd && p.status !== "gepost" && <span className="text-xs font-medium" style={{ color: "var(--a-warn)" }}>Nog niet goedgekeurd</span>}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--a-text)" }}>{p.tekst}</p>
      {p.hashtags.length > 0 && <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>{p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>}

      <ul className="mt-3 space-y-2">
        {p.kanalen.map((id) => {
          const def = KANALEN.find((x) => x.id === id);
          const u = p.uitslag[id];
          const tekst = tekstVoorKanaal(id, p.tekst, p.hashtags);
          const delen = deelLink(id, tekst, site);
          const open = plaatsAdres(id, "");
          return (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span style={{ color: "var(--a-text)" }}>
                <b>{def?.naam}</b>{" "}
                <span style={{ color: u?.status === "gepost" ? "var(--a-ok)" : u?.status === "mislukt" ? "var(--a-crit)" : "var(--a-mute)" }}>
                  {u?.status === "gepost" ? `geplaatst${u.at ? ` ${tijd(u.at)}` : ""}` : u?.status === "mislukt" ? "mislukt" : u?.status === "handmatig" ? "jij plaatst" : "wacht"}
                </span>
                {u?.fout ? <span style={{ color: "var(--a-mute)" }}> · {u.fout}</span> : null}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {(u?.status === "handmatig" || u?.status === "mislukt" || (!u && def?.wijze === "handmatig")) && (
                  <>
                    <button type="button" className="a-button" onClick={() => kopieer(tekst, (k) => setGekopieerd(k ? id : null))}>{gekopieerd === id ? "Gekopieerd" : "Kopieer tekst"}</button>
                    {delen ? <a className="a-button" href={delen} target="_blank" rel="noopener noreferrer">Plaats via {def?.naam}</a> : open ? <a className="a-button" href={open} target="_blank" rel="noopener noreferrer">Open {def?.naam}</a> : null}
                    <button type="button" className="a-button" onClick={() => void doe({ actie: "geplaatst", id: p.id, kanaal: id }, `${def?.naam}: gemarkeerd als geplaatst.`)}>Ik heb het geplaatst</button>
                  </>
                )}
                {u?.status === "mislukt" && <button type="button" className="a-button" onClick={() => void doe({ actie: "opnieuw", id: p.id, kanaal: id }, "Het bericht wordt opnieuw geprobeerd.")}>Opnieuw proberen</button>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--a-border)" }}>
        <button type="button" className="a-button" onClick={onBewerk}>Aanpassen</button>
        {p.status !== "gepost" && !p.goedgekeurd && p.plan && <button type="button" className="a-button a-button-primary" onClick={() => void doe({ actie: "goedkeuren", id: p.id, goedgekeurd: true }, "Goedgekeurd: het bericht gaat op de ingestelde tijd weg.")}>Goedkeuren</button>}
        {p.goedgekeurd && p.status === "gepland" && <button type="button" className="a-button" onClick={() => void doe({ actie: "goedkeuren", id: p.id, goedgekeurd: false }, "Goedkeuring ingetrokken.")}>Intrekken</button>}
        {p.status !== "gepost" && <button type="button" className="a-button" onClick={() => { if (window.confirm("Dit bericht nu laten plaatsen?")) void doe({ actie: "nu", id: p.id }, "Verwerkt: kijk bij de kanalen wat er gebeurde."); }}>Nu plaatsen</button>}
        <button type="button" className="a-button" onClick={() => { if (window.confirm("Dit bericht verwijderen?")) void doe({ actie: "verwijder", id: p.id }, "Verwijderd."); }}>Verwijder</button>
      </div>
    </li>
  );
}

// --- Reacties (praten met ze) ---------------------------------------------------------------------

function ReactiesTab({ o, laad }: { o: SocialOverzicht; laad: () => Promise<void> }) {
  const [filter, setFilter] = useState<"nieuw" | "alle">("nieuw");
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const ophalen = async () => {
    setBusy(true);
    setFout(null);
    setOk(null);
    try {
      const r = await api<{ nieuw: number; automatisch: number; wachtOpMens: number; fout: string | null }>({ actie: "reacties-ophalen" });
      await laad();
      setOk(`${r.nieuw} nieuwe reactie${r.nieuw === 1 ? "" : "s"} opgehaald, ${r.automatisch} zelf beantwoord, ${r.wachtOpMens} wacht${r.wachtOpMens === 1 ? "" : "en"} op jou.${r.fout ? ` Let op: ${r.fout}` : ""}`);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lijst = o.reacties.filter((r) => filter === "alle" || r.status === "nieuw");
  const zelfBeantwoord = o.reacties.filter((r) => r.automatisch && r.status === "beantwoord").length;

  return (
    <div className="space-y-4">
      <KpiStrip
        items={[
          { label: "Wachten op jou", value: String(o.kpi.reactiesOpen), tone: o.kpi.reactiesOpen > 0 ? "warn" : "neutral" },
          { label: "Zelf beantwoord", value: String(zelfBeantwoord), hint: "door de autopilot" },
          { label: "Reacties bewaard", value: String(o.reacties.length) },
        ]}
      />
      {!o.meta.verbonden && (
        <Notice tone="warn">
          Meta is nog niet gekoppeld, dus er worden nog geen reacties opgehaald. Koppel het token bij Kanalen (met ook de rechten pages_read_engagement, pages_manage_engagement en instagram_manage_comments).
        </Notice>
      )}
      <Panel
        title="Reacties op Facebook en Instagram"
        subtitle="De AI stelt een antwoord voor. Gewone reacties beantwoordt de autopilot zelf (als dat aan staat); jij leest de rest."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Filter" className="a-input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="nieuw">Wacht op jou</option>
              <option value="alle">Alle</option>
            </select>
            <button type="button" className="a-button" disabled={busy || !o.meta.verbonden} onClick={() => void ophalen()}>{busy ? "Haalt op…" : "Nu ophalen"}</button>
          </div>
        }
      >
        {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
        {ok && <Notice tone="ok">{ok}</Notice>}
        {lijst.length === 0 ? (
          <Empty title={filter === "nieuw" ? "Niets dat op jou wacht" : "Nog geen reacties"} body="Nieuwe reacties verschijnen hier zodra Meta gekoppeld is; elke 10 minuten kijkt ZekerFlex of er iets nieuws is." />
        ) : (
          <ul className="space-y-3">
            {lijst.map((r) => (
              <ReactieKaart key={r.id} r={r} laad={laad} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReactieKaart({ r, laad }: { r: Reactie; laad: () => Promise<void> }) {
  const [tekst, setTekst] = useState(r.concept);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const doe = async (body: unknown) => {
    setBusy(true);
    setFout(null);
    try {
      await api(body);
      await laad();
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rounded-xl border p-3.5" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          <b style={{ color: "var(--a-text)" }}>{r.van}</b> op {r.kanaal === "facebook" ? "Facebook" : "Instagram"} · {tijd(r.at)}
        </p>
        <Pill tone={r.status === "beantwoord" ? "ok" : r.status === "overgeslagen" ? "neutral" : "warn"}>
          {r.status === "beantwoord" ? (r.automatisch ? "Zelf beantwoord" : "Beantwoord") : r.status === "overgeslagen" ? "Overgeslagen" : "Wacht op jou"}
        </Pill>
      </div>
      {r.bericht && <p className="mt-1 truncate text-xs" style={{ color: "var(--a-dim)" }}>Onder: {r.bericht}</p>}
      <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--a-text)" }}>{r.tekst}</p>
      {r.status === "beantwoord" ? (
        <p className="mt-2 rounded-lg p-2.5 text-sm" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>Ons antwoord</span>
          {r.antwoord}
        </p>
      ) : r.status === "nieuw" ? (
        <div className="mt-2 space-y-2">
          {r.mensNodig && <p className="text-xs font-medium" style={{ color: "var(--a-warn)" }}>{r.mensNodig}</p>}
          {r.fout && <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>{r.fout}</p>}
          <label className="sr-only" htmlFor={`antw-${r.id}`}>Antwoord</label>
          <textarea id={`antw-${r.id}`} className="a-input min-h-[4.5rem]" value={tekst} onChange={(e) => setTekst(e.target.value)} />
          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button a-button-primary" disabled={busy} onClick={() => void doe({ actie: "reactie-verstuur", id: r.id, tekst })}>{busy ? "Bezig…" : "Verstuur antwoord"}</button>
            <button type="button" className="a-button" disabled={busy} onClick={() => void doe({ actie: "reactie-overslaan", id: r.id })}>Overslaan</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// --- Kanalen ------------------------------------------------------------------------------------

function KanalenTab({ o, laad }: { o: SocialOverzicht; laad: () => Promise<void> }) {
  return (
    <div className="space-y-4">
      <MetaPaneel o={o} laad={laad} />
      <div className="grid gap-4 lg:grid-cols-2">
        {o.kanalen.map((k) => (
          <KanaalFormulier key={k.id} k={k} laad={laad} />
        ))}
      </div>
    </div>
  );
}

function MetaPaneel({ o, laad }: { o: SocialOverzicht; laad: () => Promise<void> }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const m = o.meta;

  const run = async (body: unknown, melding: string) => {
    setBusy(true);
    setFout(null);
    setOk(null);
    try {
      await api(body);
      setToken("");
      await laad();
      setOk(melding);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Facebook & Instagram (Meta)" subtitle="De enige koppeling waarmee ZekerFlex zelf berichten kan plaatsen" actions={<Pill tone={m.verbonden ? "ok" : "neutral"}>{m.verbonden ? "Verbonden" : "Niet verbonden"}</Pill>}>
      {m.verbonden ? (
        <div className="space-y-3 text-sm">
          <p style={{ color: "var(--a-text)" }}>
            Facebook-pagina: <b>{m.pageNaam}</b>
            {m.igNaam ? <> · Instagram: <b>@{m.igNaam}</b></> : <span style={{ color: "var(--a-warn)" }}> · geen Instagram-zakelijk-account aan het token gekoppeld</span>}
          </p>
          <p className="text-xs" style={{ color: "var(--a-dim)" }}>Laatst gecontroleerd: {tijd(m.gecontroleerd)}. Het token staat versleuteld opgeslagen en is hier nooit meer te zien.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button" disabled={busy} onClick={() => void run({ actie: "meta-controleer" }, "Het token werkt nog.")}>Controleer verbinding</button>
            <button type="button" className="a-button" disabled={busy} onClick={() => { if (window.confirm("Meta loskoppelen? Berichten voor Facebook en Instagram gaan dan niet meer vanzelf weg.")) void run({ actie: "meta-ontkoppel" }, "Meta is losgekoppeld."); }}>Loskoppelen</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--a-mute)" }}>
            <li>Maak een Facebook-bedrijfspagina en zet het Instagram-account om naar zakelijk (gratis), gekoppeld aan die pagina.</li>
            <li>Maak op developers.facebook.com een app (gratis, blijft in ontwikkelmodus) en voeg jezelf toe als beheerder.</li>
            <li>Maak in de Graph API Explorer een paginatoken met de rechten pages_manage_posts, pages_read_engagement, pages_manage_engagement, instagram_content_publish en instagram_manage_comments (de laatste twee voor reacties), en maak er een langlopend token van.</li>
            <li>Plak dat token hieronder. ZekerFlex vraagt Meta meteen of het klopt voordat het wordt bewaard.</li>
          </ol>
          <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="meta-token">Paginatoken</label>
          <input id="meta-token" type="password" autoComplete="off" className="a-input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Plak het token hier" />
          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          <button type="button" className="a-button a-button-primary" disabled={busy || token.trim().length < 20} onClick={() => void run({ actie: "meta-koppel", token }, "Meta is verbonden.")}>{busy ? "Controleert…" : "Verbinden en controleren"}</button>
        </div>
      )}
      {m.verbonden && fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {m.verbonden && ok && <Notice tone="ok">{ok}</Notice>}
    </Panel>
  );
}

function KanaalFormulier({ k, laad }: { k: KanaalKaart; laad: () => Promise<void> }) {
  const [url, setUrl] = useState(k.config.profielUrl);
  const [bevestigd, setBevestigd] = useState(k.config.bevestigd);
  const [notitie, setNotitie] = useState(k.config.notitie);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const t = TOESTAND[k.toestand];

  const bewaar = async () => {
    setBusy(true);
    setFout(null);
    setOk(false);
    try {
      await api({ actie: "kanaal", kanaal: k.id, profielUrl: url, bevestigd, notitie });
      await laad();
      setOk(true);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={k.naam} subtitle={k.waarom} actions={<Pill tone={t.tone}>{t.naam}</Pill>}>
      <div className="space-y-3">
        <p className="text-xs" style={{ color: "var(--a-dim)" }}>{PUBLIEK[k.publiek]} · {k.wijze === "api" ? "ZekerFlex kan hier zelf plaatsen (met de Meta-koppeling)" : "jij plaatst, ZekerFlex zet de tekst klaar"} · beeld: {k.beeld === "verplicht" ? "altijd nodig" : k.beeld === "video" ? "video" : "handig"} · max {k.maxTekens} tekens</p>
        <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor={`url-${k.id}`}>Link naar ons profiel (https://)</label>
        <input id={`url-${k.id}`} className="a-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
          <input type="checkbox" checked={bevestigd} onChange={(e) => setBevestigd(e.target.checked)} />
          Ik heb gecontroleerd dat dit echt ons account is
        </label>
        <input aria-label={`Notitie bij ${k.naam}`} className="a-input" value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Notitie (bijvoorbeeld wie het account beheert)" />
        <details className="text-xs" style={{ color: "var(--a-mute)" }}>
          <summary className="cursor-pointer font-medium">Zo koppel je dit kanaal</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {k.koppelen.map((s) => <li key={s}>{s}</li>)}
          </ul>
          {k.beperking && <p className="mt-2" style={{ color: "var(--a-warn)" }}>{k.beperking}</p>}
        </details>
        {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
        {ok && <Notice tone="ok">Bewaard.</Notice>}
        <div className="flex gap-2">
          <button type="button" className="a-button a-button-primary" disabled={busy} onClick={() => void bewaar()}>{busy ? "Bezig…" : "Bewaar"}</button>
          {url && <a className="a-button" href={url} target="_blank" rel="noopener noreferrer">Open profiel</a>}
        </div>
      </div>
    </Panel>
  );
}

// --- Campagne -----------------------------------------------------------------------------------

function CampagneTab({ o, laad, naarBerichten }: { o: SocialOverzicht; laad: () => Promise<void>; naarBerichten: () => void }) {
  const [doelgroep, setDoelgroep] = useState<Doelgroep>("werkgever");
  const [invalshoek, setInvalshoek] = useState("");
  const [aantal, setAantal] = useState(5);
  const [kanalen, setKanalen] = useState<KanaalId[]>(["facebook", "instagram", "linkedin"]);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const campagnes = new Set(o.posts.filter((p) => p.campagne).map((p) => p.campagne)).size;

  const maak = async () => {
    setBusy(true);
    setFout(null);
    setOk(null);
    try {
      const r = await api<{ ids: string[]; bron: "model" | "sjabloon" }>({ actie: "campagne", doelgroep, invalshoek, aantal, kanalen });
      await laad();
      setOk(`${r.ids.length} berichten klaargezet, verspreid over de komende werkdagen om 12:15. ${r.bron === "model" ? "De AI schreef ze" : "Het eigen model was niet bereikbaar, dit zijn vaste teksten"}: lees ze na en keur ze goed bij Berichten.`);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Een campagne maken" subtitle="Eén thema, meerdere berichten, verspreid over de week">
        <div className="space-y-3">
          <label className="block text-xs font-medium" style={{ color: "var(--a-mute)" }} htmlFor="c-hoek">Waar gaat de campagne over?</label>
          <input id="c-hoek" className="a-input" value={invalshoek} onChange={(e) => setInvalshoek(e.target.value)} placeholder="Bijvoorbeeld: zomerseizoen horeca, snel personeel bij uitval" />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Doelgroep" className="a-input w-auto" value={doelgroep} onChange={(e) => setDoelgroep(e.target.value as Doelgroep)}>
              <option value="werkgever">Voor werkgevers</option>
              <option value="freelancer">Voor werkers</option>
              <option value="algemeen">Beide</option>
            </select>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
              Aantal berichten
              <input type="number" min={2} max={7} className="a-input w-20" value={aantal} onChange={(e) => setAantal(Math.max(2, Math.min(7, Number(e.target.value) || 2)))} />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>Kanalen</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KANALEN.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kanalen.includes(k.id)}
                  onClick={() => setKanalen((x) => (x.includes(k.id) ? x.filter((i) => i !== k.id) : [...x, k.id]))}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={kanalen.includes(k.id) ? { background: "var(--a-text)", color: "var(--a-panel)", borderColor: "var(--a-text)" } : { borderColor: "var(--a-border)", color: "var(--a-mute)" }}
                >
                  {k.naam}
                </button>
              ))}
            </div>
          </fieldset>
          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          {ok && <Notice tone="ok">{ok}</Notice>}
          <div className="flex gap-2">
            <button type="button" className="a-button a-button-primary" disabled={busy || kanalen.length === 0 || invalshoek.trim().length < 3} onClick={() => void maak()}>{busy ? "Schrijft…" : "Campagne maken"}</button>
            {ok && <button type="button" className="a-button" onClick={naarBerichten}>Naar de berichten</button>}
          </div>
        </div>
      </Panel>
      <Panel title="Hoe het werkt" subtitle={`${campagnes} campagne${campagnes === 1 ? "" : "s"} tot nu toe`}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm" style={{ color: "var(--a-mute)" }}>
          <li>De AI schrijft uitsluitend met de vaste feiten over ZekerFlex (prijzen, uitbetaling, uitzendbureau). Cijfers en beloftes die er niet staan, verzint hij niet.</li>
          <li>Elk bericht komt als concept bij Berichten, op een werkdag om 12:15. Je past de tekst aan, kiest een andere tijd en keurt goed.</li>
          <li>Pas na jouw goedkeuring gaat een bericht weg: op Facebook en Instagram vanzelf (met de koppeling), op de andere kanalen staat de tekst klaar voor jou.</li>
          <li>Voor een beeld of video: maak die in de Studio of de Video-editor en plak het adres bij het bericht.</li>
        </ul>
      </Panel>
    </div>
  );
}

// --- Autopilot ----------------------------------------------------------------------------------

function AutopilotTab({ o, laad }: { o: SocialOverzicht; laad: () => Promise<void> }) {
  const a = o.autopilot;
  const [aan, setAan] = useState(a.aan);
  const [perWeek, setPerWeek] = useState(a.perWeek);
  const [doelgroep, setDoelgroep] = useState<Doelgroep>(a.doelgroep);
  const [kanalen, setKanalen] = useState<KanaalId[]>(a.kanalen);
  const [zelf, setZelf] = useState(a.zelfPlaatsen);
  const [reageer, setReageer] = useState(a.autoReageren);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const bewaar = async () => {
    setBusy(true);
    setFout(null);
    setOk(false);
    try {
      await api({ actie: "autopilot", aan, perWeek, doelgroep, kanalen, zelfPlaatsen: zelf, autoReageren: reageer });
      await laad();
      setOk(true);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Autopilot" subtitle="Zet elke week berichten voor je klaar" actions={<Pill tone={a.aan ? "ok" : "neutral"}>{a.aan ? "Aan" : "Uit"}</Pill>}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--a-text)" }}>
            <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} />
            Autopilot aan
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
              Berichten per week
              <input type="number" min={1} max={7} className="a-input w-20" value={perWeek} onChange={(e) => setPerWeek(Math.max(1, Math.min(7, Number(e.target.value) || 1)))} />
            </label>
            <select aria-label="Doelgroep" className="a-input w-auto" value={doelgroep} onChange={(e) => setDoelgroep(e.target.value as Doelgroep)}>
              <option value="algemeen">Werkers en werkgevers</option>
              <option value="freelancer">Voor werkers</option>
              <option value="werkgever">Voor werkgevers</option>
            </select>
          </div>
          <fieldset>
            <legend className="text-xs font-medium" style={{ color: "var(--a-mute)" }}>Kanalen</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KANALEN.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={kanalen.includes(k.id)}
                  onClick={() => setKanalen((x) => (x.includes(k.id) ? x.filter((i) => i !== k.id) : [...x, k.id]))}
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={kanalen.includes(k.id) ? { background: "var(--a-text)", color: "var(--a-panel)", borderColor: "var(--a-text)" } : { borderColor: "var(--a-border)", color: "var(--a-mute)" }}
                >
                  {k.naam}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
            <input type="checkbox" className="mt-1" checked={zelf} onChange={(e) => setZelf(e.target.checked)} />
            <span>
              De autopilot mag zelf plaatsen, zonder dat ik de berichten eerst goedkeur
              <span className="block text-xs" style={{ color: "var(--a-warn)" }}>Aan = berichten van de AI gaan op de ingestelde tijd weg zonder dat jij ze las. Een vangnet houdt bedragen, kortingen, garanties en alles over de gestopte bank tegen: zo&apos;n bericht wordt een vaste, gecontroleerde tekst.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
            <input type="checkbox" className="mt-1" checked={reageer} onChange={(e) => setReageer(e.target.checked)} />
            <span>
              De autopilot mag zelf antwoorden op gewone reacties (Facebook en Instagram)
              <span className="block text-xs" style={{ color: "var(--a-mute)" }}>Alleen reacties van de laatste 48 uur, hooguit 5 per ronde. Klachten, juridische of privacyvragen en alles waar het model twijfelt blijven voor jou liggen, met een melding. Werkt pas met de Meta-koppeling.</span>
            </span>
          </label>
          {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
          {ok && <Notice tone="ok">Bewaard.</Notice>}
          <button type="button" className="a-button a-button-primary" disabled={busy || kanalen.length === 0} onClick={() => void bewaar()}>{busy ? "Bezig…" : "Bewaar"}</button>
        </div>
      </Panel>
      <Panel title="Wat de autopilot doet" subtitle={a.laatsteRun ? `Laatst gedraaid op ${a.laatsteRun}` : "Nog niet gedraaid"}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm" style={{ color: "var(--a-mute)" }}>
          <li>Elke 10 minuten kijkt ZekerFlex of er een goedgekeurd bericht aan de beurt is en plaatst dat (Facebook en Instagram) of zet het voor jou klaar (de rest, met een melding op je telefoon).</li>
          <li>Staat de autopilot aan en liggen er voor de komende 7 dagen minder berichten dan je instelde, dan schrijft hij de ontbrekende. Ze komen op werkdagen om 08:30, 12:15 en 17:30.</li>
          <li>Hij gebruikt alleen vaste feiten en wat er deze week echt openstaat aan klussen. Zonder open klussen noemt hij er geen. Bij elk bericht kiest hij een eigen foto die bij het onderwerp past, zodat ook Instagram vanzelf kan plaatsen.</li>
          <li>Elke ronde leest hij ook de nieuwe reacties op Facebook en Instagram en beantwoordt wat veilig is (zie het tabblad Reacties).</li>
          <li>{o.modelBeschikbaar ? "Het AI-model is bereikbaar." : "Het AI-model is nu niet bereikbaar: dan gebruikt de autopilot vaste, gecontroleerde teksten."}</li>
          <li>Elke wijziging staat in het auditspoor.</li>
        </ul>
      </Panel>
    </div>
  );
}
