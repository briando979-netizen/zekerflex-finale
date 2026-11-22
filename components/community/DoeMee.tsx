import Link from "next/link";

/**
 * Voor een bezoeker zonder account: lezen kan, meedoen met een gratis account. Inloggen komt terug op deze pagina
 * (callbackUrl, zoals elders); na het aanmelden begint iemand eerst in zijn eigen app.
 */
export function DoeMee({ terug, tekst }: { terug: string; tekst?: string }) {
  return (
    <div className="rounded-2xl border border-hair bg-paper-soft p-5 md:p-6">
      <Link href={`/login?callbackUrl=${encodeURIComponent(terug)}`} className="btn-primary">
        Doe mee: log in of meld je gratis aan
      </Link>
      <p className="mt-3 text-sm leading-relaxed text-neutralx-600">
        {tekst ?? "Lezen kan iedereen. Een onderwerp starten, reageren en foto's delen kan met een gratis ZekerFlex-account, als werker of als bedrijf."}{" "}
        <Link href="/register" className="font-semibold text-ink underline underline-offset-2">
          Nog geen account? Meld je gratis aan
        </Link>
        .
      </p>
    </div>
  );
}
