"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";
import { ConsoleTerminal } from "@/components/admin/ConsoleTerminal";
import { APP_PAGES, APP_PAGE_COUNT, type AppPage } from "@/lib/dev/app-pages.generated";

// ---------------------------------------------------------------------------
// ZekerFlex AI studio — a VS-Code-style workbench on /admin/zekerflex-ai.
//   · Activity bar  : ZekerFlex AI (chat) · Pagina's · Zoeken · Sandbox · Terminal
//   · ZekerFlex AI  : the existing assistant console, embedded (own rail)
//   · Pagina's      : every real route of the app, grouped + searchable; a click
//                     opens it LIVE in the browser pane
//   · Browser       : an address-bar iframe — internal pages render inline;
//                     external sites (Google …) that refuse embedding get a
//                     one-click "open in nieuw tabblad" fallback
//   · Sandbox       : a live HTML/CSS/JS playground rendered in an isolated
//                     sandbox iframe (/admin/zekerflex-ai/sandbox-frame)
//   · Terminal      : the safe in-app console (read-only command set)
// All panes stay mounted and toggle with `hidden`, so a running chat turn or a
// loaded page survives tab switches.
// ---------------------------------------------------------------------------

type Tab = "ai" | "browser" | "sandbox";
type PanelMode = "explorer" | "search";

const AREA_ORDER = ["Admin", "Marketing", "Werkgever", "Freelancer", "Webshop", "Account & overig"];

const SANDBOX_TEMPLATES: { id: string; label: string; code: string }[] = [
  {
    id: "welkom",
    label: "Welkom (HTML + CSS)",
    code: `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body { margin:0; font-family: system-ui, sans-serif; display:grid; place-items:center;
           min-height:100vh; background:#0b0e13; color:#e8edf5; }
    .card { padding:2.5rem 3rem; border-radius:20px; text-align:center;
            background:linear-gradient(145deg,#141a24,#0e1420);
            box-shadow:0 20px 60px rgba(0,0,0,.45); }
    h1 { margin:0 0 .4rem; font-size:1.9rem; }
    .mint { color:#4fe0a0; }
    button { margin-top:1.2rem; padding:.7rem 1.4rem; border:0; border-radius:12px;
             background:#4fe0a0; color:#06281b; font-weight:700; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hallo vanuit de <span class="mint">ZekerFlex</span> sandbox</h1>
    <p>Pas de HTML/CSS/JS links aan en klik op <b>Uitvoeren</b>.</p>
    <button onclick="this.textContent='Werkt! ' + new Date().toLocaleTimeString('nl-NL')">
      Klik mij
    </button>
  </div>
</body>
</html>`,
  },
  {
    id: "teller",
    label: "JavaScript-teller",
    code: `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" />
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font-family:system-ui,sans-serif;background:#0b0e13;color:#e8edf5}
  .n{font-size:5rem;font-weight:800;color:#4fe0a0;font-variant-numeric:tabular-nums}
  .row{display:flex;gap:.6rem;justify-content:center}
  button{width:3rem;height:3rem;font-size:1.4rem;border:0;border-radius:12px;
         background:#1b2432;color:#e8edf5;cursor:pointer}
</style></head>
<body>
  <div style="text-align:center">
    <div class="n" id="n">0</div>
    <div class="row">
      <button onclick="set(-1)">−</button>
      <button onclick="set(1)">+</button>
    </div>
  </div>
  <script>
    let n = 0;
    const el = document.getElementById('n');
    function set(d){ n += d; el.textContent = n; }
  </script>
</body></html>`,
  },
  {
    id: "canvas",
    label: "Canvas-animatie",
    code: `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" />
<style>html,body{margin:0;height:100%;background:#0b0e13;overflow:hidden}</style></head>
<body>
  <canvas id="c"></canvas>
  <script>
    const c = document.getElementById('c'), x = c.getContext('2d');
    function fit(){ c.width = innerWidth; c.height = innerHeight; }
    fit(); addEventListener('resize', fit);
    let t = 0;
    (function loop(){
      x.fillStyle = 'rgba(11,14,19,.18)'; x.fillRect(0,0,c.width,c.height);
      for(let i=0;i<60;i++){
        const a = t/40 + i*0.4;
        const r = 80 + i*4;
        x.fillStyle = 'hsl(' + ((i*6+t) % 360) + ',80%,60%)';
        x.beginPath();
        x.arc(c.width/2 + Math.cos(a)*r, c.height/2 + Math.sin(a*1.3)*r, 4, 0, 7);
        x.fill();
      }
      t++; requestAnimationFrame(loop);
    })();
  </script>
</body></html>`,
  },
  { id: "leeg", label: "Leeg", code: "<!doctype html>\n<html>\n<body>\n  \n</body>\n</html>" },
];

