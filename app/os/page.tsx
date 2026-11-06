import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { appsVoor } from "@/lib/os/apps";
import { osNaam, osRolVan } from "@/lib/os/rol";
import { getOsInstellingen } from "@/lib/os/store";
import { standaardInstellingen } from "@/lib/os/instellingen";
import { Bureaublad } from "@/components/os/Bureaublad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ZekerFlex OS",
  description: "Alle schermen van ZekerFlex op één bureaublad.",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// ZekerFlex OS — één bureaublad met alle apps die bij jouw rol horen. Het OS
// is een schil: elke app opent zijn echte pagina in een venster, en die pagina
// doet nog steeds zijn eigen controle op rol en rechten.
// ---------------------------------------------------------------------------

export default async function OsPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/os");

  const rol = osRolVan(principal);
  const instellingen = await getOsInstellingen(principal.userId, rol).catch(() => standaardInstellingen(rol));

  return <Bureaublad apps={appsVoor(rol)} start={instellingen} rol={rol} naam={osNaam(principal)} tijd={amsterdamClock(new Date())} />;
}
