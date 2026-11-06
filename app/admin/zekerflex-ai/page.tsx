import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { ZekerFlexAIStudio } from "@/components/admin/ZekerFlexAIStudio";
import { AiNodeKey } from "@/components/admin/AiNodeKey";
import { GratisAi } from "@/components/admin/GratisAi";

export const dynamic = "force-dynamic";

export default async function ZekerFlexAIPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De ZekerFlex AI-studio is alleen beschikbaar voor platformbeheerders." />;
  }
  return (
    <div className="space-y-3">
      <PageHead title="ZekerFlex AI" subtitle="Vraag, laat uitzoeken of geef een opdracht, getypt of gesproken. Draait op je eigen model." />
      <details className="a-panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[0.8125rem] font-medium sm:px-5" style={{ color: "var(--a-text)" }}>
          AI-instellingen — gratis op eigen server, sleutel, laptop
          <span className="text-xs transition-transform group-open:rotate-90" style={{ color: "var(--a-mute)" }} aria-hidden>›</span>
        </summary>
        <div className="space-y-3 px-3 pb-3">
          <GratisAi />
          <AiNodeKey />
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>
            <Link href="/admin/gratis" className="underline">
              Overzicht: wat kost nog geld en wat hebben we zelf
            </Link>
          </p>
        </div>
      </details>
      <ZekerFlexAIStudio heightClass="h-[calc(100dvh-17rem)]" />
    </div>
  );
}
