import type { Metadata } from "next";
import Link from "next/link";
import { demoAccountStatus } from "@/lib/demo/seed-account";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bekijk een voorbeeldaccount",
  description: "Kijk mee in een ZekerFlex-voorbeeldaccount met verzonnen gegevens.",
  robots: { index: false, follow: false },
};

export default async function DemoPage(): Promise<React.JSX.Element> {
  const status = await demoAccountStatus();
  const klaar = status.werkgever && status.werker;

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bekijk een ZekerFlex-voorbeeldaccount</h1>
      <p className="mt-3 text-slate-600">
        Dit is een voorbeeld met verzonnen gegevens, zodat je kunt zien hoe een echt ZekerFlex-account eruitziet. Je
        kijkt alleen mee: je kunt niets veranderen of versturen.
      </p>

      {!klaar ? (
        <p className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          De voorbeeldaccounts worden nog klaargezet. Kom zo nog even terug.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <DemoKaart
            href="/voorbeeld/werkgever"
            titel="Voor werkgevers"
            tekst="Het opdrachtgever-dashboard: diensten plaatsen, uren goedkeuren, facturen en de chat met werkers."
          />
          <DemoKaart
            href="/voorbeeld/werker"
            titel="Voor werkers"
            tekst="Hoe het eruitziet voor een zzp'er of uitzendkracht: klussen vinden, uren indienen en uitbetalingen."
          />
        </div>
      )}

      <p className="mt-10 text-xs text-slate-500">
        Een voorbeeldaccount is niet je eigen account.{" "}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Maak gratis je eigen account
        </Link>{" "}
        om echt aan de slag te gaan.
      </p>
    </main>
  );
}

function DemoKaart({ href, titel, tekst }: { href: string; titel: string; tekst: string }): React.JSX.Element {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200 p-5 transition hover:border-brand-400 hover:shadow-sm"
    >
      <p className="text-lg font-semibold text-slate-900">{titel}</p>
      <p className="mt-1 text-sm text-slate-600">{tekst}</p>
      <span className="mt-3 inline-block text-sm font-semibold text-brand-600">Bekijk voorbeeld</span>
    </Link>
  );
}
