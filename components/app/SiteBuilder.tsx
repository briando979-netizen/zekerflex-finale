"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { blockSummary, renderPage } from "@/lib/sites/render";
import { BLOCK_LABELS, isHexColor, newBlock, pageSlug, type Block, type BlockType, type Company, type Media, type Page, type SiteDoc, type Theme } from "@/lib/sites/types";

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

const RESERVED = ["privacy", "bedankt", "media", "assets", "_zf", "sitemap", "robots"];
const nid = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;
const mediaUrl = (file: string) => `/api/werkgever/sites/media/${file}`;
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

export function SiteBuilder({ origin }: { origin: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/werkgever/sites", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError(await errorText(res, "De websitebouwer kon niet laden."));
    setData((await res.json()) as Data);
  }, []);
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

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/werkgever/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, bedrijf }) }).catch(() => null);
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

type Tab = "paginas" | "blokken" | "stijl" | "bedrijf" | "fotos" | "berichten";
const TABS: { id: Tab; label: string }[] = [
  { id: "blokken", label: "Blokken" },
  { id: "paginas", label: "Pagina's" },
  { id: "stijl", label: "Stijl" },
  { id: "bedrijf", label: "Bedrijf" },
  { id: "fotos", label: "Foto's" },
  { id: "berichten", label: "Berichten" },
];
const DEVICES = [
  { id: "computer", label: "Computer", width: "100%" },
  { id: "tablet", label: "Tablet", width: "820px" },
  { id: "telefoon", label: "Telefoon", width: "390px" },
] as const;

