"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PushToggle } from "@/components/app/PushToggle";
import { setLocale, useI18n } from "@/components/i18n/I18nProvider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { vulIn } from "@/lib/i18n/vul-in";
import { useChatTeksten } from "./ChatTekstenContext";

// ---------------------------------------------------------------------------
// WhatsApp-style chat settings: a list of sections, each opening its own page
// (Account, Privacy, Chats, Meldingen, Bedrijfstools, Help). Only options that
// really do something — server-side ones go through /api/chat/settings and
// /api/inbox/prefs; look-and-feel ones (lettergrootte, achtergrond) live in
// this browser (localStorage) and are applied by InboxPage via "zf:chat-look".
// ---------------------------------------------------------------------------

interface Settings {
  quickReplies: string[];
  autoReply: { enabled: boolean; text: string; onlyWhenAway: boolean };
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  statusNote: string;
  notificationPreview: boolean;
}
type Page = "root" | "account" | "privacy" | "chats" | "notifications" | "business" | "help";

export const LOOK_KEY = "zf-chat-look";
export interface ChatLook {
  font: "s" | "m" | "l";
  wallpaper: "dots" | "plain" | "mint" | "dark";
}
export function readLook(): ChatLook {
  try {
    return { font: "m", wallpaper: "dots", ...(JSON.parse(localStorage.getItem(LOOK_KEY) ?? "{}") as Partial<ChatLook>) };
  } catch {
    return { font: "m", wallpaper: "dots" };
  }
}

