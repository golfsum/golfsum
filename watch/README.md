# GolfSum Watch Interface

This folder contains a watchOS SwiftUI interface for live hole entry using GolfSum colors.

## Included Screens

- `HoleEntryView`
  - Current hole number
  - Par for the hole
  - Score entry (Digital Crown adjustable)
  - Putt entry (Digital Crown adjustable)
  - FIR toggle (Yes/No)
  - GIR toggle (Yes/No)
  - `Save Hole` button
  - `End Round` button on the last hole

- `RunningTotalsView`
  - Score vs Par
  - Total putts
  - Holes completed

## Sync Behavior

Sync uses `WatchConnectivity`:

- On `Save Hole`: sends `type = hole_saved`
- On `End Round`: sends `type = end_round`

Message payload keys:

- `roundId` (String)
- `holeNumber` (Int)
- `par` (Int)
- `score` (Int)
- `putts` (Int)
- `fir` (Bool?)
- `gir` (Bool?)
- `scoreToPar` (Int)
- `totalPutts` (Int)
- `holesCompleted` (Int)
- `savedAt` (TimeInterval)

## Integration Notes

1. Create a watchOS target in Xcode (Watch App + Watch Extension).
2. Copy files from this folder into that target.
3. Add iPhone React Native bridge files from `watch/ios-bridge/` into the iOS app target:
   - `GolfSumWatchBridge.swift`
   - `GolfSumWatchBridge.m`
4. Ensure your iOS target has a Swift bridging header setup for React Native native modules.
5. The JS receiver is already implemented in:
   - `src/services/watchBridgeService.ts`
   - initialized in `AppRoot.tsx`
6. Incoming watch events are queued and also applied to in-progress round state.
7. `end_round` sets a flag so the iPhone app can prompt completion.
8. Send initial hole data from iPhone to watch using `updateApplicationContext` with:
   - `roundId`
   - `holes: [[number: Int, par: Int]]`
