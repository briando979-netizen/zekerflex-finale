"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

// ---------------------------------------------------------------------------
// One colour = one meaning, everywhere in the app. Shown as a small, foldable
// legend under lists and calendars, so people learn it once and then read the
// screen at a glance.
// ---------------------------------------------------------------------------

type Key = "do" | "plan" | "wait" | "trust" | "money" | "problem";
const SWATCH: Record<Key, string> = {
  do: "bg-brand-500",
  plan: "bg-plan",
  wait: "bg-warn",
  trust: "bg-trust",
  money: "bg-money",
  problem: "bg-crit",
};

const COPY: Record<string, { title: string; items: Record<Key, [string, string]> }> = {
  nl: {
    title: "Wat betekenen de kleuren?",
    items: {
      do: ["Groen — doen", "Reageren, aannemen, bevestigen."],
      plan: ["Blauw — gepland", "Ingeplande klussen, agenda en tijden."],
      wait: ["Amber — wacht op jou", "Er is een actie van jou nodig, zoals uren invullen of goedkeuren."],
      trust: ["Violet — verificatie", "Identiteit, KVK en beveiliging."],
      money: ["Goud — geld", "Tarief, uitbetaling en verdiensten."],
      problem: ["Rood — probleem", "Geannuleerd, afgewezen of er gaat iets mis."],
    },
  },
  en: {
    title: "What do the colours mean?",
    items: {
      do: ["Green — do", "React, accept, confirm."],
      plan: ["Blue — scheduled", "Booked jobs, calendar and times."],
      wait: ["Amber — waiting for you", "You need to act, e.g. enter or approve hours."],
      trust: ["Violet — verification", "Identity, KVK and security."],
      money: ["Gold — money", "Rate, payout and earnings."],
      problem: ["Red — problem", "Cancelled, rejected or something's wrong."],
    },
  },
  pl: {
    title: "Co oznaczają kolory?",
    items: {
      do: ["Zielony — działaj", "Zgłoś się, przyjmij, potwierdź."],
      plan: ["Niebieski — zaplanowane", "Zaplanowane zlecenia, kalendarz i godziny."],
      wait: ["Bursztynowy — czeka na ciebie", "Potrzebne twoje działanie, np. wpisanie lub zatwierdzenie godzin."],
      trust: ["Fioletowy — weryfikacja", "Tożsamość, KVK i bezpieczeństwo."],
      money: ["Złoty — pieniądze", "Stawka, wypłata i zarobki."],
      problem: ["Czerwony — problem", "Anulowane, odrzucone lub coś nie tak."],
    },
  },
  ro: {
    title: "Ce înseamnă culorile?",
    items: {
      do: ["Verde — acțiune", "Aplică, acceptă, confirmă."],
      plan: ["Albastru — planificat", "Joburi programate, calendar și ore."],
      wait: ["Chihlimbar — așteaptă după tine", "E nevoie de o acțiune a ta, de ex. completarea sau aprobarea orelor."],
      trust: ["Violet — verificare", "Identitate, KVK și securitate."],
      money: ["Auriu — bani", "Tarif, plată și câștiguri."],
      problem: ["Roșu — problemă", "Anulat, respins sau ceva nu merge."],
    },
  },
  uk: {
    title: "Що означають кольори?",
    items: {
      do: ["Зелений — дія", "Відгукнутися, прийняти, підтвердити."],
      plan: ["Синій — заплановано", "Заплановані роботи, календар і час."],
      wait: ["Бурштиновий — чекає на тебе", "Потрібна твоя дія, напр. внести чи затвердити години."],
      trust: ["Фіолетовий — перевірка", "Особа, KVK і безпека."],
      money: ["Золотий — гроші", "Ставка, виплата і заробіток."],
      problem: ["Червоний — проблема", "Скасовано, відхилено або щось не так."],
    },
  },
};

export function ColorLegend({ only, className = "" }: { only?: Key[]; className?: string }) {
  const { locale } = useI18n();
  const c = COPY[locale] ?? COPY.nl!;
  const keys = only ?? (Object.keys(SWATCH) as Key[]);
  return (
    <details className={`group rounded-2xl border border-hair bg-white/70 px-4 py-3 text-sm ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink">
        <span className="flex -space-x-1" aria-hidden>
          {keys.slice(0, 5).map((k) => (
            <span key={k} className={`h-3 w-3 rounded-full ring-2 ring-white ${SWATCH[k]}`} />
          ))}
        </span>
        {c.title}
        <span className="ml-auto text-neutralx-400 transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {keys.map((k) => (
          <li key={k} className="flex gap-2.5">
            <span className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${SWATCH[k]}`} aria-hidden />
            <span>
              <span className="block font-semibold text-ink">{c.items[k][0]}</span>
              <span className="block text-xs text-neutralx-500">{c.items[k][1]}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
