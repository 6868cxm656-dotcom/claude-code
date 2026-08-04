import Foundation
import SwiftData

/// Seeds the exercise library on first launch.
enum SeedData {
    @MainActor
    static func seedIfNeeded(context: ModelContext) {
        let count = (try? context.fetchCount(FetchDescriptor<Exercise>())) ?? 0
        guard count == 0 else { return }
        for exercise in defaultExercises {
            context.insert(exercise)
        }
        try? context.save()
    }

    static var defaultExercises: [Exercise] {
        [
            // Chest
            Exercise(name: "Barbell Bench Press", primaryMuscle: .chest, secondaryMuscles: [.triceps, .shoulders], equipment: .barbell),
            Exercise(name: "Incline Dumbbell Press", primaryMuscle: .chest, secondaryMuscles: [.shoulders, .triceps], equipment: .dumbbell),
            Exercise(name: "Push-Up", primaryMuscle: .chest, secondaryMuscles: [.triceps, .core], equipment: .bodyweight),
            Exercise(name: "Cable Fly", primaryMuscle: .chest, equipment: .cable),
            Exercise(name: "Dip", primaryMuscle: .chest, secondaryMuscles: [.triceps, .shoulders], equipment: .bodyweight),

            // Back
            Exercise(name: "Pull-Up", primaryMuscle: .back, secondaryMuscles: [.biceps], equipment: .bodyweight),
            Exercise(name: "Barbell Row", primaryMuscle: .back, secondaryMuscles: [.biceps, .core], equipment: .barbell),
            Exercise(name: "Lat Pulldown", primaryMuscle: .back, secondaryMuscles: [.biceps], equipment: .cable),
            Exercise(name: "Seated Cable Row", primaryMuscle: .back, secondaryMuscles: [.biceps], equipment: .cable),
            Exercise(name: "Single-Arm Dumbbell Row", primaryMuscle: .back, secondaryMuscles: [.biceps, .core], equipment: .dumbbell),

            // Shoulders
            Exercise(name: "Overhead Press", primaryMuscle: .shoulders, secondaryMuscles: [.triceps, .core], equipment: .barbell),
            Exercise(name: "Dumbbell Lateral Raise", primaryMuscle: .shoulders, equipment: .dumbbell),
            Exercise(name: "Arnold Press", primaryMuscle: .shoulders, secondaryMuscles: [.triceps], equipment: .dumbbell),
            Exercise(name: "Rear Delt Fly", primaryMuscle: .shoulders, secondaryMuscles: [.back], equipment: .dumbbell),
            Exercise(name: "Face Pull", primaryMuscle: .shoulders, secondaryMuscles: [.back], equipment: .cable),

            // Biceps
            Exercise(name: "Barbell Curl", primaryMuscle: .biceps, equipment: .barbell),
            Exercise(name: "Hammer Curl", primaryMuscle: .biceps, equipment: .dumbbell),
            Exercise(name: "Incline Dumbbell Curl", primaryMuscle: .biceps, equipment: .dumbbell),

            // Triceps
            Exercise(name: "Cable Pushdown", primaryMuscle: .triceps, equipment: .cable),
            Exercise(name: "Skull Crusher", primaryMuscle: .triceps, equipment: .barbell),
            Exercise(name: "Overhead Triceps Extension", primaryMuscle: .triceps, equipment: .dumbbell),

            // Quads
            Exercise(name: "Back Squat", primaryMuscle: .quads, secondaryMuscles: [.glutes, .core], equipment: .barbell),
            Exercise(name: "Front Squat", primaryMuscle: .quads, secondaryMuscles: [.glutes, .core], equipment: .barbell),
            Exercise(name: "Goblet Squat", primaryMuscle: .quads, secondaryMuscles: [.glutes, .core], equipment: .kettlebell),
            Exercise(name: "Leg Press", primaryMuscle: .quads, secondaryMuscles: [.glutes], equipment: .machine),
            Exercise(name: "Bulgarian Split Squat", primaryMuscle: .quads, secondaryMuscles: [.glutes, .hamstrings], equipment: .dumbbell),
            Exercise(name: "Leg Extension", primaryMuscle: .quads, equipment: .machine),
            Exercise(name: "Walking Lunge", primaryMuscle: .quads, secondaryMuscles: [.glutes, .core], equipment: .dumbbell),

            // Hamstrings
            Exercise(name: "Romanian Deadlift", primaryMuscle: .hamstrings, secondaryMuscles: [.glutes, .back], equipment: .barbell),
            Exercise(name: "Conventional Deadlift", primaryMuscle: .hamstrings, secondaryMuscles: [.glutes, .back, .core], equipment: .barbell),
            Exercise(name: "Lying Leg Curl", primaryMuscle: .hamstrings, equipment: .machine),
            Exercise(name: "Nordic Curl", primaryMuscle: .hamstrings, secondaryMuscles: [.glutes], equipment: .bodyweight),
            Exercise(name: "Good Morning", primaryMuscle: .hamstrings, secondaryMuscles: [.glutes, .back], equipment: .barbell),

            // Glutes
            Exercise(name: "Barbell Hip Thrust", primaryMuscle: .glutes, secondaryMuscles: [.hamstrings], equipment: .barbell),
            Exercise(name: "Glute Bridge", primaryMuscle: .glutes, secondaryMuscles: [.hamstrings, .core], equipment: .bodyweight),
            Exercise(name: "Cable Kickback", primaryMuscle: .glutes, equipment: .cable),

            // Calves
            Exercise(name: "Standing Calf Raise", primaryMuscle: .calves, equipment: .machine),
            Exercise(name: "Seated Calf Raise", primaryMuscle: .calves, equipment: .machine),

            // Core
            Exercise(name: "Plank", primaryMuscle: .core, equipment: .bodyweight),
            Exercise(name: "Hanging Leg Raise", primaryMuscle: .core, equipment: .bodyweight),
            Exercise(name: "Cable Crunch", primaryMuscle: .core, equipment: .cable),
            Exercise(name: "Ab Wheel Rollout", primaryMuscle: .core, secondaryMuscles: [.shoulders], equipment: .bodyweight),
            Exercise(name: "Russian Twist", primaryMuscle: .core, equipment: .bodyweight),
        ]
    }
}
