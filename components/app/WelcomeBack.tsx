/**
 * "Welkom terug, <voornaam>" — shown at the top of each role's dashboard once
 * you're logged in. Server component: pass the principal's full name; it renders
 * the first name only. Subtle by design — a greeting, not a banner.
 */
export function WelcomeBack({ name }: { name: string | null | undefined }) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return (
    <p className="mb-4 text-sm font-medium text-neutralx-500">
      Welkom terug{first ? <>, <span className="text-ink">{first}</span></> : null} 👋
    </p>
  );
}
