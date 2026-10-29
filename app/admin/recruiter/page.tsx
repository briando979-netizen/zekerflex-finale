import { RecruiterConsole } from "@/components/admin/RecruiterConsole";

export const dynamic = "force-dynamic";

export default function AdminRecruiterPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">AI-recruiter</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Sourcet kandidaten uit je eigen pool, rangschikt ze met uitleg en certificaten, en schrijft met je eigen AI een
          persoonlijk concept-bericht per kandidaat. Jij houdt de controle: de AI stelt voor, jij kiest en verstuurt — er gaan
          geen gegevens naar een externe dienst en er zijn geen kosten per intake.
        </p>
      </div>
      <RecruiterConsole />
    </div>
  );
}
