import Link from "next/link";

/**
 * Landing page Didit redirects the freelancer back to after the hosted flow.
 * The actual decision arrives via webhook; this page just reassures the user
 * and lets them re-check their status.
 */
export default function KycCallbackPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status ?? "submitted";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">
        Verificatie ontvangen
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Je identiteitsverificatie is ingediend
        {status ? ` (status: ${status})` : ""}. We werken je profiel automatisch
        bij zodra Didit de beoordeling heeft afgerond — meestal binnen enkele
        minuten.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Terug naar dashboard
      </Link>
    </main>
  );
}
