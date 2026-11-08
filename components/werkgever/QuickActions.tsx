"use client";

import Link from "next/link";

const ACTIONS = [
  {
    icon: "📅",
    label: "Klus plaatsen",
    href: "/werkgever/diensten/nieuw",
    desc: "Nieuwe dienst creëren",
  },
  {
    icon: "👥",
    label: "Werkers zoeken",
    href: "/werkgever/werkpool",
    desc: "Beschikbare flexwerkers",
  },
  {
    icon: "⏰",
    label: "Uren goedkeuren",
    href: "/werkgever/uren",
    desc: "Werkersuren controleren",
  },
  {
    icon: "💬",
    label: "Berichten",
    href: "/werkgever/berichten",
    desc: "Communicatie met team",
  },
  {
    icon: "📊",
    label: "Analytics",
    href: "/werkgever/rapportages",
    desc: "Statistieken en trends",
  },
  {
    icon: "⚙️",
    label: "Instellingen",
    href: "/werkgever/instellingen",
    desc: "Bedrijf & team setup",
  },
];

export function QuickActions() {
  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <h3 className="font-semibold text-ink mb-4">Snelle acties</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex flex-col items-center gap-2 rounded-lg border border-hair p-3 text-center transition hover:bg-paper-soft hover:border-brand-500"
          >
            <span className="text-2xl">{action.icon}</span>
            <p className="text-xs font-semibold text-ink">{action.label}</p>
            <p className="text-[10px] text-neutralx-500 group-hover:text-neutralx-600">{action.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
