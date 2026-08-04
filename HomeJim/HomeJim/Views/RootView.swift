import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        TabView {
            PlannerView()
                .tabItem { Label("Plan", systemImage: "list.clipboard") }
            BalanceView()
                .tabItem { Label("Balance", systemImage: "scalemass") }
            HistoryView()
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
            LibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical") }
        }
        .task {
            SeedData.seedIfNeeded(context: modelContext)
        }
    }
}

#Preview {
    RootView()
        .modelContainer(for: [Exercise.self, WorkoutSession.self, PlannedExercise.self, SetEntry.self], inMemory: true)
}
