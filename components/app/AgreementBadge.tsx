export function AgreementBadge({
  status,
  freelancerSigned,
  clientSigned,
}: {
  status: string;
  freelancerSigned: boolean;
  clientSigned: boolean;
}) {
  const active = status === "ACTIVE" || (freelancerSigned && clientSigned);
  const label = active
    ? "Actief · beide getekend"
    : freelancerSigned
      ? "Wacht op opdrachtgever"
      : clientSigned
        ? "Jij moet nog tekenen"
        : "Klaar om te tekenen";
  const cls = active
    ? "bg-ok/10 text-ok"
    : freelancerSigned
      ? "bg-warn/10 text-warn"
      : "bg-brand-50 text-brand-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {active ? "✓" : "•"} {label}
    </span>
  );
}
