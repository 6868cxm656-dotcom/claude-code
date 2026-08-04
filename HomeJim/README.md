# HomeJim 🏋️

A native iPhone workout tracker built with SwiftUI and SwiftData.

HomeJim is built around three ideas:

1. **Plan by drag & drop.** At the start of a session, drag exercises from
   the library into today's plan (or tap **+**), then long-press and drag to
   reorder them into the sequence you want to train.
2. **Track weights and volume.** Log every set as weight × reps. HomeJim
   shows what you lifted last time for each exercise, per-set and per-session
   volume (kg·reps), and a 30-day volume chart in History.
3. **Train in balance.** A balance engine counts your weekly hard sets per
   muscle group (full credit for an exercise's primary muscle, half credit
   for secondaries), compares them to per-muscle weekly targets, and suggests
   specific exercises for whichever groups are falling behind — right at the
   top of the planner while you build your session.

## Requirements

- Xcode 16 or later
- iOS 17.0+ (SwiftData, Swift Charts)

## Running the app

1. Open `HomeJim/HomeJim.xcodeproj` in Xcode.
2. Select the **HomeJim** scheme and an iPhone simulator (or your device —
   set your development team under *Signing & Capabilities* first).
3. Build and run (⌘R).

On first launch the app seeds a library of ~40 common exercises across ten
muscle groups (chest, back, shoulders, biceps, triceps, quads, hamstrings,
glutes, calves, core). You can add your own exercises in the **Library** tab.

## The four tabs

| Tab | What it does |
| --- | --- |
| **Plan** | Start a session, build the plan by drag & drop, tap an exercise to log sets, then finish the workout. |
| **Balance** | Chart of sets done vs target per muscle group (7- or 28-day window) plus exercise suggestions you can add straight to an active plan. |
| **History** | Finished sessions with total sets and volume, a 30-day daily-volume chart, and full per-set detail for every past workout. |
| **Library** | Browse exercises grouped by primary muscle and create custom exercises (name, primary/secondary muscles, equipment). |

## How the balance engine works

- Every logged set credits 1.0 set to the exercise's primary muscle group and
  0.5 sets to each secondary group.
- Each muscle group has a weekly hard-set target loosely based on common
  hypertrophy guidelines (e.g. back 14, chest 12, biceps 8, calves 6). The
  target scales with the analysis window (7 or 28 days).
- A group below 70 % of target is flagged **undertrained**; the engine then
  suggests exercises whose primary muscle is that group, skipping anything
  already in today's plan, worst-hit groups first.
- Targets live in `MuscleGroup.weeklySetTarget`
  (`HomeJim/Models/Exercise.swift`) and the thresholds in
  `HomeJim/Engine/BalanceEngine.swift` — easy to tune to your own programme.

## Project layout

```
HomeJim/
├── HomeJim.xcodeproj
└── HomeJim/
    ├── HomeJimApp.swift          # App entry, SwiftData container
    ├── Models/
    │   ├── Exercise.swift        # Exercise + MuscleGroup/Equipment enums
    │   ├── WorkoutModels.swift   # WorkoutSession / PlannedExercise / SetEntry
    │   └── SeedData.swift        # First-launch exercise library
    ├── Engine/
    │   └── BalanceEngine.swift   # Weekly-set balance analysis + suggestions
    └── Views/
        ├── RootView.swift        # Tab bar
        ├── Planner/              # Session planner (drag & drop) + set logging
        ├── Balance/              # Balance chart + suggestions
        ├── History/              # Past sessions + volume chart
        └── Library/              # Exercise browser + custom exercises
```

## Notes & ideas for later

- Weights are tracked in kilograms. For bodyweight exercises, log any added
  weight (weighted vest, dip belt) or 0 for pure bodyweight.
- Natural next steps: rest timers, per-exercise progression charts, reusable
  workout templates, lb/kg unit setting, iCloud sync via CloudKit.
