# Build Verification Checklist

**Status:** 🟡 In Progress (npm install running)  
**Last Updated:** 8 November 2026

---

## Step 1: Clean Install ✅ RUNNING

```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**When complete:**
- ✅ All dependencies installed
- ✅ `node_modules/.bin/` populated
- ✅ Playwright browsers available

---

## Step 2: Prisma Generate (Next)

```bash
npx prisma generate
```

**Expectation:**
- ✅ `node_modules/.prisma/client/` created
- ✅ No type errors

---

## Step 3: Type Check (Next)

```bash
npx tsc --noEmit -p .
```

**Expectation:**
- ✅ 0 errors
- ✅ 0 warnings (strict mode)

---

## Step 4: Unit Tests (Next)

```bash
npx vitest run
```

**Expectation:**
- ✅ All tests pass
- ✅ No skipped tests (require explanation)

---

## Step 5: Production Build (Next)

```bash
npx next build
```

**Expectation:**
- ✅ `.next/` directory created
- ✅ `public/` assets bundled
- ✅ API routes compiled
- ✅ No warnings about missing env vars

**Output shows:**
```
Route (app)                              Size     First Load JS
...
✓ All routes compiled successfully
```

---

## Step 6: Browser Tests (On CI only)

```bash
# Requires Docker + live database
npx playwright test e2e/flows.spec.ts
```

**Expectation:**
- ✅ Sign-up flow works
- ✅ Shift posting works
- ✅ Worker application works
- ✅ Timesheet approval works
- ✅ Invoice generation works
- ✅ Payment webhook works

---

## Step 7: CI Pipeline Verification

Check GitHub Actions:
- ✅ Latest commit shows green checkmark
- ✅ All jobs passed
- ✅ E2E tests passed
- ✅ Build artifact available

```
https://github.com/briando979-netizen/zekerflex-finale/actions
```

---

## Failure Recovery

If any step fails:

| Step | Error | Action |
|------|-------|--------|
| Install | EPERM on .dll | Use `--force` or clean workspace |
| Prisma | Schema invalid | Check `prisma/schema.prisma` syntax |
| TypeScript | Type errors | Run `npx tsc --noEmit` locally, fix |
| Vitest | Test failures | Debug test, check `tests/` setup |
| Build | Next.js error | Check `.env.production` vars, logs |
| E2E | Timeout | Database/Redis down? Check Docker |

---

## Evidence of Success (save for audit)

When all steps pass, capture:

```bash
# Save build output
npx next build > build-output.txt 2>&1
tsc --noEmit > typecheck.txt 2>&1
vitest run > test-output.txt 2>&1

# Git info
git log --oneline -1 > commit.txt
git status > status.txt

# Upload to audit folder
mkdir -p audit/2026-11-08
cp build-output.txt typecheck.txt test-output.txt commit.txt audit/2026-11-08/
```

---

**Target:** All 7 steps green by **end of day (8 Nov)**
