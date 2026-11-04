"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { blockSummary, renderPage } from "@/lib/sites/render";
import { BLOCK_LABELS, isHexColor, newBlock, pageSlug, type Block, type BlockType, type Company, type Media, type Page, type SiteDoc, type Theme } from "@/lib/sites/types";
import SiteStats from "@/components/app/SiteStats";
import { categorieen } from "@/lib/sites/winkel";
import { DomeinZoeker } from "@/components/domeinen/DomeinZoeker";

// ---------------------------------------------------------------------------
// Website bouwen — the builder for a company's own site. Start from a sector
// template, then edit pages, blocks, style, company details and photos; the
// preview in the middle is rendered by the same code as the live site
// (lib/sites/render.ts). Photos come from an upload or from any web address,
// which the server fetches once and stores here (img-src stays 'self').
// Changes save automatically; visitors see them after "Publiceren".
// ---------------------------------------------------------------------------

interface Data {
  site: SiteDoc | null;
  address: string | null;
  templates: { id: string; naam: string; omschrijving: string; theme: { kleur: string; accent: string } }[];
  presets: { naam: string; kleur: string; accent: string }[];
  defaults: Company;
  canPublish: boolean;
}
interface Message {
  id: string;
  at: string;
  naam: string;
  email: string;
  telefoon: string;
  bericht: string;
}

const RESERVED = ["privacy", "bedankt", "media", "assets", "_zf", "sitemap", "robots", "p", "winkel", "bestellen", "besteld"];
const nid = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Where the builder saves: a company's own site, or (Admin → Websitevoorstellen) a
 * design proposal. The base serves GET/PUT, with "/publish" and "/media" under it.
 * A proposal has no messages, no own domain and no "offline" (withdraw it instead).
 */
interface BuilderApi {
  base: string;
  proposal: boolean;
}
const BuilderApiContext = createContext<BuilderApi>({ base: "/api/werkgever/sites", proposal: false });
const useBuilderApi = () => useContext(BuilderApiContext);
/** The builder's own photo route (img-src 'self'); the preview and the pickers load photos through it. */
function useMediaUrl(): (file: string) => string {
  const { base } = useBuilderApi();
  return useCallback((file: string) => `${base}/media/${file}`, [base]);
}
const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

