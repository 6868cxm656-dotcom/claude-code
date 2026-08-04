import SwiftUI
import SwiftData

@main
struct HomeJimApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [
            Exercise.self,
            WorkoutSession.self,
            PlannedExercise.self,
            SetEntry.self,
        ])
    }
}
