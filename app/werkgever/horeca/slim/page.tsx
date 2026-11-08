import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Slim Management" };
export const dynamic = "force-dynamic";

export default function HorecaSlimPage() {
  return (
    <>
      <PageHeader title="Slim Management" subtitle="AI-gestuurde inzichten en aanbevelingen" />
      <div className="space-y-4">
        <div className="card p-6">
          <h3 className="font-semibold text-ink mb-4">Automatische aanbevelingen</h3>
          <div className="space-y-2">
            <div className="rounded-lg border border-hair p-3">
              <p className="text-sm font-semibold">Rustige uren</p>
              <p className="text-xs text-neutralx-600 mt-1">Maandag 14:00-16:00 is rustig - ideaal voor schoonmaak</p>
            </div>
            <div className="rounded-lg border border-hair p-3">
              <p className="text-sm font-semibold">Populaire combinaties</p>
              <p className="text-xs text-neutralx-600 mt-1">Pizza + bier zijn populair samen</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
