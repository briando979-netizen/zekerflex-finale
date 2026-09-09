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

**Acceptance criterion (enforced by the gate):**

- zero **critical** violations;
- zero **serious** violations *other than* `color-contrast`;
- `color-contrast` (serious) is a tracked debt — see below. Each run prints
  `[a11y contrast-debt] <page>: N node(s)`; that N must only go down.
- `moderate` / `minor` print as `[a11y advisory]` — track, don't regress.

axe catches ~30–40 % of WCAG issues (missing names/roles/alt text, ARIA
misuse, contrast, landmark & heading order, duplicate ids). The rest needs the
manual pass below.

### Colour-contrast debt (burn-down)

The marketing palette has muted-text tokens that land just under the 4.5:1 AA
threshold for normal text. None are on primary content; all are secondary /
metadata text. To clear:

| Token / pattern | Now | Needs | Where |
|---|---|---|---|
| `neutralx.400` | `#8A93A0` (~3.5:1 on paper) | ≥ `#6B7280` | `tailwind.config.ts` — muted body/metadata text sitewide |
| `text-white/35…/55` on the dark bands (`#0A0C10`–`#1B1C20`) | 3.5–4.4:1 | `text-white/65` min | `app/(marketing)/*`, `components/marketing/*` (~31 sites) |
| `--a-mute` / `--a-dim` | `#8B96A8` / `#5D6A80` | darken `--a-mute` to ~`#6B7688` | `app/globals.css` `.admin-scope` |
| success-green pills | `#10B981` on pastel, 11 px | `#0F7A55` or larger text | badge components |
| primary CTA button | `#FFF` on `#FF7A1A` (2.6:1) | **brand decision** — darker orange (`#C2410C`) or dark text on orange | `.btn-primary` / `.btn-mint` |

The CTA-button row needs a visual/brand call; the rest is a mechanical token
pass. Until done, these show as `[a11y contrast-debt]` and don't fail the gate.

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