async function errorText(res: Response | null, fallback: string): Promise<string> {
  const d = res ? await res.json().catch(() => ({})) : {};
  return d?.error?.message ?? fallback;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function SiteBuilder({ origin, apiBase = "/api/werkgever/sites", proposal = false }: { origin: string; apiBase?: string; proposal?: boolean }) {
  const api = useMemo(() => ({ base: apiBase, proposal }), [apiBase, proposal]);
  return (
    <BuilderApiContext.Provider value={api}>
      <Builder origin={origin} />
    </BuilderApiContext.Provider>
  );
}

function Builder({ origin }: { origin: string }) {
  const { base } = useBuilderApi();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError(await errorText(res, "De websitebouwer kon niet laden."));
    setData((await res.json()) as Data);
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p role="alert" className="card p-6 text-sm text-crit">{error}</p>;
  if (!data) return <div className="card h-40 animate-pulse" />;
  if (!data.site) return <StartWizard data={data} onCreated={(site, address) => setData({ ...data, site, address })} />;
  return <Editor data={data} site={data.site} origin={origin} onSite={(site) => setData({ ...data, site })} />;
}

// ---- start: pick a sector, check the company details ------------------------

function StartWizard({ data, onCreated }: { data: Data; onCreated: (site: SiteDoc, address: string) => void }) {
  const [templateId, setTemplateId] = useState(data.templates[0]?.id ?? "algemeen");
  const [bedrijf, setBedrijf] = useState<Company>(data.defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { base } = useBuilderApi();

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, bedrijf }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(await errorText(res, "Maken lukte niet."));
    const d = await res.json();
    onCreated(d.site, d.address);
  };

  const set = (k: keyof Company) => (e: ChangeEvent<HTMLInputElement>) => setBedrijf({ ...bedrijf, [k]: e.target.value });
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Website bouwen</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Je eigen website, gemaakt en gehost door ZekerFlex</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">Kies je branche, controleer je gegevens en je hebt meteen een complete website om aan te passen. Snel, veilig, zonder cookies of reclame, en alles op één plek.</p>
      </header>
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold text-ink">1. Kies je branche</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              aria-pressed={templateId === t.id}
              className={`rounded-xl border p-4 text-left transition ${templateId === t.id ? "border-brand-600 ring-2 ring-brand-100" : "border-hair hover:border-brand-300"}`}
            >
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-5 w-10 rounded-full" style={{ background: t.theme.kleur }} />
                <span className="h-5 w-5 rounded-full" style={{ background: t.theme.accent }} />
              </span>
              <span className="mt-3 block font-semibold text-ink">{t.naam}</span>
              <span className="mt-0.5 block text-sm text-neutralx-600">{t.omschrijving}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold text-ink">2. Je bedrijfsgegevens</h2>
        <p className="mt-1 text-sm text-neutralx-600">Al ingevuld met wat we van je weten. Het KVK-nummer komt onderaan elke pagina, zoals de wet vraagt.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Bedrijfsnaam"><input className="field-input" value={bedrijf.naam} onChange={set("naam")} maxLength={100} /></Field>
          <Field label="KVK-nummer"><input className="field-input" value={bedrijf.kvk} onChange={set("kvk")} inputMode="numeric" maxLength={8} /></Field>
          <Field label="Straat en huisnummer"><input className="field-input" value={bedrijf.straat} onChange={set("straat")} maxLength={120} /></Field>
          <Field label="Postcode"><input className="field-input" value={bedrijf.postcode} onChange={set("postcode")} maxLength={10} /></Field>
          <Field label="Plaats"><input className="field-input" value={bedrijf.plaats} onChange={set("plaats")} maxLength={80} /></Field>
          <Field label="Telefoon"><input className="field-input" value={bedrijf.telefoon} onChange={set("telefoon")} maxLength={30} /></Field>
          <Field label="E-mail voor berichten van bezoekers"><input className="field-input" type="email" value={bedrijf.email} onChange={set("email")} maxLength={200} /></Field>
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-crit">{error}</p>}
        <div className="mt-6 flex justify-end">
          <button type="button" disabled={busy || !bedrijf.naam.trim()} onClick={() => void create()} className="btn-primary disabled:opacity-50">
            {busy ? "Bezig…" : "Maak mijn website"}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---- the editor --------------------------------------------------------------

type Tab = "paginas" | "blokken" | "stijl" | "bedrijf" | "fotos" | "berichten" | "bezoekers" | "domein";
const TABS: { id: Tab; label: string }[] = [
  { id: "blokken", label: "Blokken" },
  { id: "paginas", label: "Pagina's" },
  { id: "stijl", label: "Stijl" },
  { id: "bedrijf", label: "Bedrijf" },
  { id: "fotos", label: "Foto's" },
  { id: "berichten", label: "Berichten" },
  { id: "bezoekers", label: "Bezoekers" },
  { id: "domein", label: "Domein" },
];
// The preview renders at the device's real width and is scaled down to fit, so
// "Computer" shows the desktop layout even in a narrow column.
const DEVICES = [
  { id: "computer", label: "Computer", width: 1280, height: 860 },
  { id: "tablet", label: "Tablet", width: 820, height: 1100 },
  { id: "telefoon", label: "Telefoon", width: 390, height: 844 },
] as const;

/** Hover and selection in the preview: blue like the editors people know; only in the builder's copy of the page. */
const KIES_CSS = "[data-blok]{cursor:pointer}[data-blok]:hover{outline:2px dashed #2563eb;outline-offset:-2px}[data-blok].zf-gekozen{outline:3px solid #2563eb;outline-offset:-3px}";

function ScaledPreview({ html, title, device, gekozen, onKies }: { html: string; title: string; device: (typeof DEVICES)[number]; gekozen?: string | null; onKies?: (blockId: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const kies = useRef(onKies);
  useEffect(() => {
    kies.current = onKies;
  });
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setBoxWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the chosen block gets the blue line and comes into view (only scrolls when it is out of sight)
  const markeer = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    for (const el of doc.querySelectorAll(".zf-gekozen")) el.classList.remove("zf-gekozen");
    if (!gekozen) return;
    const el = doc.querySelector(`[data-blok="${CSS.escape(gekozen)}"]`);
    el?.classList.add("zf-gekozen");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [gekozen]);
  useEffect(() => markeer(), [markeer]);

  // the page has no scripts of its own (sandbox); the builder listens from outside: click a block = edit it
  const geladen = () => {
    const doc = frame.current?.contentDocument;
    if (!doc || !kies.current) return;
    const style = doc.createElement("style");
    style.textContent = KIES_CSS;
    doc.head.appendChild(style);
    doc.addEventListener("click", (e) => {
      const el = e.target instanceof Element ? e.target.closest("[data-blok]") : null;
      e.preventDefault();
      const id = el?.getAttribute("data-blok");
      if (id) kies.current?.(id);
    });
    markeer();
  };

  const scale = boxWidth ? Math.min(1, boxWidth / device.width) : 1;
  return (
    <div ref={box} className="w-full">
      <div className="mx-auto overflow-hidden rounded-lg border border-hair bg-white shadow-card" style={{ width: device.width * scale, height: device.height * scale }}>
        <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-same-origin" onLoad={geladen} style={{ width: device.width, height: device.height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }} />
      </div>
    </div>
  );
}

function Editor({ data, site: initial, origin, onSite }: { data: Data; site: SiteDoc; origin: string; onSite: (s: SiteDoc) => void }) {
  const [site, setSite] = useState<SiteDoc>(initial);
  const [pageId, setPageId] = useState(initial.pages[0]?.id ?? "");
  const [blockId, setBlockId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("blokken");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("computer");
  const [save, setSave] = useState<{ state: "opgeslagen" | "wijzigingen" | "bezig" | "fout"; text?: string }>({ state: "opgeslagen" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState(data.address);
  const dirty = useRef(false);
  const { base, proposal } = useBuilderApi();
  const mediaUrl = useMediaUrl();

  const page = site.pages.find((p) => p.id === pageId) ?? site.pages[0]!;
  const block = page.blocks.find((b) => b.id === blockId) ?? null;

  // every change: mark dirty; save 1.2 s after the last one
  const change = useCallback((fn: (s: SiteDoc) => SiteDoc) => {
    dirty.current = true;
    setSave({ state: "wijzigingen" });
    setSite((s) => fn(s));
  }, []);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(async () => {
      dirty.current = false;
      setSave({ state: "bezig" });
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // the shop is saved by the Websitestudio itself (/api/werkgever/sites/winkel), never from here
        body: JSON.stringify({ theme: site.theme, bedrijf: site.bedrijf, pages: site.pages, altTexts: Object.fromEntries(site.media.map((m) => [m.id, m.alt])) }),
      }).catch(() => null);
      if (!res?.ok) return setSave({ state: "fout", text: await errorText(res, "Opslaan lukte niet.") });
      setSave({ state: "opgeslagen" });
    }, 1200);
    return () => clearTimeout(timer);
  }, [site, base]);

  const updatePage = (fn: (p: Page) => Page) => change((s) => ({ ...s, pages: s.pages.map((p) => (p.id === page.id ? fn(p) : p)) }));
  const updateBlock = (id: string, fn: (b: Block) => Block) => updatePage((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === id ? fn(b) : b)) }));

  const html = useMemo(() => renderPage(site, page, { root: "/", origin, preview: { mediaUrl } }), [site, page, origin, mediaUrl]);

  const publish = async (action: "publiceer" | "terug" | "offline", buildId?: string) => {
    if (action === "offline" && !window.confirm("De website offline halen? Bezoekers zien dan een melding dat hij niet bestaat. Je kunt hem later weer publiceren.")) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch(`${base}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(buildId ? { buildId } : {}) }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNotice({ ok: false, text: await errorText(res, "Dat lukte niet.") });
    const next = (await res.json()).site as SiteDoc;
    setSite((s) => ({ ...s, liveBuild: next.liveBuild, builds: next.builds }));
    onSite(next);
    const done = proposal ? "Het voorstel is bijgewerkt: de voorstelsite toont nu deze versie." : "Je website staat online.";
    setNotice({ ok: true, text: action === "publiceer" ? done : action === "terug" ? "De gekozen versie staat weer online." : "Je website staat offline." });
  };

  const live = Boolean(site.liveBuild);
  const tabs = proposal ? TABS.filter((t) => t.id !== "berichten" && t.id !== "bezoekers" && t.id !== "domein") : TABS;
  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{proposal ? "Websitevoorstel aanpassen" : "Website bouwen"}</p>
          <h1 className="truncate font-display text-xl font-bold text-ink">{site.bedrijf.naam}</h1>
          <p className="truncate text-xs text-neutralx-500">
            {live && address ? (
              <a href={address} target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">{address}</a>
            ) : (
              <>Nog niet online · adres straks {address}</>
            )}
          </p>
        </div>
        <span className={`pill ${live ? "pill-ok" : "pill-warn"}`}>{live ? "Online" : "Concept"}</span>
        <span className="text-xs text-neutralx-500" aria-live="polite">
          {save.state === "bezig" ? "Opslaan…" : save.state === "wijzigingen" ? "Wijzigingen…" : save.state === "fout" ? <span className="text-crit">{save.text}</span> : "Alles opgeslagen"}
        </span>
        {data.canPublish ? (
          <button type="button" disabled={busy || save.state === "bezig"} onClick={() => void publish("publiceer")} className="btn-primary disabled:opacity-50">
            {busy ? "Bezig…" : live ? "Wijzigingen publiceren" : "Publiceren"}
          </button>
        ) : (
          <Link href="/werkgever/website" className="btn-primary">Online zetten met Website-beheer</Link>
        )}
      </header>
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${notice.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
          {notice.text}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        <aside className="card min-w-0 p-3" aria-label="Pagina's, blokken en instellingen">
          <div className="flex flex-wrap gap-1 border-b border-hair pb-2" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-3">
            {tab === "blokken" && <BlocksTab page={page} selected={blockId} onSelect={setBlockId} updatePage={updatePage} />}
            {tab === "paginas" && <PagesTab site={site} current={page.id} onSelect={(id) => { setPageId(id); setBlockId(null); }} change={change} />}
            {tab === "stijl" && <StyleTab theme={site.theme} presets={data.presets} media={site.media} onTheme={(theme) => change((s) => ({ ...s, theme }))} />}
            {tab === "bedrijf" && <CompanyTab bedrijf={site.bedrijf} onChange={(bedrijf) => change((s) => ({ ...s, bedrijf }))} />}
            {tab === "fotos" && <PhotosTab site={site} onMedia={(media) => setSite((s) => ({ ...s, media: [...s.media, media] }))} onAlt={(id, alt) => change((s) => ({ ...s, media: s.media.map((m) => (m.id === id ? { ...m, alt } : m)) }))} />}
            {tab === "berichten" && <MessagesTab />}
            {tab === "bezoekers" && <SiteStats published={Boolean(site.liveBuild)} />}
            {tab === "domein" && <DomainTab canPublish={data.canPublish} onAddress={(own) => setAddress(own ?? `${origin}/site/${site.slug}`)} />}
          </div>
          {site.builds.length > 0 && (
            <details className="mt-4 border-t border-hair pt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">Versies ({site.builds.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {site.builds.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{when(b.at)} · {b.by}{b.id === site.liveBuild ? " · online" : ""}</span>
                    {b.id !== site.liveBuild && data.canPublish && (
                      <button type="button" onClick={() => void publish("terug", b.id)} className="font-semibold text-brand-600 hover:underline">Zet terug</button>
                    )}
                  </li>
                ))}
              </ul>
              {live && !proposal && (
                <button type="button" onClick={() => void publish("offline")} className="mt-3 text-xs font-semibold text-crit hover:underline">Website offline halen</button>
              )}
            </details>
          )}
        </aside>

        <section className="card min-w-0 overflow-hidden" aria-label="Voorbeeld">
          <div className="flex items-center justify-between gap-2 border-b border-hair px-3 py-2">
            <span className="truncate text-xs font-semibold text-neutralx-600">Voorbeeld: {page.titel}</span>
            <div className="flex gap-1">
              {DEVICES.map((d) => (
                <button key={d.id} type="button" aria-pressed={device === d.id} onClick={() => setDevice(d.id)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${device === d.id ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-paper-soft p-3">
            <ScaledPreview
              html={html}
              title={`Voorbeeld van ${page.titel}`}
              device={DEVICES.find((d) => d.id === device) ?? DEVICES[0]}
              gekozen={blockId}
              onKies={(id) => {
                setBlockId(id);
                setTab("blokken");
              }}
            />
          </div>
        </section>

        <aside className="card min-w-0 p-4" aria-label="Blok bewerken">
          {block ? (
            <BlockEditor key={block.id} block={block} site={site} onChange={(b) => updateBlock(block.id, () => b)} onClose={() => setBlockId(null)} onMedia={(media) => setSite((s) => ({ ...s, media: [...s.media, media] }))} />
          ) : (
            <div className="space-y-2 text-sm text-neutralx-600">
              <p className="font-semibold text-ink">Kies een blok om te bewerken</p>
              <p>Klik op een blok in het voorbeeld, of links in de lijst. Je ziet je wijziging meteen; bezoekers zien hem na Publiceren. De volgorde verander je door blokken in de lijst te slepen.</p>
              <p>Foto&apos;s van een andere website? Plak het adres van de foto bij Foto&apos;s. We halen hem één keer op en bewaren hem hier, zodat je bezoekers niets van een ander laden.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---- tabs ---------------------------------------------------------------------

function BlocksTab({ page, selected, onSelect, updatePage }: { page: Page; selected: string | null; onSelect: (id: string) => void; updatePage: (fn: (p: Page) => Page) => void }) {
  const [adding, setAdding] = useState(false);
  // slepen: welk blok je oppakt en waar het neer zou komen
  const [sleep, setSleep] = useState<{ van: number; naar: number } | null>(null);
  const verplaats = (van: number, naar: number) =>
    updatePage((p) => {
      if (van === naar || naar < 0 || naar >= p.blocks.length) return p;
      const blocks = [...p.blocks];
      const [b] = blocks.splice(van, 1);
      if (b) blocks.splice(naar, 0, b);
      return { ...p, blocks };
    });
  const move = (i: number, d: -1 | 1) => verplaats(i, i + d);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Pagina: {page.titel}</p>
      <ol className="space-y-1.5">
        {page.blocks.map((b, i) => (
          <li
            key={b.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setSleep({ van: i, naar: i });
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (sleep && sleep.naar !== i) setSleep({ ...sleep, naar: i });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (sleep) verplaats(sleep.van, i);
              setSleep(null);
            }}
            onDragEnd={() => setSleep(null)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${selected === b.id ? "border-brand-600 bg-brand-50" : "border-hair"} ${sleep?.van === i ? "opacity-40" : ""} ${sleep && sleep.naar === i && sleep.van !== i ? "ring-2 ring-brand-300" : ""}`}
          >
            <span aria-hidden="true" title="Sleep om te verplaatsen" className="cursor-grab select-none px-0.5 text-neutralx-400">⋮⋮</span>
            <button type="button" onClick={() => onSelect(b.id)} className="min-w-0 flex-1 truncate text-left text-sm text-ink">{blockSummary(b)}</button>
            <button type="button" aria-label="Omhoog" disabled={i === 0} onClick={() => move(i, -1)} className="rounded px-1.5 text-neutralx-500 hover:bg-paper-soft disabled:opacity-30">↑</button>
            <button type="button" aria-label="Omlaag" disabled={i === page.blocks.length - 1} onClick={() => move(i, 1)} className="rounded px-1.5 text-neutralx-500 hover:bg-paper-soft disabled:opacity-30">↓</button>
            <button type="button" aria-label="Dupliceren" onClick={() => updatePage((p) => ({ ...p, blocks: [...p.blocks.slice(0, i + 1), { ...structuredClone(b), id: nid("b") }, ...p.blocks.slice(i + 1)] }))} className="rounded px-1.5 text-neutralx-500 hover:bg-paper-soft">⧉</button>
            <button type="button" aria-label="Verwijderen" onClick={() => window.confirm("Dit blok verwijderen?") && updatePage((p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) }))} className="rounded px-1.5 text-crit hover:bg-crit/10">✕</button>
          </li>
        ))}
      </ol>
      {adding ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                const b = newBlock(t, nid("b"));
                updatePage((p) => ({ ...p, blocks: [...p.blocks, b] }));
                onSelect(b.id);
                setAdding(false);
              }}
              className="rounded-lg border border-hair px-2 py-2 text-left text-xs font-medium text-ink hover:border-brand-300"
            >
              {BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" disabled={page.blocks.length >= 30} onClick={() => setAdding(true)} className="btn-ghost w-full text-sm">+ Blok toevoegen</button>
      )}
    </div>
  );
}