function Editor({ data, site: initial, origin, onSite }: { data: Data; site: SiteDoc; origin: string; onSite: (s: SiteDoc) => void }) {
  const [site, setSite] = useState<SiteDoc>(initial);
  const [pageId, setPageId] = useState(initial.pages[0]?.id ?? "");
  const [blockId, setBlockId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("blokken");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("computer");
  const [save, setSave] = useState<{ state: "opgeslagen" | "wijzigingen" | "bezig" | "fout"; text?: string }>({ state: "opgeslagen" });
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

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
      const res = await fetch("/api/werkgever/sites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: site.theme, bedrijf: site.bedrijf, pages: site.pages, altTexts: Object.fromEntries(site.media.map((m) => [m.id, m.alt])) }),
      }).catch(() => null);
      if (!res?.ok) return setSave({ state: "fout", text: await errorText(res, "Opslaan lukte niet.") });
      setSave({ state: "opgeslagen" });
    }, 1200);
    return () => clearTimeout(timer);
  }, [site]);

  const updatePage = (fn: (p: Page) => Page) => change((s) => ({ ...s, pages: s.pages.map((p) => (p.id === page.id ? fn(p) : p)) }));
  const updateBlock = (id: string, fn: (b: Block) => Block) => updatePage((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === id ? fn(b) : b)) }));

  const html = useMemo(() => renderPage(site, page, { root: "/", origin, preview: { mediaUrl } }), [site, page, origin]);

  const publish = async (action: "publiceer" | "terug" | "offline", buildId?: string) => {
    if (action === "offline" && !window.confirm("De website offline halen? Bezoekers zien dan een melding dat hij niet bestaat. Je kunt hem later weer publiceren.")) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/werkgever/sites/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(buildId ? { buildId } : {}) }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setNotice({ ok: false, text: await errorText(res, "Dat lukte niet.") });
    const next = (await res.json()).site as SiteDoc;
    setSite((s) => ({ ...s, liveBuild: next.liveBuild, builds: next.builds }));
    onSite(next);
    setNotice({ ok: true, text: action === "publiceer" ? "Je website staat online." : action === "terug" ? "De gekozen versie staat weer online." : "Je website staat offline." });
  };

  const live = Boolean(site.liveBuild);
  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Website bouwen</p>
          <h1 className="truncate font-display text-xl font-bold text-ink">{site.bedrijf.naam}</h1>
          <p className="truncate text-xs text-neutralx-500">
            {live && data.address ? (
              <a href={data.address} target="_blank" rel="noopener" className="font-medium text-brand-600 hover:underline">{data.address}</a>
            ) : (
              <>Nog niet online · adres straks {data.address}</>
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
        <aside className="card min-w-0 p-3">
          <div className="flex flex-wrap gap-1 border-b border-hair pb-2" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pt-3">
            {tab === "blokken" && <BlocksTab page={page} selected={blockId} onSelect={setBlockId} updatePage={updatePage} />}
            {tab === "paginas" && <PagesTab site={site} current={page.id} onSelect={(id) => { setPageId(id); setBlockId(null); }} change={change} />}
            {tab === "stijl" && <StyleTab theme={site.theme} presets={data.presets} onTheme={(theme) => change((s) => ({ ...s, theme }))} />}
            {tab === "bedrijf" && <CompanyTab bedrijf={site.bedrijf} onChange={(bedrijf) => change((s) => ({ ...s, bedrijf }))} />}
            {tab === "fotos" && <PhotosTab site={site} onMedia={(media) => setSite((s) => ({ ...s, media: [...s.media, media] }))} onAlt={(id, alt) => change((s) => ({ ...s, media: s.media.map((m) => (m.id === id ? { ...m, alt } : m)) }))} />}
            {tab === "berichten" && <MessagesTab />}
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
              {live && (
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
          <div className="flex justify-center bg-paper-soft p-3">
            <iframe
              title={`Voorbeeld van ${page.titel}`}
              srcDoc={html}
              sandbox="allow-same-origin"
              className="h-[720px] max-w-full rounded-lg border border-hair bg-white shadow-card"
              style={{ width: DEVICES.find((d) => d.id === device)!.width }}
            />
          </div>
        </section>

        <aside className="card min-w-0 p-4">
          {block ? (
            <BlockEditor key={block.id} block={block} site={site} onChange={(b) => updateBlock(block.id, () => b)} onClose={() => setBlockId(null)} onMedia={(media) => setSite((s) => ({ ...s, media: [...s.media, media] }))} />
          ) : (
            <div className="space-y-2 text-sm text-neutralx-600">
              <p className="font-semibold text-ink">Kies een blok om te bewerken</p>
              <p>Klik links op een blok. Je ziet je wijziging meteen in het voorbeeld; bezoekers zien hem na Publiceren.</p>
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
  const move = (i: number, d: -1 | 1) =>
    updatePage((p) => {
      const blocks = [...p.blocks];
      const j = i + d;
      if (j < 0 || j >= blocks.length) return p;
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
      return { ...p, blocks };
    });
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Pagina: {page.titel}</p>
      <ol className="space-y-1.5">
        {page.blocks.map((b, i) => (
          <li key={b.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${selected === b.id ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
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

function StyleTab({ theme, presets, onTheme }: { theme: Theme; presets: Data["presets"]; onTheme: (t: Theme) => void }) {
  return (
    <div className="space-y-4 text-sm">
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

function CompanyTab({ bedrijf, onChange }: { bedrijf: Company; onChange: (c: Company) => void }) {
  const set = (k: keyof Company) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...bedrijf, [k]: e.target.value });
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
    </div>
  );
}

function usePhotoAdd(onMedia: (m: Media) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (init: RequestInit, failed: string): Promise<Media | null> => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/werkgever/sites/media", { method: "POST", ...init }).catch(() => null);
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

// ---- one block's fields --------------------------------------------------------

function PhotoPicker({ value, site, onPick, onMedia }: { value: string | null; site: SiteDoc; onPick: (id: string | null) => void; onMedia: (m: Media) => void }) {
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
  const pageValues = site.pages.map((p) => p.slug || "home");
  const custom = !pageValues.includes(value) && value !== "";
  return (
    <Field label="Knop gaat naar">
      <select className="field-input" value={custom ? "__eigen" : value} onChange={(e) => onChange(e.target.value === "__eigen" ? "https://" : e.target.value)}>
        {site.pages.map((p) => (
          <option key={p.id} value={p.slug || "home"}>Pagina: {p.titel}</option>
        ))}
        <option value="__eigen">Een ander adres (https://, tel: of mailto:)</option>
      </select>
      {custom && <input className="field-input" value={value} maxLength={300} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function ItemsEditor<T extends Record<string, string | number>>({ items, fields, blank, max, onChange }: { items: T[]; fields: { key: keyof T; label: string; area?: boolean; stars?: boolean }[]; blank: T; max: number; onChange: (items: T[]) => void }) {
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
                  <textarea className="field-input" rows={3} value={String(it[f.key])} maxLength={4000} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
                ) : (
                  <input className="field-input" value={String(it[f.key])} maxLength={200} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
                )}
              </Field>
            ),
          )}
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
          <ItemsEditor items={block.props.items} max={12} blank={{ titel: "Nieuwe dienst", tekst: "Korte uitleg." }} fields={[{ key: "titel", label: "Titel" }, { key: "tekst", label: "Uitleg", area: true }]} onChange={(items) => onChange({ ...block, props: { ...block.props, items } })} />
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
