import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { leesAanmelding } from "@/lib/kaart/aanmelden-store";
import { KaartAanmeldingForm } from "@/components/app/KaartAanmelding";

export const dynamic = "force-dynamic";

// Werkgever → Op de kaart: je bedrijf op ZekerFlex Kaart zetten, met naam, adres en een link naar je site.
// ZekerFlex keurt het eerst goed; alleen wat je zelf invult komt op de kaart.
export default async function KaartPagina() {
  const principal = await requirePrincipal();
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  const aanmelding = tenantId ? await leesAanmelding(tenantId) : null;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold text-ink">Zet je bedrijf op de kaart</h1>
      <p className="mt-1 text-sm text-neutralx-600">
        Op <Link href="/kaart" className="underline underline-offset-2">ZekerFlex Kaart</Link> zien mensen waar je bedrijf zit, wat je doet en hoe ze je bereiken. Het is gratis en je bepaalt zelf wat er staat.
      </p>
      <div className="mt-6">
        {tenantId ? <KaartAanmeldingForm begin={aanmelding} /> : <p className="text-sm text-neutralx-600">Geen organisatie gevonden voor je account.</p>}
      </div>
    </div>
  );
}