function Row({ icon, title, sub, onClick, right }: { icon?: string; title: string; sub?: string; onClick?: () => void; right?: ReactNode }) {
  const inner = (
    <>
      {icon && <span className="w-8 flex-shrink-0 text-center text-lg">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-ink">{title}</span>
        {sub && <span className="block text-xs text-neutralx-500">{sub}</span>}
      </span>
      {right ?? (onClick ? <span className="text-neutralx-300">›</span> : null)}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-soft">
      {inner}
    </button>
  ) : (
    <div className="flex w-full items-center gap-3 px-4 py-3">{inner}</div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${on ? "bg-brand-500" : "bg-neutralx-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const Head = ({ children }: { children: ReactNode }) => (
  <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400">{children}</p>
);

export function ChatSettingsPanel({
  me,
  blocked,
  names,
  hasPin,
  onUnblock,
  onSetPin,
  onSupport,
  onChanged,
  employer,
}: {
  me: { name: string };
  blocked: string[];
  names: Record<string, string>;
  hasPin: boolean;
  onUnblock: (userId: string) => void;
  onSetPin: () => void;
  onSupport: () => void;
  onChanged: () => void;
  employer: boolean;
}) {
  const [page, setPage] = useState<Page>("root");
  const [s, setS] = useState<Settings | null>(null);
  const [overview, setOverview] = useState<{ muted: string[]; labels: { name: string; count: number }[] }>({ muted: [], labels: [] });
  const [look, setLook] = useState<ChatLook>({ font: "m", wallpaper: "dots" });
  const [note, setNote] = useState<string | null>(null);
  const [newQuick, setNewQuick] = useState("");
  const { locale } = useI18n();
  const t = useChatTeksten().instellingen;

  const loadOverview = () =>
    fetch("/api/inbox/prefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setOverview(d);
      })
      .catch(() => undefined);
  useEffect(() => {
    fetch("/api/chat/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setS(d.settings ?? d);
      })
      .catch(() => undefined);
    void loadOverview();
    setLook(readLook());
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    const r = await fetch("/api/chat/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setNote(r.ok ? t.opgeslagen : t.opslaanMislukt);
    setTimeout(() => setNote(null), 1500);
  };
  const bulk = async (body: Record<string, string>, ok: string) => {
    const r = await fetch("/api/inbox/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setNote(r.ok ? ok : (d?.error?.message ?? t.mislukt));
    await loadOverview();
    onChanged();
  };
  const setLookAndSave = (patch: Partial<ChatLook>) => {
    const next = { ...look, ...patch };
    setLook(next);
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent("zf:chat-look", { detail: next }));
  };

  const back = (title: string) => (
    <button type="button" onClick={() => setPage("root")} className="flex w-full items-center gap-2 border-b border-hair px-4 py-2.5 text-left text-sm font-semibold text-ink hover:bg-paper-soft">
      ‹ {title}
    </button>
  );

  if (page === "root")
    return (
      <div className="divide-y divide-hair">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-lg font-bold text-white">{me.name.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-bold text-ink">{me.name}</span>
            <input
              defaultValue={s?.statusNote ?? ""}
              key={s ? "loaded" : "loading"}
              maxLength={140}
              placeholder={t.statusPlaceholder}
              onBlur={(e) => s && e.target.value !== s.statusNote && void save({ statusNote: e.target.value })}
              className="w-full bg-transparent text-xs text-neutralx-500 outline-none placeholder:text-neutralx-300"
            />
          </span>
        </div>
        <div>
          <Row icon="🔑" title={t.account} sub={t.accountSub} onClick={() => setPage("account")} />
          <Row icon="🔒" title={t.privacy} sub={t.privacySub} onClick={() => setPage("privacy")} />
          <Row icon="💬" title={t.chats} sub={t.chatsSub} onClick={() => setPage("chats")} />
          <Row icon="🔔" title={t.meldingen} sub={t.meldingenSub} onClick={() => setPage("notifications")} />
          <Row icon="🧰" title={t.bedrijfstools} sub={t.bedrijfstoolsSub} onClick={() => setPage("business")} />
          <Row
            icon="🌐"
            title={t.taal}
            right={
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className="rounded-lg border border-hairstrong bg-white px-2 py-1 text-xs">
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABELS[l]}
                  </option>
                ))}
              </select>
            }
          />
          <Row icon="❓" title={t.help} sub={t.helpSub} onClick={() => setPage("help")} />
        </div>
        {note && <p className="px-4 py-2 text-xs text-neutralx-500">{note}</p>}
      </div>
    );

  if (page === "account") {
    return (
      <div>
        {back(t.account)}
        <Row icon="👤" title={t.persoonlijkeGegevens} onClick={() => (window.location.href = employer ? "/werkgever/bedrijf" : "/dashboard/profiel")} />
        <Row icon="🛡" title={t.tweestapsverificatie} onClick={() => (window.location.href = employer ? "/werkgever/account" : "/dashboard/account/beveiliging")} />
        <Row icon="🔐" title={t.wachtwoordWijzigen} onClick={() => (window.location.href = "/wachtwoord-vergeten")} />
        <Row icon="📦" title={t.downloadGegevens} sub={t.downloadGegevensSub} onClick={() => (window.location.href = "/api/me/gegevens/export")} />
        <Row icon="🗑" title={t.accountVerwijderen} onClick={() => (window.location.href = "/account-verwijderen")} />
      </div>
    );
  }

  if (page === "privacy")
    return (
      <div>
        {back(t.privacy)}
        <Head>{t.wieZietWat}</Head>
        <Row title={t.laatstGezienOnline} sub={t.laatstGezienOnlineSub} right={<Toggle on={s?.showOnlineStatus ?? true} onChange={(v) => void save({ showOnlineStatus: v })} />} />
        <Row title={t.leesbevestigingen} sub={t.leesbevestigingenSub} right={<Toggle on={s?.showReadReceipts ?? true} onChange={(v) => void save({ showReadReceipts: v })} />} />
        <Head>{t.berichten}</Head>
        <Row title={t.verdwijnendeBerichten} sub={t.verdwijnendeBerichtenSub} />
        <Row icon="🔒" title={hasPin ? t.pincodeWijzigen : t.pincodeInstellen} sub={t.pincodeSub} onClick={onSetPin} />
        <Head>{vulIn(t.geblokkeerdeContacten, { aantal: blocked.length })}</Head>
        {blocked.length === 0 ? (
          <p className="px-4 pb-3 text-xs text-neutralx-500">{t.geenGeblokkeerd}</p>
        ) : (
          blocked.map((uid) => (
            <Row
              key={uid}
              icon="⛔"
              title={names[uid] ?? t.onbekend}
              right={
                <button type="button" onClick={() => onUnblock(uid)} className="text-xs font-semibold text-brand-600 underline">
                  {t.deblokkeer}
                </button>
              }
            />
          ))
        )}
      </div>
    );

  if (page === "chats")
    return (
      <div>
        {back(t.chats)}
        <Head>{t.weergave}</Head>
        <Row
          title={t.lettergrootte}
          right={
            <span className="flex gap-1">
              {(["s", "m", "l"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setLookAndSave({ font: f })} className={`rounded-lg px-2.5 py-1 text-xs ${look.font === f ? "bg-brand-500 text-white" : "bg-paper-soft"}`}>
                  {f === "s" ? t.klein : f === "m" ? t.normaal : t.groot}
                </button>
              ))}
            </span>
          }
        />
        <Row
          title={t.achtergrond}
          right={
            <span className="flex gap-1.5">
              {(
                [
                  ["dots", "#F4F4F0", t.achtergrondStippen],
                  ["plain", "#FFFFFF", t.achtergrondWit],
                  ["mint", "#E4F8EF", t.achtergrondMint],
                  ["dark", "#14161A", t.achtergrondDonker],
                ] as const
              ).map(([w, c, naam]) => (
                <button
                  key={w}
                  type="button"
                  aria-label={naam}
                  onClick={() => setLookAndSave({ wallpaper: w })}
                  className={`h-7 w-7 rounded-full border-2 ${look.wallpaper === w ? "border-brand-500" : "border-hair"}`}
                  style={{ background: c }}
                />
              ))}
            </span>
          }
        />
        <Head>{t.chatgeschiedenis}</Head>
        <Row icon="🗄" title={t.alleArchiveren} onClick={() => window.confirm(t.alleArchiverenVraag) && void bulk({ action: "archive-all" }, t.alleGearchiveerd)} />
        <Row icon="🧹" title={t.alleWissen} sub={t.alleWissenSub} onClick={() => window.confirm(t.alleWissenVraag) && void bulk({ action: "clear-all" }, t.alleGewist)} />
        {note && <p className="px-4 py-2 text-xs text-neutralx-500">{note}</p>}
      </div>
    );

  if (page === "notifications")
    return (
      <div>
        {back(t.meldingen)}
        <div className="px-4 py-3">
          <PushToggle cardTexts={t.pushKaart} />
        </div>
        <Row title={t.berichtvoorbeeld} sub={t.berichtvoorbeeldSub} right={<Toggle on={s?.notificationPreview ?? true} onChange={(v) => void save({ notificationPreview: v })} />} />
        <Head>{vulIn(t.gedempteChats, { aantal: overview.muted.length })}</Head>
        {overview.muted.length === 0 ? (
          <p className="px-4 pb-3 text-xs text-neutralx-500">{t.geenGedempt}</p>
        ) : (
          <Row title={vulIn(t.aantalGedempt, { aantal: overview.muted.length })} right={<button type="button" onClick={() => void bulk({ action: "unmute-all" }, t.dempenOpgeheven)} className="text-xs font-semibold text-brand-600 underline">{t.allesWeerAan}</button>} />
        )}
        {note && <p className="px-4 py-2 text-xs text-neutralx-500">{note}</p>}
      </div>
    );

  if (page === "business")
    return (
      <div>
        {back(t.bedrijfstools)}
        <Head>{t.snelleAntwoorden}</Head>
        {(s?.quickReplies ?? []).map((q, i) => (
          <Row
            key={i}
            title={q}
            right={
              <button type="button" onClick={() => s && void save({ quickReplies: s.quickReplies.filter((_, j) => j !== i) })} className="text-xs text-neutralx-400 hover:text-crit">
                {t.verwijder}
              </button>
            }
          />
        ))}
        <div className="flex gap-2 px-4 py-2">
          <input value={newQuick} onChange={(e) => setNewQuick(e.target.value)} maxLength={200} placeholder={t.nieuwSnelAntwoord} className="field-input flex-1 py-1.5 text-sm" />
          <button
            type="button"
            disabled={!newQuick.trim() || !s}
            onClick={() => {
              if (!s) return;
              void save({ quickReplies: [...s.quickReplies, newQuick.trim()] });
              setNewQuick("");
            }}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {t.voegToe}
          </button>
        </div>
        <Head>{t.afwezigheidsbericht}</Head>
        <Row title={t.automatischAntwoorden} sub={s?.autoReply.onlyWhenAway ? t.alleenOfflineJe : t.altijd} right={<Toggle on={s?.autoReply.enabled ?? false} onChange={(v) => s && void save({ autoReply: { ...s.autoReply, enabled: v } })} />} />
        <div className="px-4 pb-3">
          <textarea
            key={s ? "ar" : "x"}
            defaultValue={s?.autoReply.text ?? ""}
            maxLength={600}
            rows={2}
            onBlur={(e) => s && e.target.value !== s.autoReply.text && void save({ autoReply: { ...s.autoReply, text: e.target.value } })}
            className="field-input text-sm"
          />
          <label className="mt-1 flex items-center gap-2 text-xs text-neutralx-600">
            <input type="checkbox" checked={s?.autoReply.onlyWhenAway ?? true} onChange={(e) => s && void save({ autoReply: { ...s.autoReply, onlyWhenAway: e.target.checked } })} className="accent-brand-500" />
            {t.alleenOfflineIk}
          </label>
        </div>
        <Head>{vulIn(t.labels, { aantal: overview.labels.length })}</Head>
        {overview.labels.length === 0 ? (
          <p className="px-4 pb-3 text-xs text-neutralx-500">{t.geenLabels}</p>
        ) : (
          overview.labels.map((l) => (
            <Row
              key={l.name}
              icon="🏷"
              title={l.name}
              sub={vulIn(t.aantalChats, { aantal: l.count })}
              right={
                <span className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const to = window.prompt(t.hernoemPrompt, l.name);
                      if (to && to.trim() && to !== l.name) void bulk({ action: "list-rename", from: l.name, to }, t.labelHernoemd);
                    }}
                    className="text-brand-600 underline"
                  >
                    {t.hernoem}
                  </button>
                  <button type="button" onClick={() => window.confirm(vulIn(t.labelVerwijderVraag, { naam: l.name })) && void bulk({ action: "list-delete", list: l.name }, t.labelVerwijderd)} className="text-neutralx-400 hover:text-crit">
                    {t.verwijder}
                  </button>
                </span>
              }
            />
          ))
        )}
        {note && <p className="px-4 py-2 text-xs text-neutralx-500">{note}</p>}
      </div>
    );

  return (
    <div>
      {back(t.help)}
      <Row icon="📚" title={t.helpcentrum} sub={t.helpcentrumSub} onClick={() => (window.location.href = employer ? "/kennis/werkgevers" : "/kennis")} />
      <Row icon="🛟" title={t.contactSupport} onClick={onSupport} />
      <Row icon="📄" title={t.privacybeleid} onClick={() => (window.location.href = "/privacy")} />
      <Row icon="⚖️" title={t.gebruiksvoorwaarden} onClick={() => (window.location.href = "/voorwaarden")} />
    </div>
  );
}
