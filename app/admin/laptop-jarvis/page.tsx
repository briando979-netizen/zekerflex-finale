import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { CompanionLink } from "@/components/admin/CompanionLink";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LaptopJarvisPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Laptop-Jarvis"
        subtitle="Een Nederlandse spraakassistent op je eigen laptop, verbonden met ZekerFlex en de AI-teams. Zeg “Jarvis, geef de briefing” of “Jarvis, welke voorstellen staan er”."
      />
      <CompanionLink baseUrl={env.APP_BASE_URL.replace(/\/+$/, "")} />
      <div className="card p-5 text-sm leading-relaxed text-neutralx-700">
        <p className="font-semibold text-ink">Installeren (eenmalig)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Installeer Python 3.11 of nieuwer (python.org — vink “Add python.exe to PATH” aan).</li>
          <li>
            Kopieer de map <code>deploy/jarvis-desktop</code> uit de ZekerFlex-code naar je laptop (bijv. naar Documenten).
          </li>
          <li>
            Dubbelklik <code>installeren.bat</code>.
          </li>
          <li>
            Klik hierboven op “Laptop-Jarvis koppelen” en zet de twee regels in het bestand <code>.env</code> in die map.
          </li>
          <li>
            Dubbelklik <code>start-jarvis.bat</code> en zeg “Jarvis, geef de briefing”. Geen microfoon? Gebruik{" "}
            <code>start-jarvis-tekst.bat</code> om te typen.
          </li>
        </ol>
        <p className="mt-3 text-neutralx-500">
          Jarvis kan alles opvragen en voorlezen, maar voert een voorstel van de AI-teams pas uit als je daarna “ja” zegt. Alles
          komt in het auditspoor op jouw naam.
        </p>
      </div>
    </div>
  );
}
