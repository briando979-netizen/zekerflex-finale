# Marketing explainer videos

The `.mp4` files in this folder are **not tracked in git** (`.gitignore`:
`public/videos/*.mp4`) — ~42 MB of binaries that only ever served the `/uitleg`
marketing page. The poster `.jpg` files **are** tracked (a few KB each) and are
what the page falls back to.

> The blobs are still in the pre-2026-09 history. To purge them and shrink
> `.git` for good (a coordinated force-push — it rewrites every branch, so run
> it when open PRs are quiet):
>
> ```bash
> git filter-repo --path-glob 'public/videos/*.mp4' --invert-paths
> git push --force-with-lease origin --all
> ```

## How the page behaves

`app/(marketing)/uitleg/page.tsx` checks `existsSync()` per slug and only
renders a `<video>` when the file is present; otherwise it shows a
"Video komt binnenkort" placeholder over the poster. So a fresh clone builds
and runs fine with no videos.

## Local dev

Drop the `.mp4` files in here (regenerate with `scripts/make-uitleg-videos.py`
/ the Video Studio under `studio/`, or copy them from a teammate / the
production bucket). Expected slugs:

- `wat-is-zekerflex.mp4`
- `klus-plaatsen.mp4`
- `uitzenden-of-freelance.mp4`
- `uren-goedkeuren.mp4`
- `kosten-en-facturen.mp4`
- `zekerflex-uitleg-compleet.mp4` (the full ~3.5 min cut)

## Production (Sovereign Box)

Serve these from object storage / CDN, not the app container:

1. Upload the six files to the storage bucket (same one used for uploads/backups)
   under a `videos/` prefix.
2. Put the CDN/bucket base URL in `NEXT_PUBLIC_VIDEO_BASE_URL` and have the
   `/uitleg` page use it when set (falls back to `/videos/<slug>.mp4` for local
   dev). *(follow-up: the page still reads from `/public` — wire the env var
   when the bucket exists.)*
3. Keep the deploy image lean — do not `COPY public/videos/*.mp4` into it.
