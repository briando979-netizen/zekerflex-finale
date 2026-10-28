import type { Metadata } from "next";
import { Section, SectionHead, CtaBand } from "@/components/marketing/primitives";
import { Photo } from "@/components/marketing/Photo";
import { SceneTeam } from "@/components/marketing/Scene";
import { canonical } from "@/lib/seo";

// English-aliased path to the same real "about us" content as /over-ons, for
// agents/tools that specifically look for an /about page. Canonical points at
// /over-ons (the primary, linked-from-nav version) so this isn't indexed as a
// separate duplicate.
const TITLE = "About ZekerFlex";
const DESCRIPTION =
  "A platform for flexible work in the Netherlands. Who we are and why we're building ZekerFlex.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Canonical points at /over-ons (the primary, nav-linked version of this
  // content) so this English-aliased path isn't indexed as a duplicate.
  ...canonical("/over-ons", { title: TITLE, description: DESCRIPTION }),
};

export default function AboutPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">About us</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Flexible work should be fair, fast and secure.
          </h1>
          <div className="mt-10">
            <Photo name="team" fallback={<SceneTeam />} className="shadow-lift" />
          </div>
        </div>
      </div>

      <Section tone="paper">
        <div className="max-w-2xl space-y-5 text-[1.05rem] leading-relaxed text-ink-soft">
          <p>
            ZekerFlex grew out of a simple frustration: flexible work in the
            Netherlands had become cumbersome. Independent contractors (zzp&apos;ers)
            waited weeks for their money and drowned in invoices. Employers
            struggled with staffing and carried Wet DBA compliance risk. And
            between both sides stood a growing number of intermediaries mostly
            serving themselves.
          </p>
          <p>
            We&apos;re building the alternative: one system that makes the match,
            arranges the agreement, processes the hours, drafts the invoices,
            and lets the worker choose how fast they get paid — with compliance
            built in rather than bolted on.
          </p>
          <p>
            ZekerFlex is built for the Dutch labor market. We use specialized
            providers for hosting, payments, email and identity checks. Our AI
            assistant can run on an independently operated model server. See
            our privacy policy for details about data use and service providers.
          </p>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="What we stand for" title="Three principles" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { t: "Independent", b: "No intermediaries profiting from both sides. One transparent fee, nothing else." },
            { t: "Secure", b: "Compliance, verification and an audit trail aren't add-ons — they're built into the core product." },
            { t: "Transparent", b: "We explain what data we process and which service providers help deliver the platform." },
          ].map((v) => (
            <div key={v.t} className="card p-6">
              <h3 className="font-display text-lg font-semibold">{v.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{v.b}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand title="Join us" body="As a freelancer or as an employer — signing up is free." />
    </>
  );
}
