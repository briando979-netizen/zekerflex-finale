import { TenancyBoard } from "@/components/admin/TenancyBoard";

export const dynamic = "force-dynamic";

export default function AdminTenantsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Klanten &amp; white-label</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Host andere bureaus onder je platform: koppel per klant een host (subdomein of eigen domein) aan hun tenant en merk.
          Dit is de fundering (host → tenant + branding). De volgende stappen — branding automatisch toepassen per host en data per
          tenant afschermen — bouwen hierop voort.
        </p>
      </div>
      <TenancyBoard />
    </div>
  );
}
