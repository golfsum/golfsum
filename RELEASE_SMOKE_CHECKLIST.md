# Release Smoke Checklist (TestFlight)

Use this on every candidate build before App Store submission.

## 0) Preflight
- Confirm build/version in app matches release candidate.
- Confirm environment is production-like (Firebase project, API keys, RevenueCat config).
- Test on:
  - 1 new install account
  - 1 returning account with existing rounds/imports

## 1) Startup + Onboarding
- App launches without crash from fresh install.
- No hook/render errors.
- Login/signup works (or guest flow works if intended).

## 2) In-Round Scoring (Manual)
- Start round and select course/tee successfully.
- Save Hole 1 with score + putts:
  - Round Progress updates score, to-par, and putts immediately.
- Par-3 hole:
  - No FIR tracking interaction shown as active.
  - Par-3 FIR hint appears (`—` + explanatory text).
- Complete and save round:
  - Round appears in History with correct score/stats.

## 3) History + Compare (2–4 rounds)
- Enter compare mode, select 2 rounds, open compare sheet.
- Verify bottom sheet behavior:
  - Spring entry animation
  - Swipe-down dismissal
  - Legend rows render (R1–R4 color mapping)
- Verify stat cards:
  - Score, Score vs Par, FIR, GIR, Putts, Up & Down render
  - Deltas color correctly (lower-better vs higher-better metrics)
  - Best-value highlight appears
- Select 4 rounds:
  - Remaining selectors are greyed out
  - “Maximum 4 rounds” hint appears on blocked tap
- AI summary card:
  - Shows loading skeleton then summary
  - On timeout/failure, fallback text appears (no error UI)

## 4) OCR Import Flow
- Open import screen without photo:
  - Save CTA disabled
  - Label indicates scanning required
- After valid extraction:
  - Save CTA enables only when score extraction is complete
- Save imported round:
  - History card shows extracted stats when available (not putts-only)
  - FIR excludes par-3 holes in totals
  - Player name prefill behavior is correct

## 5) Profile / Subscription / Gating
- Free account with exhausted trial:
  - Premium features are locked where expected
- Active Pro account:
  - Premium features accessible
- Lapsed Pro behavior matches intended fallback/trial rules.

## 6) Admin / Web Backoffice (if shipping with backend changes)
- `/api/admin-dashboard` returns users + `roundCounts`.
- User detail loads rounds on-demand via `/api/admin-user-rounds`.
- No auth/origin/rate-limit regressions.

## 7) Stability + Performance
- No red screens in 15+ minutes of mixed usage.
- No obvious frame drops on History compare sheet open/close.
- Pull-to-refresh and navigation between tabs remain responsive.

## 8) Final Release Gate
- Run locally before sign-off:
  - `npx tsc --noEmit`
  - `npm test -- --runInBand`
- Confirm:
  - All smoke checks pass
  - No P0/P1 known issues
  - Crash-free sanity run on both iOS devices tested

---

## Sign-off template
- Build:
- Date:
- Tester:
- Result: PASS / FAIL
- Notes:

