import Foundation

/// How much work a muscle group has received in the analysis window,
/// compared to its target.
struct MuscleLoad: Identifiable {
    let group: MuscleGroup
    /// Fractional set count: primary muscles get full credit per set,
    /// secondary muscles half credit.
    let sets: Double
    /// Volume in kg-reps credited to this group.
    let volume: Double
    /// Target set count for the analysis window.
    let target: Double

    var id: String { group.id }

    var completion: Double {
        target > 0 ? sets / target : 1
    }

    enum Status {
        case under, balanced, over
    }

    var status: Status {
        if completion < 0.7 { return .under }
        if completion > 1.3 { return .over }
        return .balanced
    }
}

struct ExerciseSuggestion: Identifiable {
    let id = UUID()
    let exercise: Exercise
    let group: MuscleGroup
    let reason: String
}

/// Analyses logged training and recommends exercises so that no muscle
/// group falls behind. Works on "hard sets per week" per muscle group,
/// the most common way to programme balanced hypertrophy training.
enum BalanceEngine {
    /// Computes per-muscle-group load from logged sets within the window.
    /// Primary muscles receive full credit for each set, secondary muscles
    /// half credit.
    static func muscleLoads(
        sessions: [WorkoutSession],
        windowDays: Int = 7,
        now: Date = .now
    ) -> [MuscleLoad] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -windowDays, to: now) ?? now
        let targetScale = Double(windowDays) / 7.0

        var setCredit: [MuscleGroup: Double] = [:]
        var volumeCredit: [MuscleGroup: Double] = [:]

        for session in sessions where session.date >= cutoff {
            for planned in session.plannedExercises {
                guard let exercise = planned.exercise, !planned.sets.isEmpty else { continue }
                let setCount = Double(planned.sets.count)
                let volume = planned.totalVolume

                setCredit[exercise.primaryMuscle, default: 0] += setCount
                volumeCredit[exercise.primaryMuscle, default: 0] += volume

                for secondary in exercise.secondaryMuscles {
                    setCredit[secondary, default: 0] += setCount * 0.5
                    volumeCredit[secondary, default: 0] += volume * 0.5
                }
            }
        }

        return MuscleGroup.allCases.map { group in
            MuscleLoad(
                group: group,
                sets: setCredit[group] ?? 0,
                volume: volumeCredit[group] ?? 0,
                target: group.weeklySetTarget * targetScale
            )
        }
    }

    /// Suggests exercises for the muscle groups furthest below target.
    /// Exercises whose UUIDs appear in `excluding` (e.g. already in
    /// today's plan) are skipped.
    static func suggestions(
        loads: [MuscleLoad],
        library: [Exercise],
        excluding excluded: Set<UUID> = [],
        limit: Int = 3
    ) -> [ExerciseSuggestion] {
        let underGroups = loads
            .filter { $0.status == .under }
            .sorted { $0.completion < $1.completion }

        var results: [ExerciseSuggestion] = []
        var used = excluded

        for load in underGroups {
            guard results.count < limit else { break }
            let candidates = library.filter {
                $0.primaryMuscle == load.group && !used.contains($0.uuid)
            }
            guard let pick = candidates.first else { continue }
            used.insert(pick.uuid)

            let done = Int(load.sets.rounded())
            let target = Int(load.target.rounded())
            let reason = "\(load.group.displayName): \(done) of \(target) sets this period"
            results.append(ExerciseSuggestion(exercise: pick, group: load.group, reason: reason))
        }
        return results
    }
}
