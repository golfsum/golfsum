GolfSum
Round Analysis Expansion
Product Codex v1.1
March 2026

Product: GolfSum iOS
Areas: Averages tab, Insights tab, Round Analysis > Coaching
Status: Spec for production build
Depends on: persisted GPS shot log, saved round history, course cache metadata

1. Purpose
This v1.1 expands GolfSum from hole-summary analytics into true shot-based coaching. The goal is to use GPS-collected shot data to make Averages, Insights, and Coaching more specific, repeatable, and useful without any AI generation.

All copy remains deterministic and coach-like. No generative text, no LLM dependency, no “AI insight” labels.

2. Core Principle
Every new card must satisfy one of these:

- show a stable average from GPS shot data
- show a repeatable miss pattern with a minimum sample
- show a decision-quality pattern tied to score outcome
- show a lie-adjusted or condition-adjusted performance split

If the sample is too small, the card does not render.

3. Required Data Model Additions
Persist full GPS shot logs inside each saved round.

Path: users/{uid}/rounds/{roundId}

Add:

```ts
interface RoundGpsShot {
  id: string
  holeNumber: number
  shotNumber: number
  club: 'dr' | '3w' | '5i' | '6i' | '7i' | '8i' | '9i' | 'pw' | 'gw' | 'sw'
  clubLabel: string
  lie: 'Tee Box' | 'Fairway' | 'Left Rough' | 'Right Rough' | 'Sand' | 'Green' | 'Trees' | 'Water'
  dist: number | null
  adj: number | null
  sx: number | null
  sy: number | null
  tx: number | null
  ty: number | null
  lat: number | null
  lng: number | null
  targetLat: number | null
  targetLng: number | null
  windMph: number | null
  windDegrees: number | null
  tempF: number | null
  humidity: number | null
  elevationFt: number | null
  tournamentMode: boolean
  holePar: number
  dogleg: 'right' | 'left' | 'straight'
  resultLie: 'Fairway' | 'Left Rough' | 'Right Rough' | 'Sand' | 'Green' | 'Trees' | 'Water' | null
  greenResult: 'hit' | 'short' | 'long' | 'left' | 'right' | null
  fairwayResult: 'hit' | 'left' | 'right' | null
  isApproach: boolean
  isTeeShot: boolean
  isLayup: boolean
  isRecovery: boolean
  isPenalty: boolean
  createdAt: number
}
```

Add to round:

```ts
interface SavedRound {
  gpsShots?: RoundGpsShot[]
  gpsShotCount?: number
  analysisVersion?: number
  roundStartedAt?: number
  roundEndedAt?: number
  roundDurationMinutes?: number
}
```

Rules:
- gpsShots is the source of truth for shot-based analytics
- holes[] remains for score summary and legacy compatibility
- if gpsShots missing, v1.1 cards degrade cleanly
- roundStartedAt is set when the round actually begins
- roundEndedAt is set when the round is ended and saved
- roundDurationMinutes is persisted elapsed play time in whole minutes

4. Play Time
Round Analysis should include play time as a first-class stat.

4.1 Purpose
Play time gives the player useful round context and creates a base for future pace-of-play coaching.

4.2 Data Source
- roundStartedAt
- roundEndedAt
- roundDurationMinutes

4.3 Calculation Rules
```ts
const roundDurationMinutes =
  savedValue ??
  Math.max(1, Math.round((roundEndedAt - roundStartedAt) / 60000))
```

If no valid timing fields exist, Play Time does not render as coaching content and shows as unavailable in summary UI.

4.4 UI Placement
Play time appears in two places on Round Analysis:

- nav subtitle line: `Mar 10, 2026 • 4h 18m`
- round overview grid cell:
  - label: `PLAY TIME`
  - value: `4h 18m`

4.5 Format Rules
- under 60 minutes: `52m`
- exact hours: `4h`
- mixed: `4h 18m`

4.6 Future Coaching Hooks
Play time is not initially scored as good or bad, but should support later deterministic coaching:

- 18 holes over 5h 15m: pace slipped
- back 9 much slower than front 9: finish routine slowed down
- stable score with efficient round time: strong pace discipline

5. Averages Tab v1.1
The Averages tab remains a stable, reference-style analytics tab. It should answer: “What are my normal numbers?”

5.1 Section Order
1. Distance Engine Summary
2. Club Averages by Lie
3. Club Miss Pattern
4. Tee Club Performance
5. Scoring Distance Bands
6. Conditions Splits

5.2 Card: Distance Engine Summary
Purpose: show how much playing distance differs from raw GPS.

Render if: gpsShots >= 12 and adj != null on at least 8 shots

Cells:
- AVG GPS
- AVG PLAYING
- AVG DELTA
- MAX DELTA

5.3 Card: Club Averages by Lie
Purpose: true club averages with lie splits.

Render rows for clubs with >= 4 shots.

5.4 Card: Club Miss Pattern
Purpose: show directional and distance miss tendencies by club.