function PagesTab({ site, current, onSelect, change }: { site: SiteDoc; current: string; onSelect: (id: string) => void; change: (fn: (s: SiteDoc) => SiteDoc) => void }) {
  const [titel, setTitel] = useState("");
  const slugFor = (t: string) => {
    let base = pageSlug(t) || "pagina";
    if (RESERVED.includes(base)) base = `${base}-info`;
    let slug = base;
    for (let n = 2; site.pages.some((p) => p.slug === slug); n++) slug = `${base}-${n}`;
    return slug;
  };
  const add = () => {
    const t = titel.trim().slice(0, 40);
    if (!t) return;
    const page: Page = { id: nid("p"), slug: slugFor(t), titel: t, seoTitel: `${t} | ${site.bedrijf.naam}`.slice(0, 70), seoOmschrijving: "", blocks: [newBlock("tekst", nid("b"))] };
    change((s) => ({ ...s, pages: [...s.pages, page] }));
    onSelect(page.id);
    setTitel("");
  };
  const edit = (id: string, patch: Partial<Page>) => change((s) => ({ ...s, pages: s.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {site.pages.map((p, i) => (
          <li key={p.id} className={`rounded-lg border p-2 ${p.id === current ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onSelect(p.id)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink">{p.titel}</button>
              <span className="text-[11px] text-neutralx-500">/{p.slug}</span>
              {i > 0 && (
                <button type="button" aria-label="Eerder in het menu" onClick={() => change((s) => { const pages = [...s.pages]; [pages[i - 1], pages[i]] = [pages[i]!, pages[i - 1]!]; return { ...s, pages }; })} disabled={i === 1 && site.pages[0]?.slug === ""} className="rounded px-1 text-neutralx-500 disabled:opacity-30">↑</button>
              )}
              {p.slug !== "" && (
                <button type="button" aria-label="Pagina verwijderen" onClick={() => window.confirm(`De pagina ${p.titel} verwijderen?`) && change((s) => ({ ...s, pages: s.pages.filter((x) => x.id !== p.id) }))} className="rounded px-1 text-crit">✕</button>
              )}
            </div>
            {p.id === current && (
              <div className="mt-2 space-y-2">
                <Field label="Naam in het menu"><input className="field-input" value={p.titel} maxLength={40} onChange={(e) => edit(p.id, { titel: e.target.value })} /></Field>
                <Field label="Titel in Google (max. 70 tekens)"><input className="field-input" value={p.seoTitel} maxLength={70} onChange={(e) => edit(p.id, { seoTitel: e.target.value })} /></Field>
                <Field label="Omschrijving in Google (max. 170 tekens)"><textarea className="field-input" rows={3} value={p.seoOmschrijving} maxLength={170} onChange={(e) => edit(p.id, { seoOmschrijving: e.target.value })} /></Field>
              </div>
            )}
          </li>
        ))}
      </ul>
      {site.pages.length < 12 && (
        <div className="flex gap-2">
          <input className="field-input !mt-0" placeholder="Nieuwe pagina, bv. Vacatures" value={titel} maxLength={40} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button type="button" onClick={add} className="btn-ghost flex-shrink-0 text-sm">Toevoegen</button>
        </div>
      )}
    </div>
  );
}

function StyleTab({ theme, presets, media, onTheme }: { theme: Theme; presets: Data["presets"]; media: Media[]; onTheme: (t: Theme) => void }) {
  const mediaUrl = useMediaUrl();
  return (
    <div className="space-y-4 text-sm">
      <Field label="Stijl">
        <select className="field-input" value={theme.stijl ?? "standaard"} onChange={(e) => onTheme({ ...theme, stijl: e.target.value === "luxe" || e.target.value === "premium" || e.target.value === "beleving" ? e.target.value : "standaard" })}>
          <option value="beleving">Beleving (schuine foto&apos;s, band met je aanbod, grote koppen)</option>
          <option value="premium">Premium (donkere opening, grote koppen, ronde knoppen)</option>
          <option value="standaard">Standaard (licht en vriendelijk)</option>
          <option value="luxe">Luxe (veel ruimte, grote foto, verfijnde letters)</option>
        </select>
      </Field>
      <div>
        <p className="field-label">Logo bovenaan</p>
        {media.length === 0 ? (
          <p className="mt-1 text-xs text-neutralx-500">Zet je logo eerst bij Foto&apos;s (JPG, PNG of WebP), dan kun je het hier kiezen.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2">
            <button type="button" onClick={() => onTheme({ ...theme, logo: null })} aria-pressed={!theme.logo} className={`rounded-lg border p-1 text-[11px] leading-tight ${!theme.logo ? "border-brand-600 ring-2 ring-brand-100" : "border-hair hover:border-brand-300"}`}>
              Naam als tekst
            </button>
            {media.map((m) => (
              <button key={m.id} type="button" onClick={() => onTheme({ ...theme, logo: m.id })} aria-pressed={theme.logo === m.id} aria-label={`Als logo: ${m.alt || "foto"}`} className={`rounded-lg border bg-white p-1 ${theme.logo === m.id ? "border-brand-600 ring-2 ring-brand-100" : "border-hair hover:border-brand-300"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(m.file)} alt="" className="h-10 w-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="field-label">Kleuren</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button key={p.naam} type="button" onClick={() => onTheme({ ...theme, kleur: p.kleur, accent: p.accent })} aria-pressed={theme.kleur === p.kleur && theme.accent === p.accent} className="rounded-lg border border-hair p-2 text-left text-xs hover:border-brand-300">
              <span className="flex gap-1" aria-hidden>
                <span className="h-4 w-7 rounded-full" style={{ background: p.kleur }} />
                <span className="h-4 w-4 rounded-full" style={{ background: p.accent }} />
              </span>
              <span className="mt-1 block">{p.naam}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Hoofdkleur"><input type="color" className="mt-1.5 h-10 w-full cursor-pointer rounded-lg border border-hairstrong" value={theme.kleur} onChange={(e) => isHexColor(e.target.value) && onTheme({ ...theme, kleur: e.target.value })} /></Field>
          <Field label="Accent (knoppen)"><input type="color" className="mt-1.5 h-10 w-full cursor-pointer rounded-lg border border-hairstrong" value={theme.accent} onChange={(e) => isHexColor(e.target.value) && onTheme({ ...theme, accent: e.target.value })} /></Field>
        </div>
      </div>
      <Field label="Lettertype">
        <select className="field-input" value={theme.lettertype} onChange={(e) => onTheme({ ...theme, lettertype: e.target.value as Theme["lettertype"] })}>
          <option value="modern">Modern (strak)</option>
          <option value="klassiek">Klassiek (schreef in koppen)</option>
          <option value="vriendelijk">Vriendelijk (rond)</option>
        </select>
      </Field>
      <Field label="Hoeken">
        <select className="field-input" value={theme.hoeken} onChange={(e) => onTheme({ ...theme, hoeken: e.target.value as Theme["hoeken"] })}>
          <option value="rond">Rond</option>
          <option value="strak">Strak</option>
        </select>
      </Field>
      <p className="text-xs text-neutralx-500">Lettertypes komen van het apparaat van de bezoeker: niets te downloaden, dus extra snel en zonder diensten van anderen.</p>
    </div>
  );
}

/** The lines someone typed → https links ("www.instagram.com/x" becomes "https://www.instagram.com/x"); the rest is left out. */
function socialLinks(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().replace(/^http:\/\//i, "https://"))
    .map((s) => (/^[a-z][a-z0-9+.-]*:/i.test(s) || !/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s) ? s : `https://${s}`))
    .filter((s) => /^https:\/\/[^\s<>"']+\.[^\s<>"']+$/.test(s))
    .slice(0, 6);
}

function CompanyTab({ bedrijf, onChange }: { bedrijf: Company; onChange: (c: Company) => void }) {
  const set = (k: keyof Company) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...bedrijf, [k]: e.target.value });
  // the text as typed (half-typed lines included); only finished links are saved
  const [socialText, setSocialText] = useState(() => (bedrijf.socials ?? []).join("\n"));
  return (
    <div className="space-y-3">
      <Field label="Bedrijfsnaam"><input className="field-input" value={bedrijf.naam} onChange={set("naam")} maxLength={100} /></Field>
      <Field label="KVK-nummer (8 cijfers)"><input className="field-input" value={bedrijf.kvk} onChange={set("kvk")} inputMode="numeric" maxLength={8} /></Field>
      <Field label="Straat en huisnummer"><input className="field-input" value={bedrijf.straat} onChange={set("straat")} maxLength={120} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Postcode"><input className="field-input" value={bedrijf.postcode} onChange={set("postcode")} maxLength={10} /></Field>
        <Field label="Plaats"><input className="field-input" value={bedrijf.plaats} onChange={set("plaats")} maxLength={80} /></Field>
      </div>
      <Field label="Telefoon"><input className="field-input" value={bedrijf.telefoon} onChange={set("telefoon")} maxLength={30} /></Field>
      <Field label="E-mail (berichten van bezoekers)"><input className="field-input" type="email" value={bedrijf.email} onChange={set("email")} maxLength={200} /></Field>
      <Field label="WhatsApp (mobiel nummer, mag leeg)"><input className="field-input" value={bedrijf.whatsapp ?? ""} onChange={set("whatsapp")} inputMode="tel" maxLength={30} placeholder="06 12345678" /></Field>
      <Field label="Sociale media (één link per regel)">
        <textarea
          className="field-input min-h-[80px]"
          value={socialText}
          onChange={(e) => {
            setSocialText(e.target.value);
            onChange({ ...bedrijf, socials: socialLinks(e.target.value) });
          }}
          placeholder="https://www.instagram.com/jouwbedrijf"
        />
      </Field>
      <p className="text-xs text-neutralx-500">Met een WhatsApp-nummer staat er een WhatsApp-knop op elke pagina. Sociale media komen onderaan.</p>
    </div>
  );
}

function usePhotoAdd(onMedia: (m: Media) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { base } = useBuilderApi();
  const send = async (init: RequestInit, failed: string): Promise<Media | null> => {
    setBusy(true);
    setError(null);
    const res = await fetch(`${base}/media`, { method: "POST", ...init }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(await errorText(res, failed));
      return null;
    }
    const m = (await res.json()).media as Media;
    onMedia(m);
    return m;
  };
  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return send({ body: form }, "Uploaden lukte niet.");
  };
  const fromUrl = (url: string, alt = "") =>
    send({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, alt }) }, "Ophalen lukte niet.");
  return { busy, error, upload, fromUrl };
}

function AddPhoto({ onMedia, onAdded }: { onMedia: (m: Media) => void; onAdded?: (m: Media) => void }) {
  const { busy, error, upload, fromUrl } = usePhotoAdd(onMedia);
  const [url, setUrl] = useState("");
  return (
    <div className="space-y-2">
      <label className="btn-ghost w-full cursor-pointer text-sm">
        {busy ? "Bezig…" : "Foto uploaden"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              const m = await upload(f);
              if (m) onAdded?.(m);
            }
          }}
        />
      </label>
      <div className="flex gap-2">
        <input className="field-input !mt-0 text-sm" placeholder="Of plak het adres van een foto" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button
          type="button"
          disabled={busy || !/^https?:\/\//i.test(url.trim())}
          onClick={async () => {
            const m = await fromUrl(url.trim());
            if (m) {
              setUrl("");
              onAdded?.(m);
            }
          }}
          className="btn-ghost flex-shrink-0 text-sm disabled:opacity-50"
        >
          Ophalen
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-crit">{error}</p>}
    </div>
  );
}

function PhotosTab({ site, onMedia, onAlt }: { site: SiteDoc; onMedia: (m: Media) => void; onAlt: (id: string, alt: string) => void }) {
  const mediaUrl = useMediaUrl();
  return (
    <div className="space-y-3">
      <AddPhoto onMedia={onMedia} />
      <p className="text-xs text-neutralx-500">Foto&apos;s van internet halen we één keer op, maken we kleiner en ontdoen we van locatiegegevens. Ze staan daarna hier, zodat je bezoekers niets van een andere website laden. Gebruik alleen foto&apos;s die je mag gebruiken.</p>
      <ul className="grid grid-cols-2 gap-2">
        {site.media.map((m) => (
          <li key={m.id} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(m.file)} alt={m.alt} className="aspect-square w-full rounded-lg border border-hair object-cover" />
            <input className="w-full rounded border border-hair px-1.5 py-1 text-[11px]" placeholder="Beschrijving (voor blinden en Google)" value={m.alt} maxLength={200} onChange={(e) => onAlt(m.id, e.target.value)} />
            {m.bron === "internet" && m.sourceUrl && <p className="truncate text-[10px] text-neutralx-400">van {(() => { try { return new URL(m.sourceUrl).hostname; } catch { return "internet"; } })()}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagesTab() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  useEffect(() => {
    fetch("/api/werkgever/sites/publish", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages))
      .catch(() => setMessages([]));
  }, []);
  if (!messages) return <p className="text-sm text-neutralx-500">Laden…</p>;
  if (messages.length === 0) return <p className="text-sm text-neutralx-500">Nog geen berichten via je website. Ze komen hier binnen en worden ook naar je e-mailadres gestuurd.</p>;
  return (
    <ul className="space-y-2">
      {messages.map((m) => (
        <li key={m.id} className="rounded-lg border border-hair p-3 text-sm">
          <p className="font-semibold text-ink">{m.naam}</p>
          <p className="text-xs text-neutralx-500">{when(m.at)} · <a href={`mailto:${m.email}`} className="text-brand-600">{m.email}</a>{m.telefoon ? ` · ${m.telefoon}` : ""}</p>
          <p className="mt-1 whitespace-pre-line text-neutralx-700">{m.bericht}</p>
        </li>
      ))}
    </ul>
  );
}

// ---- own domain (lib/sites/domain.ts) ------------------------------------------

interface DnsRecordRow {
  type: string;
  name: string;
  short: string;
  value: string;
  why: string;
}
interface DomainState {
  host: string;
  alias: string | null;
  verifiedAt: string | null;
  activeAt: string | null;
  check: { at: string; txt: boolean; a: boolean; aaaa: boolean; alias: boolean; https: boolean; problem: string | null } | null;
}

function DomainTab({ canPublish, onAddress }: { canPublish: boolean; onAddress: (ownDomain: string | null) => void }) {
  const [state, setState] = useState<{ domein: DomainState | null; records: DnsRecordRow[] } | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/werkgever/sites/domain", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return setError(await errorText(res, "Je domein kon niet laden."));
      setState(await res.json());
    })();
  }, []);

  const act = async (action: "koppel" | "controleer" | "ontkoppel") => {
    if (action === "ontkoppel" && !window.confirm("Het domein loskoppelen? Je website blijft online op het adres van ZekerFlex.")) return;
    setBusy(action);
    setError(null);
    const res = await fetch("/api/werkgever/sites/domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "koppel" ? { action, domein: input } : { action }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(await errorText(res, "Dat lukte niet. Probeer het opnieuw."));
    const next = (await res.json()) as { domein: DomainState | null; records: DnsRecordRow[] };
    setState(next);
    onAddress(next.domein?.activeAt ? `https://${next.domein.host}` : null);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  if (!state) return error ? <p role="alert" className="text-sm text-crit">{error}</p> : <p className="text-sm text-neutralx-500">Laden…</p>;
  const d = state.domein;
  const c = d?.check ?? null;

  if (!d) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-neutralx-600">Gebruik je eigen domeinnaam, zoals bakkerjansen.nl. Je website blijft bij ZekerFlex staan; je zet alleen een paar regels bij je domeinprovider.</p>
        {canPublish ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act("koppel");
            }}
          >
            <Field label="Je domeinnaam">
              <input className="field-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="bakkerjansen.nl" autoComplete="off" spellCheck={false} />
            </Field>
            <button type="submit" disabled={busy !== null || !input.trim()} className="btn-primary w-full disabled:opacity-50">{busy === "koppel" ? "Bezig…" : "Koppelen"}</button>
          </form>
        ) : (
          <p className="rounded-lg bg-paper-soft p-3 text-neutralx-600">
            Een eigen domein hoort bij Website-beheer. <Link href="/werkgever/website" className="font-semibold text-brand-600 hover:underline">Bekijk Website-beheer</Link>
          </p>
        )}
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
        <details className="rounded-lg border border-hair p-3">
          <summary className="cursor-pointer font-semibold text-ink">Nog geen domeinnaam? Zoek en bestel er één</summary>
          <div className="mt-3">
            <DomeinZoeker terugNaar="/werkgever/website/bouwer" smal />
          </div>
        </details>
      </div>
    );
  }

  const items: { label: string; ok: boolean | null }[] = [
    { label: "Het domein is van jou (TXT-regel)", ok: d.verifiedAt ? true : c ? c.txt : null },
    { label: `${d.host} wijst naar ZekerFlex`, ok: c ? c.a : null },
    { label: "Geen oude IPv6-regel naar een ander adres", ok: c ? c.aaaa : null },
    ...(d.alias ? [{ label: `${d.alias} doet mee`, ok: c ? c.alias : null }] : []),
    { label: "Beveiligde verbinding (https)", ok: c ? c.https : null },
  ];

  return (
    <div className="space-y-4 text-sm">
      {d.activeAt ? (
        <p role="status" className="rounded-lg bg-ok/10 p-3 text-ok">
          Je website staat op{" "}
          <a href={`https://${d.host}`} target="_blank" rel="noopener" className="font-semibold underline">{d.host}</a>.
        </p>
      ) : (
        <p className="text-neutralx-600">
          Zet deze regels bij je domeinprovider voor <strong className="text-ink">{d.host}</strong>. Laat de MX-regels voor je e-mail staan zoals ze zijn.
        </p>
      )}

      <ul className="space-y-2">
        {state.records.map((r) => (
          <li key={`${r.type}${r.name}`} className="rounded-lg border border-hair p-2.5">
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">{r.type} · naam {r.short}</span>
              <button type="button" onClick={() => void copy(r.value)} className="font-semibold text-brand-600 hover:underline">{copied === r.value ? "Gekopieerd" : "Kopieer waarde"}</button>
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink">{r.value}</p>
            <p className="mt-1 text-xs text-neutralx-500">{r.why}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <button type="button" disabled={busy !== null} onClick={() => void act("controleer")} className="btn-primary w-full disabled:opacity-50">
          {busy === "controleer" ? "Controleren… (kan een halve minuut duren)" : "Controleer"}
        </button>
        <ul className="space-y-1" aria-label="Stand van je domein">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2 text-xs">
              <span aria-hidden className={i.ok === null ? "text-neutralx-400" : i.ok ? "text-ok" : "text-crit"}>{i.ok === null ? "–" : i.ok ? "✓" : "✗"}</span>
              <span className="text-neutralx-700">
                {i.label}
                <span className="sr-only">{i.ok === null ? ": nog niet gecontroleerd" : i.ok ? ": in orde" : ": nog niet in orde"}</span>
              </span>
            </li>
          ))}
        </ul>
        {c?.problem && <p role="status" className="rounded-lg bg-paper-soft p-3 text-xs text-neutralx-700">{c.problem}</p>}
        {c && <p className="text-[11px] text-neutralx-400">Laatst gecontroleerd {when(c.at)}</p>}
      </div>

      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      <button type="button" disabled={busy !== null} onClick={() => void act("ontkoppel")} className="text-xs font-semibold text-crit hover:underline disabled:opacity-50">Domein loskoppelen</button>
    </div>
  );
}

