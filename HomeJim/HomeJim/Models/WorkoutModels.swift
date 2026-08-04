import Foundation
import SwiftData

/// One training session: a plan built by drag & drop, then logged set by set.
@Model
final class WorkoutSession {
    var date: Date
    var name: String
    var completedAt: Date?

    @Relationship(deleteRule: .cascade, inverse: \PlannedExercise.session)
    var plannedExercises: [PlannedExercise] = []

    init(date: Date = .now, name: String) {
        self.date = date
        self.name = name
    }

    var isCompleted: Bool { completedAt != nil }

    var orderedExercises: [PlannedExercise] {
        plannedExercises.sorted { $0.order < $1.order }
    }

    var totalVolume: Double {
        plannedExercises.reduce(0) { $0 + $1.totalVolume }
    }

    var totalSets: Int {
        plannedExercises.reduce(0) { $0 + $1.sets.count }
    }
}

/// An exercise placed into a session's plan, holding the sets logged for it.
@Model
final class PlannedExercise {
    var order: Int
    var targetSets: Int
    var targetReps: Int
    var exercise: Exercise?
    var session: WorkoutSession?

    @Relationship(deleteRule: .cascade, inverse: \SetEntry.plannedExercise)
    var sets: [SetEntry] = []

    init(order: Int, exercise: Exercise, targetSets: Int = 3, targetReps: Int = 10) {
        self.order = order
        self.exercise = exercise
        self.targetSets = targetSets
        self.targetReps = targetReps
    }

    var orderedSets: [SetEntry] {
        sets.sorted { $0.order < $1.order }
    }

    var totalVolume: Double {
        sets.reduce(0) { $0 + $1.volume }
    }
}

/// A single logged set: weight (kg) x reps.
@Model
final class SetEntry {
    var order: Int
    var weight: Double
    var reps: Int
    var completedAt: Date
    var plannedExercise: PlannedExercise?

    init(order: Int, weight: Double, reps: Int, completedAt: Date = .now) {
        self.order = order
        self.weight = weight
        self.reps = reps
        self.completedAt = completedAt
    }

    /// Training volume for this set, in kg-reps.
    var volume: Double {
        weight * Double(reps)
    }
}
