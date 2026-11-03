import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN, BASE } from "@/lib/voorstel/schwarzwald";
import { beheerder, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { AGENDA } from "@/lib/voorstel/schwarzwald-agenda";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { VOORSTEL_HEADER } from "@/lib/voorstel/subdomein";
import { BeheerApp } from "@/components/voorstel/beheer/BeheerApp";
import { Logo } from "@/components/voorstel/SchwarzwaldHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beheer" };

// De beheeromgeving van Het Schwarzwald, als eigen dashboard (zonder de
// omlijsting van de publieke site, zie AlleenOpSite). Toegang: een
// Schwarzwald-account met rol beheerder, of een ZekerFlex-platformbeheerder
// (die wijst de eerste beheerder aan onder Accounts).
export default async function SchwarzwaldBeheerPage() {
  const [wie, account, cfg, kop] = await Promise.all([beheerder(), huidigAccount().catch(() => null), agendaConfig(), headers()]);
  // duur per activiteit voor de weekplanning: standaard, met de instellingen van de beheerder eroverheen
  const duur = Object.fromEntries([...Object.entries(AGENDA), ...Object.entries(cfg.regels)].map(([slug, r]) => [slug, r.duurMin]));
  const subdomein = kop.get(VOORSTEL_HEADER) !== null;

  if (wie) {
    return (
      <BeheerApp
        namen={Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam]))}
        duur={duur}
        vandaag={amsterdamDayKey(new Date())}
        wie={wie.naam}
        // uitloggen bij het Schwarzwald-account, of bij ZekerFlex als je via een platformbeheerder binnen bent
        via={account?.rol === "beheerder" ? "schwarzwald" : "zekerflex"}
      />
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-schw-night px-4 py-12">
      <div className="w-full max-w-md rounded-xl3 bg-white p-8 text-center shadow-xl">
        <Logo className="mx-auto h-20 w-auto" />
        <h1 className="mt-5 font-display text-2xl font-bold">Beheer Het Schwarzwald</h1>
        <p className="mt-2 text-schw-mute">Log in met een beheerdersaccount om verder te gaan.</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href={`${BASE}/account`} className="rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
            Inloggen
          </Link>
          {!subdomein && (
            <Link href={`/login?callbackUrl=${encodeURIComponent(`${BASE}/beheer`)}`} className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15">
              Inloggen als ZekerFlex-beheerder
            </Link>
          )}
          <Link href={BASE} className="text-sm font-semibold underline underline-offset-4">
            Naar de website
          </Link>
        </div>
      </div>
    </div>
  );
}