// ---- one block's fields --------------------------------------------------------

function PhotoPicker({ value, site, onPick, onMedia }: { value: string | null; site: SiteDoc; onPick: (id: string | null) => void; onMedia: (m: Media) => void }) {
  const mediaUrl = useMediaUrl();
  return (
    <div className="space-y-2">
      <span className="field-label">Foto</span>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" onClick={() => onPick(null)} aria-pressed={value === null} className={`aspect-square rounded-lg border text-[10px] text-neutralx-500 ${value === null ? "border-brand-600 ring-2 ring-brand-100" : "border-hair"}`}>Geen</button>
        {site.media.map((m) => (
          <button key={m.id} type="button" onClick={() => onPick(m.id)} aria-pressed={value === m.id} aria-label={m.alt || "Foto"} className={`overflow-hidden rounded-lg border ${value === m.id ? "border-brand-600 ring-2 ring-brand-100" : "border-hair"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(m.file)} alt="" className="aspect-square w-full object-cover" />
          </button>
        ))}
      </div>
      <AddPhoto onMedia={onMedia} onAdded={(m) => onPick(m.id)} />
    </div>
  );
}

function LinkField({ value, onChange, site }: { value: string; onChange: (v: string) => void; site: SiteDoc }) {
  // met producten kan een knop ook naar de winkel of het bestelformulier (lib/sites/winkel-render.ts)
  const winkel = site.winkel?.producten.some((p) => p.zichtbaar) ? [{ value: "winkel", label: "Winkel (alle producten)" }, ...(site.winkel.bestellen ? [{ value: "bestellen", label: "Bestellen" }] : [])] : [];
  const pageValues = [...site.pages.map((p) => p.slug || "home"), ...winkel.map((w) => w.value)];
  const custom = !pageValues.includes(value) && value !== "";
  return (
    <Field label="Knop gaat naar">
      <select className="field-input" value={custom ? "__eigen" : value} onChange={(e) => onChange(e.target.value === "__eigen" ? "https://" : e.target.value)}>
        {site.pages.map((p) => (
          <option key={p.id} value={p.slug || "home"}>Pagina: {p.titel}</option>
        ))}
        {winkel.map((w) => (
          <option key={w.value} value={w.value}>{w.label}</option>
        ))}
        <option value="__eigen">Een ander adres (https://, tel: of mailto:)</option>
      </select>
      {custom && <input className="field-input" value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function ItemsEditor<T extends Record<string, string | number | null | undefined>>({
  items,
  fields,
  blank,
  max,
  onChange,
  extra,
}: {
  items: T[];
  fields: { key: keyof T; label: string; area?: boolean; stars?: boolean }[];
  blank: T;
  max: number;
  onChange: (items: T[]) => void;
  /** more fields per item, e.g. a photo picker on a diensten card */
  extra?: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-hair p-2.5">
          {fields.map((f) =>
            f.stars ? (
              <Field key={String(f.key)} label={f.label}>
                <select className="field-input" value={Number(it[f.key])} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: Number(e.target.value) } : x)))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{"★".repeat(n)}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field key={String(f.key)} label={f.label}>
                {f.area ? (
                  <textarea className="field-input" rows={3} value={String(it[f.key] ?? "")} maxLength={4000} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
                ) : (
                  <input className="field-input" value={String(it[f.key] ?? "")} maxLength={200} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
                )}
              </Field>
            ),
          )}
          {extra?.(it, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-xs font-semibold text-crit hover:underline">Verwijderen</button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, { ...blank }])} className="btn-ghost w-full text-sm">+ Toevoegen</button>
      )}
    </div>
  );
}

function BlockEditor({ block, site, onChange, onClose, onMedia }: { block: Block; site: SiteDoc; onChange: (b: Block) => void; onClose: () => void; onMedia: (m: Media) => void }) {
  const mediaUrl = useMediaUrl();
  const kop = (
    <Field label="Kop">
      <input className="field-input" value={(block.props as { kop: string }).kop} maxLength={160} onChange={(e) => onChange({ ...block, props: { ...block.props, kop: e.target.value } } as Block)} />
    </Field>
  );
  const tekst = (value: string, set: (v: string) => void, label = "Tekst") => (
    <Field label={label}>
      <textarea className="field-input" rows={6} value={value} maxLength={4000} onChange={(e) => set(e.target.value)} />
    </Field>
  );
  let fields: ReactNode = null;
  switch (block.type) {
    case "hero":
    case "cta": {
      const p = block.props;
      const set = (patch: Partial<typeof p>) => onChange({ ...block, props: { ...p, ...patch } } as Block);
      fields = (
        <>
          {kop}
          {tekst(p.tekst, (v) => set({ tekst: v }))}
          <Field label="Tekst op de knop (leeg = geen knop)"><input className="field-input" value={p.knop} maxLength={200} onChange={(e) => set({ knop: e.target.value })} /></Field>
          <LinkField value={p.knopLink} site={site} onChange={(v) => set({ knopLink: v })} />
          {block.type === "hero" && <PhotoPicker value={block.props.foto} site={site} onMedia={onMedia} onPick={(foto) => onChange({ ...block, props: { ...block.props, foto } })} />}
        </>
      );
      break;
    }
    case "tekst":
      fields = (
        <>
          {kop}
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }))}
        </>
      );
      break;
    case "tekstFoto":
      fields = (
        <>
          {kop}
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }))}
          <label className="flex items-center gap-2 text-sm text-neutralx-700">
            <input type="checkbox" checked={block.props.fotoLinks} onChange={(e) => onChange({ ...block, props: { ...block.props, fotoLinks: e.target.checked } })} className="h-4 w-4 accent-brand-600" />
            Foto links van de tekst
          </label>
          <PhotoPicker value={block.props.foto} site={site} onMedia={onMedia} onPick={(foto) => onChange({ ...block, props: { ...block.props, foto } })} />
        </>
      );
      break;
    case "diensten":
      fields = (
        <>
          {kop}
          <ItemsEditor<{ titel: string; tekst: string; foto?: string | null | undefined }>
            items={block.props.items}
            max={12}
            blank={{ titel: "Nieuwe dienst", tekst: "Korte uitleg.", foto: null }}
            fields={[{ key: "titel", label: "Titel" }, { key: "tekst", label: "Uitleg", area: true }]}
            extra={(it, set) => <PhotoPicker value={it.foto ?? null} site={site} onMedia={onMedia} onPick={(foto) => set({ foto })} />}
            onChange={(items) => onChange({ ...block, props: { ...block.props, items } })}
          />
          <p className="text-xs text-neutralx-500">Met een foto wordt een dienst een aanbodkaart met de foto bovenaan.</p>
        </>
      );
      break;
    case "stappen":
      fields = (
        <>
          {kop}
          <ItemsEditor items={block.props.items} max={8} blank={{ titel: "Nieuwe stap", tekst: "Korte uitleg." }} fields={[{ key: "titel", label: "Stap" }, { key: "tekst", label: "Uitleg", area: true }]} onChange={(items) => onChange({ ...block, props: { ...block.props, items } })} />
          <p className="text-xs text-neutralx-500">De stappen worden op de website vanzelf genummerd, in deze volgorde.</p>
        </>
      );
      break;
    case "usps":
      fields = (
        <>
          {kop}
          <ItemsEditor items={block.props.items} max={8} blank={{ titel: "Nieuw voordeel", tekst: "Korte uitleg." }} fields={[{ key: "titel", label: "Voordeel" }, { key: "tekst", label: "Uitleg", area: true }]} onChange={(items) => onChange({ ...block, props: { ...block.props, items } })} />
        </>
      );
      break;
    case "galerij":
      fields = (
        <>
          {kop}
          <div className="space-y-2">
            <span className="field-label">Foto&apos;s in de galerij</span>
            <div className="grid grid-cols-4 gap-1.5">
              {site.media.map((m) => {
                const on = block.props.fotos.includes(m.id);
                return (
                  <button key={m.id} type="button" aria-pressed={on} aria-label={m.alt || "Foto"} onClick={() => onChange({ ...block, props: { ...block.props, fotos: on ? block.props.fotos.filter((f) => f !== m.id) : [...block.props.fotos, m.id].slice(0, 24) } })} className={`overflow-hidden rounded-lg border ${on ? "border-brand-600 ring-2 ring-brand-100" : "border-hair opacity-70"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(m.file)} alt="" className="aspect-square w-full object-cover" />
                  </button>
                );
              })}
            </div>
            <AddPhoto onMedia={onMedia} onAdded={(m) => onChange({ ...block, props: { ...block.props, fotos: [...block.props.fotos, m.id].slice(0, 24) } })} />
          </div>
        </>
      );
      break;
    case "reviews":
      fields = (
        <>
          {kop}
          <ItemsEditor items={block.props.items} max={12} blank={{ naam: "Naam", tekst: "Wat zei de klant?", sterren: 5 }} fields={[{ key: "naam", label: "Naam" }, { key: "tekst", label: "Review", area: true }, { key: "sterren", label: "Sterren", stars: true }]} onChange={(items) => onChange({ ...block, props: { ...block.props, items } })} />
          <p className="text-xs text-neutralx-500">Zet hier alleen echte reviews, met toestemming van de klant.</p>
        </>
      );
      break;
    case "faq":
      fields = (
        <>
          {kop}
          <ItemsEditor items={block.props.items} max={20} blank={{ vraag: "Nieuwe vraag?", antwoord: "Het antwoord." }} fields={[{ key: "vraag", label: "Vraag" }, { key: "antwoord", label: "Antwoord", area: true }]} onChange={(items) => onChange({ ...block, props: { ...block.props, items } })} />
        </>
      );
      break;
    case "openingstijden":
      fields = (
        <>
          {kop}
          <ItemsEditor items={block.props.regels} max={10} blank={{ dag: "Dag", tijd: "09:00 – 17:00" }} fields={[{ key: "dag", label: "Dag(en)" }, { key: "tijd", label: "Tijden" }]} onChange={(regels) => onChange({ ...block, props: { ...block.props, regels } })} />
        </>
      );
      break;
    case "contact":
      fields = (
        <>
          {kop}
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }))}
          <label className="flex items-center gap-2 text-sm text-neutralx-700">
            <input type="checkbox" checked={block.props.formulier} onChange={(e) => onChange({ ...block, props: { ...block.props, formulier: e.target.checked } })} className="h-4 w-4 accent-brand-600" />
            Contactformulier tonen
          </label>
          <p className="text-xs text-neutralx-500">Berichten komen binnen bij Berichten en op het e-mailadres onder Bedrijf. Adres en telefoon komen ook van Bedrijf.</p>
        </>
      );
      break;
    case "vacatures":
      fields = (
        <>
          {kop}
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }))}
          <Field label="Hoeveel diensten tonen (1 tot 12)">
            <input
              className="field-input"
              type="number"
              min={1}
              max={12}
              value={block.props.aantal}
              onChange={(e) => onChange({ ...block, props: { ...block.props, aantal: Math.max(1, Math.min(12, Math.round(Number(e.target.value)) || 1)) } })}
            />
          </Field>
          <p className="text-xs text-neutralx-500">Op je website staan hier vanzelf je open diensten op ZekerFlex, met een knop om te reageren. In dit voorbeeld zie je twee voorbeelddiensten.</p>
        </>
      );
      break;
    case "producten": {
      const cats = categorieen(site.winkel?.producten ?? []);
      fields = (
        <>
          {kop}
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }), "Tekst onder de kop (mag leeg)")}
          <Field label="Welke producten">
            <select className="field-input" value={block.props.categorie} onChange={(e) => onChange({ ...block, props: { ...block.props, categorie: e.target.value } })}>
              <option value="">Alle producten</option>
              {cats.map((c) => (
                <option key={c} value={c}>Categorie: {c}</option>
              ))}
            </select>
          </Field>
          <Field label="Hoeveel tonen (1 tot 48)">
            <input className="field-input" type="number" min={1} max={48} value={block.props.aantal} onChange={(e) => onChange({ ...block, props: { ...block.props, aantal: Math.max(1, Math.min(48, Math.round(Number(e.target.value)) || 1)) } })} />
          </Field>
          <p className="text-xs text-neutralx-500">De producten zelf beheer je in het tabblad Winkel. Zijn er meer dan je toont, dan komt er een knop naar de hele winkel.</p>
        </>
      );
      break;
    }
    case "uitgelicht": {
      const producten = site.winkel?.producten ?? [];
      fields = (
        <>
          <Field label="Welk product">
            <select className="field-input" value={block.props.productId} onChange={(e) => onChange({ ...block, props: { ...block.props, productId: e.target.value } })}>
              <option value="">Kies een product</option>
              {producten.map((p) => (
                <option key={p.id} value={p.id}>{p.naam}</option>
              ))}
            </select>
          </Field>
          <Field label="Klein label boven de naam (mag leeg)">
            <input className="field-input" value={block.props.kop} maxLength={160} onChange={(e) => onChange({ ...block, props: { ...block.props, kop: e.target.value } })} />
          </Field>
          {tekst(block.props.tekst, (v) => onChange({ ...block, props: { ...block.props, tekst: v } }), "Tekst (leeg = de korte zin van het product)")}
          <label className="flex items-center gap-2 text-sm text-neutralx-700">
            <input type="checkbox" checked={block.props.fotoLinks} onChange={(e) => onChange({ ...block, props: { ...block.props, fotoLinks: e.target.checked } })} className="h-4 w-4 accent-brand-600" />
            Foto links van de tekst
          </label>
          {producten.length === 0 && <p className="text-xs text-neutralx-500">Voeg eerst een product toe in het tabblad Winkel.</p>}
        </>
      );
      break;
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">{BLOCK_LABELS[block.type]}</p>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-neutralx-500 hover:text-ink">Sluiten</button>
      </div>
      {fields}
    </div>
  );
}
