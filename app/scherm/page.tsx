import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ditApparaat } from "@/lib/horeca/apparaten";
import { eisBeheer } from "@/lib/horeca/toegang";
import { SCHERMEN } from "@/lib/horeca/schermen";
import { SchermStart } from "@/components/horeca/scherm/SchermStart";

export const metadata: Metadata = { title: "Scherm koppelen" };
export const dynamic = "force-dynamic";

// /scherm: het beginpunt op elk apparaat. Een gekoppeld apparaat gaat meteen
// naar zijn eigen scherm. Anders: de koppelcode intikken (of ?code= uit de
// QR-code), en de beheerder van een zaak kiest hier zelf een scherm.
export default async function SchermPagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.slice(0, 20) : "";
  const app = await ditApparaat();
  if (app && !code && sp.kies === undefined) redirect(`/scherm/${app.apparaat.rol}`);
  const eigen = await eisBeheer().catch(() => null);
  return (
    <SchermStart
      code={code}
      gekoppeld={app ? { naam: app.apparaat.naam, scherm: SCHERMEN[app.apparaat.rol].naam, rol: app.apparaat.rol } : null}
      eigenaar={eigen ? { zaak: eigen.zaak.naam, modules: eigen.zaak.modules } : null}
    />
  );
}
