# GolfSum Watch + iPhone bridge

## What actually ships (Expo / EAS)

Prebuild uses **`withWatchApp.js`**:

| Source | Destination |
|--------|-------------|
| **`watch-src/`** (`GolfSumWatchApp.swift`, `ContentView.swift`, `WatchSessionManager.swift`) | `targets/watch/` → Watch companion target |
| **`watch-shared/`** (`ActiveRound.swift`, `SharedRoundStore.swift`) | Watch target + main iOS app (app group) |
| **`watch/ios-bridge/`** (`GolfSumWatchBridge.*`, phone `WatchSessionManager.swift`) | Main iOS app (React Native native module + `WCSession`) |

The **`watch/`** tree is **not** a second Watch app: only **`watch/ios-bridge/`** is consumed by the build. All Watch UI and watch-side `WCSession` live under **`watch-src/`**.

## iPhone side (JS)

- `src/services/watchBridgeService.ts` — events + `updateWatchGpsContext`
- `AppRoot.tsx` — `initializeWatchReceiver`, start round from Watch, etc.

## Legacy scorecard sync (`hole_saved` / `end_round`)

Older docs referred to a separate SwiftUI score-entry flow; the current product Watch surface is **`watch-src/ContentView.swift`** (yardages, shot commands, finish round). Queued watch events and `watchBridgeService` types still support `hole_saved` / `end_round` for compatibility.
