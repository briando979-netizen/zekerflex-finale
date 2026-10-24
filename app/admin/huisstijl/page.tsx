import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader } from "@/components/admin/ui";
import { BrandingEditor } from "@/components/admin/BrandingEditor";

export const dynamic = "force-dynamic";

export default async function AdminHuisstijlPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Huisstijl is alleen voor platformbeheer." />;
  }
  return (
    <>
      <APageHeader title="Huisstijl" subtitle="Pas de merkkleuren en het beeld van ZekerFlex aan — zonder code." />

      <div className="mt-4 space-y-6">
        <BrandingEditor />

        <div className="rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Foto&apos;s &amp; beeld</p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
            De foto&apos;s op de site (hero, categorieën, marketing) beheer je in de Studio: genereren of uploaden en
            publiceren naar de juiste plek. Het logo en de app-iconen staan in <code>/public/icons</code>.
          </p>
          <Link href="/admin/studio" className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--a-accent, #0E5C4A)" }}>
            Naar de Studio (beeld) →
          </Link>
        </div>
      </div>
    </>
  );
}
