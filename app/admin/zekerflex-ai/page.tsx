import { getPrincipal, hasRole } from "@/lib/auth";
import { ZekerFlexAIStudio } from "@/components/admin/ZekerFlexAIStudio";
import { AiNodeKey } from "@/components/admin/AiNodeKey";

export const dynamic = "force-dynamic";

export default async function ZekerFlexAIPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De ZekerFlex AI-studio is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }
  return (
    <div className="space-y-3">
      <details className="rounded-xl border border-hair bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          AI-node-instellingen (laptop)
        </summary>
        <div className="px-3 pb-3">
          <AiNodeKey />
        </div>
      </details>
      <ZekerFlexAIStudio heightClass="h-[calc(100dvh-13.5rem)]" />
    </div>
  );
}
