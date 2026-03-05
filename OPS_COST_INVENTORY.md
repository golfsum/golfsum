# GolfSum Ops / Cost Inventory
Last updated: February 27, 2026

## Production Services
| Service | What It Powers | Cost Driver | Environment Variables | Code References | Billing Status |
|---|---|---|---|---|---|
| Firebase (Auth + Firestore) | User auth, cloud sync, admin APIs | Auth MAU + Firestore reads/writes/storage | `EXPO_PUBLIC_FIREBASE_*`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY` | `src/services/firebase.ts`, `website/api/admin-dashboard.js`, `website/api/admin-user-rounds.js` | Potentially paid (usage-based) |
| Golf Course API (`api.golfcourseapi.com`) | Course search + canonical course details | API request volume | `EXPO_PUBLIC_GOLF_COURSE_API_KEY` | `src/services/golfCourseApiService.ts` | Free tier + paid overage |
| RevenueCat | Subscription entitlements / paywall | Active subscribers + API usage | `EXPO_PUBLIC_RC_*`, `EXPO_PUBLIC_REVENUECAT_*` | `src/services/billingService.ts` | Paid service |
| App Store / Play Billing | Actual subscription transactions | Subscriber revenue share/store fees | Product IDs configured via RevenueCat env | `src/services/billingService.ts` | Paid platform fees |
| OCR Backend (GolfSum-hosted) | Scorecard image parse proxy target | Hosting + OCR traffic volume | `OCR_BACKEND_URL`, `OCR_API_KEY`, `EXPO_PUBLIC_SCORECARD_OCR_URL` | `website/api/ocr.js`, `src/services/scorecardOcrService.ts`, `backend/scorecard_ocr/README.md` | Paid (hosting + model usage) |
| Gemini (Vision/OCR model) | OCR model inference in backend | Tokens/inference volume | Backend provider key (see OCR backend env) | `backend/scorecard_ocr/README.md` | Paid usage model |
| Vercel (Hosting + Serverless) | Website + API routes | Invocations, bandwidth, execution time | Vercel project env config | `website/api/*.js` | Free tier + paid overage |
| Vercel Postgres | OCR rate-limit persistence + analytics storage | DB storage + query volume | Vercel Postgres integration env | `website/api/ocr.js`, `website/api/analytics-*.js`, `website/package.json` | Free tier + paid overage |
| Vercel Analytics | Website analytics | Events/page volume | Vercel project config | `website/package.json` | Free tier + paid overage |
| Expo EAS (Build/Submit/Updates) | CI builds + release pipeline | Build minutes, plan tier | EAS project config | `eas.json` | Free tier + paid plans |

## External Services (Usually No Direct Cost)
| Service | What It Powers | Notes | Code References |
|---|---|---|---|
| Open-Meteo | Weather + elevation lookups | No key currently required | `src/services/weatherService.ts` |
| OpenStreetMap/Nominatim-style data | Nearby/search fallback course discovery | Public endpoint policy/limits apply | `src/services/openStreetMapService.ts`, `src/components/CourseSearchScreen.tsx` |
| Google OAuth | Google sign-in | Usually no direct OAuth cost | `src/hooks/useGoogleAuth.ts` |
| Apple Sign-in | Apple auth | Usually no direct API cost | `src/hooks/useAppleAuth.ts` |

## Clarifications
- `Expo Go` is a dev runtime tool and is not the paid part.
- `Expo EAS` is the potentially paid Expo service.

## Environment Variable Groups To Audit
- Mobile app: `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_GOLF_COURSE_API_KEY`, `EXPO_PUBLIC_SCORECARD_OCR_URL`, `EXPO_PUBLIC_RC_*`, `EXPO_PUBLIC_REVENUECAT_*`, `EXPO_PUBLIC_GOOGLE_*`
- Website/serverless: `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `GS_ALLOWED_ORIGINS`, `OCR_BACKEND_URL`, `OCR_API_KEY`, `GS_API_SIGNING_SECRET`, `ANALYTICS_DRAIN_SECRET`

## Ownership + Ops Metadata (Fill In)
| Service | Owner | Console URL | Budget Alert | Renewal/Billing Contact | Status |
|---|---|---|---|---|---|
| Firebase | TBD | TBD | TBD | TBD | TBD |
| Golf Course API | TBD | TBD | TBD | TBD | TBD |
| RevenueCat | TBD | TBD | TBD | TBD | TBD |
| Vercel | TBD | TBD | TBD | TBD | TBD |
| OCR Backend / Gemini | TBD | TBD | TBD | TBD | TBD |
| Expo EAS | TBD | TBD | TBD | TBD | TBD |

