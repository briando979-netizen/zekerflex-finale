import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { MijnAi } from "@/components/admin/mijn-ai/MijnAi";

export const dynamic = "force-dynamic";

// Mijn AI (15 nov 2026): een eigen chatomgeving voor de eigenaar, ingericht zoals Claude (components/admin/mijn-ai).
export default async function MijnAiPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Mijn AI is alleen beschikbaar voor platformbeheerders." />;
  }
  const voornaam = principal.fullName.trim().split(/\s+/)[0] ?? "";
  return (
    <div className="space-y-3">
      <PageHead
        title="Mijn AI"
        subtitle="Je eigen gesprekken met ZekerFlex AI, alleen voor jou."
        actions={
          <Link href="/admin/zekerflex-ai" className="text-xs underline" style={{ color: "var(--a-mute)" }}>
            Naar de AI-studio
          </Link>
        }
      />
      <MijnAi voornaam={voornaam} />
    </div>
  );
}
