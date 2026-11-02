import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel } from "@/components/admin/kit";
import { CompanionLink } from "@/components/admin/CompanionLink";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LaptopJarvisPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="Laptop-Jarvis"
        subtitle="Een Nederlandse spraakassistent op je eigen laptop, verbonden met ZekerFlex en de AI-teams. Zeg “Jarvis, geef de briefing” of “Jarvis, welke voorstellen staan er”."
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CompanionLink baseUrl={env.APP_BASE_URL.replace(/\/+$/, "")} />
        <Panel title="Installeren" subtitle="Eenmalig, op je eigen laptop">
          <ol className="list-decimal space-y-1.5 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            <li>Installeer Python 3.11 of nieuwer (python.org, vink “Add python.exe to PATH” aan).</li>
            <li>Kopieer de map <code>deploy/jarvis-desktop</code> uit de ZekerFlex-code naar je laptop, bijvoorbeeld naar Documenten.</li>
            <li>Dubbelklik <code>installeren.bat</code>.</li>
            <li>Klik op “Laptop-Jarvis koppelen” en zet de twee regels in het bestand <code>.env</code> in die map.</li>
            <li>Dubbelklik <code>start-jarvis.bat</code> en zeg “Jarvis, geef de briefing”. Geen microfoon? Gebruik <code>start-jarvis-tekst.bat</code> om te typen.</li>
          </ol>
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
            Jarvis kan alles opvragen en voorlezen, maar voert een voorstel van de AI-teams pas uit als je daarna “ja” zegt. Alles komt in het auditspoor op jouw naam.
          </p>
        </Panel>
      </div>
    </div>
  );
}
