# Accessibility (WCAG 2.1 AA)

Target: **WCAG 2.1 level AA**. The app is Dutch-facing and used for work
administration, so keyboard operability, form labelling and colour contrast
are the load-bearing criteria.

## Automated gate

`npm run test:a11y` — a Playwright project ([e2e/a11y.spec.ts](../e2e/a11y.spec.ts))
that runs `axe-core` against:

- public: `/`, `/voor-bedrijven`, `/voor-freelancers`, `/uitzendbureau`,
  `/login`, `/register`, `/status`
- authenticated: freelancer dashboard, employer `/werkgever`, admin `/admin`

Rules: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.

**Acceptance criterion (enforced by the gate):** zero violations at impact
**serious** or **critical** — colour-contrast included — on every page listed
above. `moderate` / `minor` print as `[a11y advisory]`: track, don't regress.
Run with `A11Y_VERBOSE=1` to print the failing selectors.

axe catches ~30–40 % of WCAG issues (missing names/roles/alt text, ARIA
misuse, contrast, landmark & heading order, duplicate ids). The rest needs the
manual pass below.

### Contrast pass (done)

The palette had muted-text tokens just under 4.5:1. Changed:

| Token / pattern | Was | Now | Where |
|---|---|---|---|
| `neutralx.400` (muted body/metadata text, sitewide) | `#8A93A0` | `#6B7280` | `tailwind.config.ts` |
| dark-band secondary text | `text-white/35…/45` | `/60`–`/65` | `app/(marketing)/*`, `components/marketing/*` |
| admin `--a-mute` | `#8B96A8` | `#5F6774` | `app/globals.css .admin-scope` |
| admin green micro-labels on tinted cards | `--a-accent` `#10B981` (2.3:1) | new `--a-accent-ink` `#0B6E54` | `app/globals.css`, `ControlCenter.tsx` |
| uitzend CTA button / chip | white on `#FF7A1A` (2.6:1) | `#231400` on `#FF7A1A` (7:1) — bright orange kept, text darkened | `UitzendJobBoard.tsx` |

Large orange-on-dark headline accents (`text-[#ff7a1a]` in an `<h1>`) were
left — they clear the 3:1 large-text bar.

## Manual checklist (per release touching UI)

- [ ] **Keyboard only**: tab through login → dashboard → create a shift →
      approve a timesheet. Every control reachable, visible focus ring, no
      trap, logical order. `Esc` closes dialogs/sheets.
- [ ] **Focus management**: opening the bottom sheet / modal moves focus in;
      closing returns it to the trigger.
- [ ] **Screen reader smoke** (NVDA on Windows or VoiceOver): the three role
      dashboards announce a page title, landmarks (`nav`, `main`), and form
      fields with their labels + error text.
- [ ] **Contrast**: new colours checked ≥ 4.5:1 (text) / 3:1 (large text, UI
      borders) against the design tokens.
- [ ] **Zoom / reflow**: 200 % browser zoom and 320 px width — no horizontal
      scroll, nothing clipped.
- [ ] **Motion**: `prefers-reduced-motion` respected by any new animation.
- [ ] **Forms**: errors are text (not colour-only), associated with the field
      via `aria-describedby`, and announced on submit.
- [ ] **Images / icons**: informative ones have `alt`; decorative ones have
      `alt=""` or `aria-hidden`.

## Known gaps

- The marketing video player (`/uitleg`) needs captions on the source `.mp4`s
  before it's AA for media — tracked in `public/videos/README.md`.
- No formal audit by an external accessibility specialist yet; the above is
  the internal bar.
