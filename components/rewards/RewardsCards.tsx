"use client";

import { copyText } from "@/lib/clipboard";

import { useEffect, useState } from "react";
import { useInAndroidApp } from "@/components/app/useInAndroidApp";

interface Level {
  id: string;
  name: string;
  minXp: number;
  emoji: string;
  perks: string[];
}
interface Payload {
  status: {
    xp: number;
    level: Level;
    next: Level | null;
    progressPct: number;
    badges: { id: string; name: string; emoji: string; description: string; earned: boolean }[];
    stats: { completedShifts: number; reviewAverage: number; reviewCount: number };
  } | null;
  levels: Level[];
  business: {
    completedShifts: number;
    reviewAverage: number;
    reviewCount: number;
    level: { id: string; name: string; emoji: string; minShifts: number; perks: string[] };
    next: { name: string; emoji: string; minShifts: number } | null;
    progressPct: number;
  } | null;
  businessLevels: { id: string; name: string; emoji: string; minShifts: number; perks: string[] }[];
  referral: { code: string; link: string; invited: number; rewarded: number; earnedCents: number; rewards: { referrerCents: number; newUserCents: number } };
}

const euro = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);

let cache: Promise<Payload | null> | null = null;
function useRewards() {
  const [data, setData] = useState<Payload | null>(null);
  useEffect(() => {
    cache ??= fetch("/api/me/rewards", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    void cache.then(setData);
  }, []);
  return data;
}

// Inside the Android app ZekerFlex Bank is hidden (lib/app-mode.ts), so the
// bank-related perks and badges go too.
const BANK_PERK = /bank|betaalpas|virtuele pas|fysieke pas/i;
const BANK_BADGES = new Set(["banker", "saver", "card"]);
const appPerks = (perks: string[], inApp: boolean) => (inApp ? perks.filter((p) => !BANK_PERK.test(p)) : perks);

/** Level, progress to the next one, perks and badges (freelancers). */
export function LevelCard() {
  const data = useRewards();
  const inApp = useInAndroidApp() !== false;
  const [open, setOpen] = useState(false);
  const s = data?.status;
  if (!s) return null;
  const badges = inApp ? s.badges.filter((b) => !BANK_BADGES.has(b.id)) : s.badges;
  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-br from-[#1f1b4d] via-[#2d2470] to-[#0E5C4A] p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-3xl">{s.level.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Jouw level</span>
            <span className="block font-display text-2xl font-bold">{s.level.name}</span>
            <span className="block text-xs text-white/70">{s.xp.toLocaleString("nl-NL")} XP</span>
          </span>
        </div>
        {s.next && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-mint to-white" style={{ width: `${s.progressPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/70">
              Nog {(s.next.minXp - s.xp).toLocaleString("nl-NL")} XP tot {s.next.emoji} {s.next.name}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Jouw voordelen</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {appPerks(s.level.perks, inApp).map((p) => (
              <li key={p}>✓ {p}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">
            Badges ({badges.filter((b) => b.earned).length}/{badges.length})
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {badges.map((b) => (
              <span key={b.id} title={`${b.name} — ${b.description}`} className={`flex flex-col items-center gap-1 rounded-xl p-2 text-center ${b.earned ? "bg-brand-50" : "bg-paper-soft opacity-40 grayscale"}`}>
                <span className="text-2xl">{b.emoji}</span>
                <span className="text-[10px] font-semibold leading-tight text-ink">{b.name}</span>
              </span>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-semibold text-brand-600 hover:underline">
          {open ? "Verberg alle levels" : "Bekijk alle levels"}
        </button>
        {open && (
          <ul className="divide-y divide-hair rounded-xl border border-hair text-sm">
            {data!.levels.map((l) => (
              <li key={l.id} className={`flex gap-3 px-4 py-2.5 ${l.id === s.level.id ? "bg-brand-50/60" : ""}`}>
                <span className="text-xl">{l.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {l.name} <span className="text-xs font-normal text-neutralx-400">vanaf {l.minXp.toLocaleString("nl-NL")} XP</span>
                  </span>
                  <span className="block text-xs text-neutralx-500">{appPerks(l.perks, inApp).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-neutralx-400">
          XP: 100 per afgeronde klus, 25 per review, 500 extra bij 4,8+ gemiddeld{inApp ? "." : ", plus bonussen voor ZekerFlex Bank, potjes en een pas."}
        </p>
      </div>
    </div>
  );
}

/** Partner level for companies. */
export function BusinessLevelCard() {
  const data = useRewards();
  const inApp = useInAndroidApp() !== false;
  const [open, setOpen] = useState(false);
  const b = data?.business;
  if (!b) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 bg-gradient-to-br from-[#1f1b4d] to-[#0E5C4A] p-5 text-white">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-3xl">{b.level.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Partnerniveau</span>
          <span className="block font-display text-2xl font-bold">{b.level.name}</span>
          <span className="block text-xs text-white/70">
            {b.completedShifts.toLocaleString("nl-NL")} klussen afgerond{b.reviewCount ? ` · ${b.reviewAverage.toLocaleString("nl-NL")}★ (${b.reviewCount})` : ""}
          </span>
        </span>
        {b.next && (
          <div className="w-full">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-mint to-white" style={{ width: `${b.progressPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-white/70">
              Nog {(b.next.minShifts - b.completedShifts).toLocaleString("nl-NL")} klussen tot {b.next.emoji} {b.next.name}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-3 p-5 text-sm">
        <ul className="space-y-1 text-ink">
          {appPerks(b.level.perks, inApp).map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs font-semibold text-brand-600 hover:underline">
          {open ? "Verberg alle niveaus" : "Bekijk alle niveaus"}
        </button>
        {open && (
          <ul className="divide-y divide-hair rounded-xl border border-hair">
            {data!.businessLevels.map((l) => (
              <li key={l.id} className={`flex gap-3 px-4 py-2.5 ${l.id === b.level.id ? "bg-brand-50/60" : ""}`}>
                <span className="text-xl">{l.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {l.name} <span className="text-xs font-normal text-neutralx-400">vanaf {l.minShifts.toLocaleString("nl-NL")} klussen</span>
                  </span>
                  <span className="block text-xs text-neutralx-500">{appPerks(l.perks, inApp).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Personal invite link with bonus — for every role, on the website only:
 * offering cash rewards in the Android app gives it an 18+ Play/IARC rating,
 * and freelancers can be 16–17 (lib/app-mode.ts).
 */
export function ReferralCard() {
  const data = useRewards();
  const inApp = useInAndroidApp();
  const [copied, setCopied] = useState(false);
  if (!data || inApp !== false) return null;
  const r = data.referral;
  async function share() {
    const text = `Werk en verdien via ZekerFlex — met je eigen gratis bankrekening. Meld je aan met mijn link en krijg ${euro(r.rewards.newUserCents)} welkomstbonus: ${r.link}`;
    try {
      if (navigator.share) await navigator.share({ title: "ZekerFlex", text, url: r.link });
      else {
        await copyText(r.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  }
  return (
    <div className="card flex flex-wrap items-center gap-4 border-brand-500/30 bg-gradient-to-br from-[#FFF7E6] to-transparent p-5 dark:from-brand-50/10">
      <span className="text-4xl">🎁</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          Nodig iemand uit, krijg {euro(r.rewards.referrerCents)}
        </span>
        <span className="block text-xs text-neutralx-500">
          Zij krijgen {euro(r.rewards.newUserCents)} welkomstbonus. Uitbetaald op je ZekerFlex Bank zodra hun eerste klus is afgerond.
          {r.invited > 0 && ` Al ${r.invited} uitgenodigd · ${euro(r.earnedCents)} verdiend.`}
        </span>
        <span className="mt-1 block font-mono text-xs text-neutralx-600">{r.link.replace(/^https?:\/\//, "")}</span>
      </span>
      <button type="button" onClick={share} className="btn-primary text-sm">
        {copied ? "Link gekopieerd ✓" : "Deel je link"}
      </button>
    </div>
  );
}