interface Brain {
  ok: boolean;
  model: string;
  cloud: boolean;
}

export function ZekerFlexAIStudio({
  heightClass = "h-[calc(100dvh-10.5rem)]",
}: {
  heightClass?: string;
} = {}) {
  const [tab, setTab] = useState<Tab>("ai");
  const [panelMode, setPanelMode] = useState<PanelMode>("explorer");
  const [query, setQuery] = useState("");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [brain, setBrain] = useState<Brain | null>(null);
  const [clock, setClock] = useState("");

  // browser pane
  const [address, setAddress] = useState("/admin");
  const [browserUrl, setBrowserUrl] = useState("/admin");
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }));
    t();
    const id = setInterval(t, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/jarvis/brain", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { ok: boolean; model: string; cloud: boolean };
        if (alive) setBrain({ ok: d.ok, model: d.model, cloud: d.cloud });
      } catch {
        /* status is cosmetic */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const by: Record<string, AppPage[]> = {};
    for (const p of APP_PAGES) (by[p.area] ??= []).push(p);
    const names = Object.keys(by).sort((a, b) => {
      const ia = AREA_ORDER.indexOf(a);
      const ib = AREA_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return names.map((name) => ({ name, pages: by[name] ?? [] }));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as AppPage[];
    return APP_PAGES.filter((p) => p.route.toLowerCase().includes(q) || p.file.toLowerCase().includes(q)).slice(0, 80);
  }, [query]);

  const openPage = useCallback((route: string) => {
    // A dynamic segment can't be fetched as-is; show a sensible concrete value.
    const url = route.replace(/\[([^\]]+)\]/g, "voorbeeld");
    setAddress(url);
    setBrowserUrl(url);
    setReloadNonce((n) => n + 1);
    setTab("browser");
  }, []);

  const go = useCallback((raw: string) => {
    const v = raw.trim();
    if (!v) return;
    let url: string;
    if (v.startsWith("/")) url = v;
    else if (/^https?:\/\//i.test(v)) url = v;
    else if (/^[\w-]+(\.[\w-]+)+/.test(v)) url = `https://${v}`;
    else url = `/${v}`;
    setAddress(url);
    setBrowserUrl(url);
    setReloadNonce((n) => n + 1);
  }, []);

  const isExternal = /^https?:\/\//i.test(browserUrl);

  return (
    <div className={`flex ${heightClass} min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e13] text-white shadow-2xl`}>
      {/* ---- title bar ---- */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/10 bg-[#0e1116] px-3 py-2">
        <span className="h-3 w-3 rounded-full bg-[#ef4444]" />
        <span className="h-3 w-3 rounded-full bg-[#eab308]" />
        <span className="h-3 w-3 rounded-full bg-[#22c55e]" />
        <span className="ml-2 font-display text-sm font-bold tracking-[0.14em]">ZEKERFLEX AI</span>
        <span className="hidden text-[11px] text-white/35 sm:inline">· studio</span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
              brain?.cloud
                ? "bg-[rgba(124,197,255,0.12)] text-[#7CC5FF]"
                : "bg-[rgba(79,224,160,0.12)] text-brand-mint"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${brain?.ok ? "bg-current" : "bg-[#F07C6B]"}`} />
            {brain ? (brain.cloud ? "cloud-brein" : "lokaal brein · €0") : "brein laden…"}
          </span>
          <button
            type="button"
            onClick={() => setTerminalOpen((o) => !o)}
            aria-pressed={terminalOpen}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              terminalOpen
                ? "border-brand-mint/50 bg-[rgba(79,224,160,0.14)] text-brand-mint"
                : "border-white/15 text-white/60 hover:bg-white/10"
            }`}
          >
            Terminal
          </button>
        </div>
      </div>

      {/* ---- editor tab strip ---- */}
      <div className="flex flex-shrink-0 items-stretch border-b border-white/10 bg-[#0b0e13] text-xs">
        {([
          ["ai", "ZekerFlex AI"],
          ["browser", "Pagina's"],
          ["sandbox", "Sandbox"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-r border-white/10 px-4 py-2.5 transition ${
              tab === id ? "bg-[#141a24] text-white" : "text-white/50 hover:bg-white/5"
            }`}
            style={tab === id ? { boxShadow: "inset 0 2px 0 var(--tw-brand-mint, #4fe0a0)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- body: activity bar + side panel + editor ---- */}
      <div className="flex min-h-0 flex-1">
        {/* activity bar */}
        <nav className="flex w-[52px] flex-shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#0e1116] py-2">
          <ActivityButton label="ZekerFlex AI" active={tab === "ai"} onClick={() => setTab("ai")}>
            <IChatIcon />
          </ActivityButton>
          <ActivityButton
            label="Pagina's"
            active={tab === "browser" && panelMode === "explorer"}
            onClick={() => {
              setTab("browser");
              setPanelMode("explorer");
            }}
          >
            <IFilesIcon />
          </ActivityButton>
          <ActivityButton
            label="Zoeken"
            active={tab === "browser" && panelMode === "search"}
            onClick={() => {
              setTab("browser");
              setPanelMode("search");
            }}
          >
            <ISearchIcon />
          </ActivityButton>
          <ActivityButton label="Sandbox" active={tab === "sandbox"} onClick={() => setTab("sandbox")}>
            <IBeakerIcon />
          </ActivityButton>
          <div className="mt-auto" />
          <ActivityButton label="Terminal" active={terminalOpen} onClick={() => setTerminalOpen((o) => !o)}>
            <ITerminalIcon />
          </ActivityButton>
        </nav>

        {/* side panel — pages/search (browser) or sandbox templates */}
        {tab === "browser" && (
          <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/10 bg-[#0c0f15] md:flex">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
              <span>{panelMode === "search" ? "Zoeken" : "Pagina's"}</span>
              <span className="font-mono text-white/25">{APP_PAGE_COUNT}</span>
            </div>
            {panelMode === "search" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="p-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Zoek een pagina…"
                    className="w-full rounded-md border border-white/15 bg-[#0b0e13] px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-brand-mint focus:outline-none"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  {query.trim() === "" ? (
                    <p className="px-1 py-2 text-[11px] text-white/30">Typ om tussen {APP_PAGE_COUNT} pagina&apos;s te zoeken.</p>
                  ) : matches.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-white/30">Niets gevonden.</p>
                  ) : (
                    matches.map((p) => <PageRow key={p.route} page={p} onOpen={openPage} active={browserUrl === p.route} />)
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {groups.map((g) => (
                  <details key={g.name} open={g.name === "Admin"} className="mb-0.5">
                    <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/5 [&::-webkit-details-marker]:hidden">
                      <span className="text-white/30">▸</span>
                      {g.name}
                      <span className="ml-auto font-mono text-[10px] text-white/25">{g.pages.length}</span>
                    </summary>
                    <div className="pb-1 pl-2">
                      {g.pages.map((p) => (
                        <PageRow key={p.route} page={p} onOpen={openPage} active={browserUrl === p.route} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </aside>
        )}

        {tab === "sandbox" && (
          <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-white/10 bg-[#0c0f15] lg:flex">
            <div className="border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
              Sandbox
            </div>
            <div className="space-y-3 p-3 text-[11px] leading-relaxed text-white/50">
              <p>
                Een geïsoleerde speeltuin: je HTML/CSS/JS draait in een afgeschermde iframe (eigen oorsprong, geen
                toegang tot ZekerFlex of je gegevens).
              </p>
              <p>Kies links een sjabloon, pas de code aan en klik op <b className="text-white/80">Uitvoeren</b>.</p>
            </div>
          </aside>
        )}

        {/* editor + optional terminal */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* AI pane keeps its own session rail */}
            <div className={tab === "ai" ? "flex min-h-0 flex-1" : "hidden"}>
              <JarvisConsole embedded />
            </div>
            <div className={tab === "browser" ? "flex min-h-0 flex-1" : "hidden"}>
              <BrowserPane
                address={address}
                setAddress={setAddress}
                browserUrl={browserUrl}
                isExternal={isExternal}
                reloadNonce={reloadNonce}
                onGo={go}
                onReload={() => setReloadNonce((n) => n + 1)}
              />
            </div>
            <div className={tab === "sandbox" ? "flex min-h-0 flex-1" : "hidden"}>
              <SandboxPane />
            </div>
          </div>

          {terminalOpen && (
            <div className="flex-shrink-0 border-t border-white/10 bg-[#0b0e13]">
              <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/35">
                <span>Terminal · veilig (read-only)</span>
                <button type="button" onClick={() => setTerminalOpen(false)} className="text-white/40 hover:text-white/70">
                  sluiten ✕
                </button>
              </div>
              <div className="px-2 pb-2">
                <ConsoleTerminal />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ---- status bar ---- */}
      <div className="flex flex-shrink-0 items-center gap-3 border-t border-white/10 bg-[#0e1116] px-3 py-1 text-[10.5px] text-white/45">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${brain?.ok ? "bg-brand-mint" : "bg-[#F07C6B]"}`} />
          {brain ? brain.model || "node offline" : "…"}
        </span>
        <span className="text-white/20">|</span>
        <span>{APP_PAGE_COUNT} pagina&apos;s</span>
        <span className="text-white/20">|</span>
        <span className="capitalize">{tab === "ai" ? "ZekerFlex AI" : tab === "browser" ? "Pagina's" : "Sandbox"}</span>
        <span className="ml-auto font-mono">{clock}</span>
      </div>
    </div>
  );
}

function PageRow({ page, onOpen, active }: { page: AppPage; onOpen: (route: string) => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(page.route)}
      title={page.file}
      className={`flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left font-mono text-[11px] transition ${
        active ? "bg-[rgba(79,224,160,0.12)] text-brand-mint" : "text-white/60 hover:bg-white/5 hover:text-white/90"
      }`}
    >
      <span className={page.dynamic ? "text-[#FFC46B]" : "text-white/25"}>{page.dynamic ? "◆" : "•"}</span>
      <span className="truncate">{page.route}</span>
    </button>
  );
}

function ActivityButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-10 w-10 place-items-center rounded-lg transition ${
        active ? "bg-white/10 text-brand-mint" : "text-white/45 hover:bg-white/5 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function BrowserPane({
  address,
  setAddress,
  browserUrl,
  isExternal,
  reloadNonce,
  onGo,
  onReload,
}: {
  address: string;
  setAddress: (v: string) => void;
  browserUrl: string;
  isExternal: boolean;
  reloadNonce: number;
  onGo: (v: string) => void;
  onReload: () => void;
}) {
  const quick: [string, string][] = [
    ["Home", "/"],
    ["Shop", "/shop"],
    ["Admin", "/admin"],
    ["Google", "https://www.google.com"],
  ];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0e13]">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={onReload}
          title="Herladen"
          className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-white/15 text-white/60 hover:bg-white/10"
        >
          ↻
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onGo(address);
          }}
          className="flex min-w-[180px] flex-1 items-center gap-1 rounded-md border border-white/15 bg-[#0e1116] px-2"
        >
          <span className="text-white/30">{isExternal ? "🌐" : "🔗"}</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            placeholder="/pad of https://site.nl"
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-xs text-white placeholder:text-white/30 focus:outline-none"
            aria-label="Adres"
          />
          <button type="submit" className="rounded bg-brand-mint px-2.5 py-1 text-[11px] font-semibold text-ink">
            Ga
          </button>
        </form>
        <a
          href={browserUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-shrink-0 rounded-md border border-white/15 px-2.5 py-1.5 text-[11px] text-white/60 hover:bg-white/10"
        >
          Nieuw tabblad ↗
        </a>
      </div>
      <div className="flex flex-shrink-0 flex-wrap gap-1.5 border-b border-white/10 px-3 py-1.5">
        {quick.map(([label, url]) => (
          <button
            key={label}
            type="button"
            onClick={() => onGo(url)}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/55 hover:border-brand-mint hover:text-brand-mint"
          >
            {label}
          </button>
        ))}
      </div>
      {isExternal && (
        <p className="flex-shrink-0 bg-[rgba(255,196,107,0.08)] px-3 py-1.5 text-[11px] text-[#FFC46B]">
          Externe sites (zoals Google) blokkeren vaak insluiten — blijft het leeg? Open hem dan in een nieuw tabblad ↗
        </p>
      )}
      <div className="min-h-0 flex-1 bg-white">
        <iframe
          key={`${browserUrl}#${reloadNonce}`}
          src={browserUrl}
          title="Paginavoorbeeld"
          className="h-full w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}

function SandboxPane() {
  const first = SANDBOX_TEMPLATES[0]!;
  const [code, setCode] = useState(first.code);
  const [templateId, setTemplateId] = useState(first.id);
  const [runNonce, setRunNonce] = useState(0);
  const [autoRun, setAutoRun] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  // A fresh iframe mounts per run (via `key`), so each run is one clean
  // document. On its load event the shell's listener is already registered
  // (its inline script ran during parse), so posting the code then is
  // race-free — no ready-handshake needed.
  const pushCode = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ __zfSandbox: true, html: codeRef.current }, "*");
  }, []);

  const run = useCallback(() => setRunNonce((n) => n + 1), []);

  useEffect(() => {
    if (!autoRun) return;
    const id = setTimeout(() => setRunNonce((n) => n + 1), 700);
    return () => clearTimeout(id);
  }, [code, autoRun]);

  const pickTemplate = useCallback((id: string) => {
    const t = SANDBOX_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setCode(t.code);
    setRunNonce((n) => n + 1);
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#0b0e13]">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <select
          value={templateId}
          onChange={(e) => pickTemplate(e.target.value)}
          aria-label="Sjabloon"
          className="rounded-md border border-white/15 bg-[#0e1116] px-2 py-1.5 text-xs text-white/80 focus:outline-none"
        >
          {SANDBOX_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          className="rounded-md bg-brand-mint px-3 py-1.5 text-xs font-semibold text-ink"
        >
          ▶ Uitvoeren
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-white/55">
          <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
          automatisch
        </label>
        <span className="ml-auto text-[10px] text-white/30">geïsoleerd · kan ZekerFlex niet raken</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          className="min-h-[180px] resize-none border-b border-white/10 bg-[#0c0f15] p-3 font-mono text-[12px] leading-relaxed text-white/85 focus:outline-none lg:border-b-0 lg:border-r"
          aria-label="Sandbox-code"
        />
        <div className="min-h-0 bg-white">
          <iframe
            key={runNonce}
            ref={iframeRef}
            src="/admin/zekerflex-ai/sandbox-frame"
            title="Sandbox-voorbeeld"
            onLoad={pushCode}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}

/* ---- icons (20px, currentColor) ---- */
const IS = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none" } as const;
function IChatIcon() {
  return (
    <svg {...IS}>
      <path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function IFilesIcon() {
  return (
    <svg {...IS}>
      <path d="M5 4h8l4 4v12H5V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 4v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function ISearchIcon() {
  return (
    <svg {...IS}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IBeakerIcon() {
  return (
    <svg {...IS}>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function ITerminalIcon() {
  return (
    <svg {...IS}>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="m7 9 3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
