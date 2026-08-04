import Foundation
import SwiftData

/// The muscle groups HomeJim balances training across.
enum MuscleGroup: String, Codable, CaseIterable, Identifiable {
    case chest, back, shoulders, biceps, triceps
    case quads, hamstrings, glutes, calves, core

    var id: String { rawValue }

    var displayName: String { rawValue.capitalized }

    /// Recommended hard sets per week for balanced training.
    /// Loosely based on common hypertrophy guidelines (larger muscles
    /// tolerate and need more weekly volume than smaller ones).
    var weeklySetTarget: Double {
        switch self {
        case .chest: return 12
        case .back: return 14
        case .shoulders: return 12
        case .biceps: return 8
        case .triceps: return 8
        case .quads: return 12
        case .hamstrings: return 10
        case .glutes: return 10
        case .calves: return 6
        case .core: return 8
        }
    }
}

enum Equipment: String, Codable, CaseIterable, Identifiable {
    case barbell, dumbbell, kettlebell, machine, cable, bodyweight, band

    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
}

@Model
final class Exercise {
    @Attribute(.unique) var uuid: UUID
    var name: String
    var primaryMuscle: MuscleGroup
    var secondaryMuscles: [MuscleGroup]
    var equipment: Equipment
    var isCustom: Bool

    init(
        name: String,
        primaryMuscle: MuscleGroup,
        secondaryMuscles: [MuscleGroup] = [],
        equipment: Equipment,
        isCustom: Bool = false,
        uuid: UUID = UUID()
    ) {
        self.uuid = uuid
        self.name = name
        self.primaryMuscle = primaryMuscle
        self.secondaryMuscles = secondaryMuscles
        self.equipment = equipment
        self.isCustom = isCustom
    }

    var allMuscles: [MuscleGroup] {
        [primaryMuscle] + secondaryMuscles
    }
}
