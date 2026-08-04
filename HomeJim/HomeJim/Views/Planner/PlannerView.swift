import SwiftUI
import SwiftData

/// Entry point for the Plan tab: shows the in-progress session if there is
/// one, otherwise a screen to start planning a new session.
struct PlannerView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkoutSession.date, order: .reverse) private var sessions: [WorkoutSession]

    private var activeSession: WorkoutSession? {
        sessions.first { !$0.isCompleted }
    }

    var body: some View {
        NavigationStack {
            if let session = activeSession {
                SessionPlannerView(session: session)
            } else {
                startScreen
            }
        }
    }

    private var startScreen: some View {
        VStack(spacing: 16) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("No session in progress")
                .font(.title2.bold())
            Text("Start a session, then drag exercises from the library into your plan — or add the balanced-training suggestions.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button {
                startSession()
            } label: {
                Label("Plan a Session", systemImage: "plus")
                    .font(.headline)
                    .padding(.horizontal, 8)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .navigationTitle("HomeJim")
    }

    private func startSession() {
        let name = "Workout · \(Date.now.formatted(date: .abbreviated, time: .omitted))"
        modelContext.insert(WorkoutSession(name: name))
    }
}