Render for clubs with >= 5 approach shots and greenResult populated.

5.5 Card: Tee Club Performance
Purpose: compare how each tee club actually performs.

Render for clubs with >= 4 tee shots on par 4/5 holes.

5.6 Card: Scoring Distance Bands
Purpose: show which approach distances produce best and worst scoring.

Bands:
- <75
- 75-100
- 100-125
- 125-150
- 150-175
- 175-200
- 200+

5.7 Card: Conditions Splits
Purpose: show performance under different weather loads.

6. Insights Tab v1.1
The Insights tab becomes pattern-driven and multi-round where possible. It should answer: “What keeps happening?”

6.1 Section Order
1. Distance Control
2. Directional Miss
3. Tee Strategy
4. Hazard / Recovery
5. Conditions Intelligence
6. Gapping / Bag Usage

6.2 Insight Card Model
```ts
interface GpsPatternInsight {
  id: string
  category: 'distance' | 'direction' | 'tee' | 'hazard' | 'conditions' | 'gapping'
  tone: 'green' | 'amber' | 'red'
  badge: string
  title: string
  support: string
  description: string
  action: string
}
```

6.3 Insight: Approach Short Bias
Trigger:
- >= 10 approach shots
- short misses >= 40%
- short misses > long misses

6.4 Insight: Right Miss Pattern
Trigger:
- >= 10 approaches or tee shots
- right misses >= 40%
- right > left by at least 15%

6.5 Insight: Tee Club Mismatch
Trigger:
- same tee club used >= 8 times
- fairway % under 45%
- another tee club with >= 4 shots is at least 12% better in FIR

6.6 Insight: Dogleg Strategy Leak
Trigger:
- >= 4 holes of one dogleg shape
- average score on that shape > +1.0

6.7 Insight: Hazard Challenge Rate
Trigger:
- >= 5 hazards with carry labels challenged
- success rate under 60%

6.8 Insight: Recovery Cost
Trigger:
- >= 6 recovery shots
- average hole delta after recovery > +1.2

6.9 Insight: Wind Management
Trigger:
- >= 8 non-tournament shots in wind >= 10 mph
- short miss rate in that bucket >= 45%

6.10 Insight: Lie Penalty by Club
Trigger:
- club has >= 4 fairway shots and >= 4 rough shots
- rough playing average is >= 8y shorter than fairway

6.11 Insight: Club Overlap
Trigger:
- two clubs with playing averages within 6y
- each club sample >= 5

7. Round Analysis > Coaching v1.1
The Coaching tab becomes more shot-decision aware, not just scoring-summary aware.

7.1 Section Order
1. Round Overview Grid
2. Strength / Focus cards
3. Most Costly Pattern
4. Best Scoring Window
5. Decision Quality cards
6. Pattern Insights list
7. Next Practice Focus

7.2 New Card: Most Costly Pattern
Purpose: identify the single biggest stroke-loss source this round.

7.3 New Card: Best Scoring Window
Purpose: reinforce what actually worked.

7.4 New Card: Decision Quality
Purpose: distinguish outcome from decision.

7.5 New Card: Wind Summary
Trigger:
- non-tournament round
- >= 8 weather-tagged shots

7.6 New Card: Lie Adjustment Summary
Trigger:
- >= 8 shots from non-fairway lies

7.7 New Card: Next Practice Focus
Exactly one card at bottom.

8. Trigger Thresholds
- club averages: 4 shots
- by-lie club split: 2 shots
- miss pattern by club: 5 approach shots
- multi-round insight: 10 shots or 3 rounds
- decision-quality comparison: each branch >= 4 samples
- recovery insight: 6 recovery shots
- hazard challenge insight: 5 challenged carries
- dispersion: 3 shots per club minimum, 5+ preferred

9. Empty / Low-Data States
- Track more GPS rounds to unlock club-by-lie averages.
- Dispersion needs at least 3 GPS-tagged shots with the same club.
- Decision-quality coaching appears once GolfSum has enough shot comparisons.

10. Save-Time Analytics
On round save:
1. persist gpsShots
2. compute gpsShotCount
3. normalize dogleg per shot from course cache
4. mark isTeeShot, isApproach, isLayup, isRecovery
5. persist analysisVersion = 1.1
6. persist roundStartedAt, roundEndedAt, roundDurationMinutes

11. Initial Build Priority
1. Persist gpsShots on saved rounds
2. Persist round timing fields
3. Add Club Averages by Lie
4. Add Club Miss Pattern
5. Add Most Costly Pattern and Best Scoring Window
6. Add Tee Club Performance
7. Add Approach Short Bias, Wind Management, Lie Penalty
8. Add Decision Quality
9. Add Club Overlap

12. Changelog
v1.1 — Mar 2026
Adds shot-based Averages, pattern-driven Insights, expanded deterministic Coaching, and formal Play Time support using persisted round timing fields.
