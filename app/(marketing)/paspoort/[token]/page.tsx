import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SITE } from "@/lib/seo";
import { userIdFromToken } from "@/lib/passport/token";
import { isPassportPublic } from "@/lib/passport/share";
import { buildPassport, type Passport } from "@/lib/passport/build";
import { qrEncode, qrSvgPath } from "@/lib/qr/encode";

export const dynamic = "force-dynamic";

// Een gedeeld werkpaspoort is een niet-opvraagbare, niet-indexeerbare link: de
// professional kiest zelf met wie 'm deelt. Daarom robots noindex.
export const metadata: Metadata = {
  title: "Werkpaspoort — ZekerFlex",
  robots: { index: false, follow: false },
};

const BADGE: Record<string, { label: string; ring: string; text: string }> = {
  BRONZE: { label: "Brons", ring: "ring-amber-700/30", text: "text-amber-700" },
  SILVER: { label: "Zilver", ring: "ring-neutralx-400/40", text: "text-neutralx-500" },
  GOLD: { label: "Goud", ring: "ring-amber-400/40", text: "text-amber-500" },
  PLATINUM: { label: "Platina", ring: "ring-brand-300/50", text: "text-brand-600" },
};

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span className="inline-flex" aria-label={`${n} van 5 sterren`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" className={i <= full ? "text-amber-400" : "text-neutralx-300"}>
          <path fill="currentColor" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

function Qr({ url, size = 128 }: { url: string; size?: number }) {
  const m = qrEncode(url);
  const n = m.length + 8; // 4-module quiet zone each side
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="QR-code naar dit paspoort" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrSvgPath(m, 4)} fill="#0C0E12" />
    </svg>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-NL", { year: "numeric", month: "long" });
}

export default async function PassportPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const userId = userIdFromToken(token);
  if (!userId) notFound();
  if (!(await isPassportPublic(userId))) notFound();
  const p: Passport | null = await buildPassport(userId);
  if (!p) notFound();

  const url = `${SITE.url}/paspoort/${token}`;
  const badge = BADGE[p.badgeLevel] ?? BADGE.BRONZE!;
  const reliability = Math.round(p.reliabilityScore * 100);

  return (
    <div className="bg-paper-soft">
      <div className="shell-4k max-w-3xl py-14 lg:py-20">
        {/* header card */}
        <div className="card overflow-hidden">
          <div className="hero-ink relative isolate overflow-hidden px-7 py-8 text-white">
            <div className="aurora opacity-50" aria-hidden />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-brand-mint">Geverifieerd werkpaspoort</p>
                <h1 className="mt-2 font-display text-3xl font-bold">{p.fullName}</h1>
                <p className="mt-1 text-sm text-white/70">
                  Flexprofessional bij ZekerFlex sinds {fmtDate(p.memberSince)}
                </p>
              </div>
              <span className={`pill bg-white/10 text-sm font-semibold ${badge.text}`}>★ {badge.label}</span>
            </div>

            <div className="relative mt-6 flex flex-wrap gap-2 text-xs">
              {p.kvkVerified && (
                <span className="pill bg-[rgba(79,224,160,0.16)] text-brand-mint">✓ KVK geverifieerd · {p.kvkNumber}</span>
              )}
              <span className="pill bg-white/10 text-white/80">{p.country}</span>
              {p.rating.count > 0 && (
                <span className="pill bg-white/10 text-white/80">★ {p.rating.average} ({p.rating.count} reviews)</span>
              )}
            </div>
          </div>

          {/* stats */}
          <div className="grid grid-cols-3 divide-x divide-neutralx-200 border-b border-neutralx-200 text-center">
            <Stat value={String(p.shiftsCompleted)} label="diensten afgerond" />
            <Stat value={`${reliability}%`} label="betrouwbaarheid" />
            <Stat value={String(p.certificates.length)} label="geldige certificaten" />
          </div>

          <div className="space-y-8 p-7">
            {/* rating */}
            {p.rating.count > 0 && (
              <section>
                <div className="flex items-center gap-3">
                  <Stars n={p.rating.average} />
                  <span className="text-sm text-neutralx-600">
                    {p.rating.average} gemiddeld over {p.rating.count} beoordelingen
                  </span>
                </div>
              </section>
            )}

            {/* skills */}
            {p.skills.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-semibold">Vaardigheden</h2>
                <div className="mt-3 space-y-2.5">
                  {p.skills.map((s) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="w-40 flex-shrink-0 truncate text-sm font-medium">{s.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutralx-200">
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(s.rating / 5) * 100}%` }} />
                      </span>
                      <span className="w-24 flex-shrink-0 text-right text-xs text-neutralx-500">
                        {s.rating > 0 ? `★ ${s.rating}` : "—"} · {s.shiftsWorked}×
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* certificates */}
            {p.certificates.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-semibold">Certificaten</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {p.certificates.map((c, i) => (
                    <li key={`${c.label}-${i}`} className="flex items-start gap-2.5 rounded-xl border border-neutralx-200 bg-white p-3">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">✓</span>
                      <span>
                        <span className="block text-sm font-medium">{c.label}</span>
                        <span className="block text-xs text-neutralx-500">
                          {c.number ? `Nr. ${c.number}` : "Geverifieerd"}
                          {c.expiresOn ? ` · geldig t/m ${fmtDate(c.expiresOn)}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* reviews */}
            {p.reviews.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-semibold">Wat opdrachtgevers zeggen</h2>
                <div className="mt-3 space-y-3">
                  {p.reviews.map((r, i) => (
                    <figure key={i} className="rounded-xl border border-neutralx-200 bg-white p-4">
                      <Stars n={r.rating} />
                      <blockquote className="mt-2 text-sm leading-relaxed text-neutralx-700">&ldquo;{r.text}&rdquo;</blockquote>
                      {r.shiftTitle && <figcaption className="mt-1 text-xs text-neutralx-400">{r.shiftTitle}</figcaption>}
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* seal */}
            <section className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5">
              <div className="flex flex-wrap items-center gap-5">
                <Qr url={url} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-display font-semibold text-brand-700">
                    <span aria-hidden>🔒</span> Authenticiteit bevestigd door ZekerFlex
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-neutralx-600">
                    Dit paspoort draagt een geavanceerd elektronisch zegel. Scan de QR om deze pagina opnieuw te openen,
                    of controleer de echtheid machinaal.
                  </p>
                  <dl className="mt-3 space-y-0.5 font-mono text-[11px] text-neutralx-500">
                    <div>Referentie: {p.seal.reference}</div>
                    <div className="truncate">Inhoudshash: {p.seal.contentHash.slice(0, 32)}…</div>
                    <div>Verzegeld: {new Date(p.seal.sealedAt).toLocaleString("nl-NL")}</div>
                  </dl>
                  <Link href={`/paspoort/${token}/verify`} className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
                    Verifieer via API →
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutralx-400">
          Werkpaspoort uitgegeven door <Link href="/" className="font-medium text-brand-600 hover:underline">ZekerFlex</Link> ·
          gegevens zijn geverifieerd en in beheer van de professional zelf.
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-3 py-5">
      <div className="font-display text-2xl font-bold text-brand-600">{value}</div>
      <div className="mt-1 text-xs text-neutralx-500">{label}</div>
    </div>
  );
}
