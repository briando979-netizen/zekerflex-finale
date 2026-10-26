import Link from "next/link";
import { requirePrincipal } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/app/ui";
import { SITE } from "@/lib/seo";
import { buildPassport } from "@/lib/passport/build";
import { passportToken } from "@/lib/passport/token";
import { isPassportPublic } from "@/lib/passport/share";
import { qrEncode, qrSvgPath } from "@/lib/qr/encode";
import { PassportShare } from "@/components/app/PassportShare";

export const dynamic = "force-dynamic";

function Qr({ url, size = 112 }: { url: string; size?: number }) {
  const m = qrEncode(url);
  const n = m.length + 8;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="QR-code" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrSvgPath(m, 4)} fill="#0C0E12" />
    </svg>
  );
}

export default async function MyPassportPage() {
  const principal = await requirePrincipal();
  const passport = await buildPassport(principal.userId);

  if (!passport) {
    return (
      <>
        <div className="mb-6">
          <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
            ← Terug
          </Link>
        </div>
        <PageHeader title="Werkpaspoort" subtitle="Je verifieerbare werkprofiel om overal te laten zien." />
        <EmptyState icon="🪪" title="Nog geen profiel" body="Een werkpaspoort is er zodra je als professional (zzp/flex/uitzend) bent geregistreerd." />
      </>
    );
  }

  const token = passportToken(principal.userId);
  const url = `${SITE.url}/paspoort/${token}`;
  const enabled = await isPassportPublic(principal.userId);
  const reliability = Math.round(passport.reliabilityScore * 100);

  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard/account" className="text-sm font-medium text-neutralx-500 hover:text-brand-600">
          ← Terug
        </Link>
      </div>
      <PageHeader
        title="Werkpaspoort"
        subtitle="Je verifieerbare werkprofiel: werkhistorie, vaardigheden en certificaten, met een echtheidszegel van ZekerFlex."
      />

      <div className="space-y-6">
        {/* preview */}
        <div className="rounded-2xl border border-neutralx-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl font-bold">{passport.fullName}</p>
              <p className="text-sm text-neutralx-500">
                {passport.kvkVerified ? `KVK geverifieerd · ${passport.kvkNumber}` : "Profiel in opbouw"}
              </p>
            </div>
            <span className="pill bg-brand-50 text-brand-700">★ {passport.badgeLevel}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Mini value={String(passport.shiftsCompleted)} label="diensten" />
            <Mini value={`${reliability}%`} label="betrouwbaar" />
            <Mini value={passport.rating.count > 0 ? `★ ${passport.rating.average}` : "—"} label={`${passport.rating.count} reviews`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {passport.skills.slice(0, 6).map((s) => (
              <span key={s.name} className="pill bg-neutralx-100 text-neutralx-700">{s.name}</span>
            ))}
            {passport.certificates.slice(0, 6).map((c, i) => (
              <span key={`c-${i}`} className="pill bg-brand-50 text-brand-700">✓ {c.label}</span>
            ))}
          </div>
        </div>

        <PassportShare initialEnabled={enabled} url={url} token={token} qr={<Qr url={url} />} />
      </div>
    </>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-neutralx-50 py-3">
      <div className="font-display text-lg font-bold text-brand-600">{value}</div>
      <div className="text-[11px] text-neutralx-500">{label}</div>
    </div>
  );
}
