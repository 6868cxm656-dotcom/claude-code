import SwiftUI
import SwiftData
import Charts

/// Shows how training is distributed across muscle groups versus the
/// weekly set targets, and suggests exercises to close any gaps.
struct BalanceView: View {
    @Query private var sessions: [WorkoutSession]
    @Query(sort: \Exercise.name) private var library: [Exercise]
    @Environment(\.modelContext) private var modelContext
    @State private var windowDays = 7

    private var loads: [MuscleLoad] {
        BalanceEngine.muscleLoads(sessions: sessions, windowDays: windowDays)
    }

    private var suggestions: [ExerciseSuggestion] {
        BalanceEngine.suggestions(loads: loads, library: library)
    }

    private var activeSession: WorkoutSession? {
        sessions
            .sorted { $0.date > $1.date }
            .first { !$0.isCompleted }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Window", selection: $windowDays) {
                        Text("Last 7 days").tag(7)
                        Text("Last 28 days").tag(28)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }

                Section("Sets per muscle group vs target") {
                    Chart(loads) { load in
                        BarMark(
                            x: .value("Sets", load.sets),
                            y: .value("Muscle", load.group.displayName)
                        )
                        .foregroundStyle(by: .value("Kind", "Done"))
                        .position(by: .value("Kind", "Done"))

                        BarMark(
                            x: .value("Sets", load.target),
                            y: .value("Muscle", load.group.displayName)
                        )
                        .foregroundStyle(by: .value("Kind", "Target"))
                        .position(by: .value("Kind", "Target"))
                    }
                    .chartForegroundStyleScale([
                        "Done": Color.accentColor,
                        "Target": Color.gray.opacity(0.4),
                    ])
                    .frame(height: 420)
                    .padding(.vertical, 4)
                }

                Section {
                    if suggestions.isEmpty {
                        Label("Nicely balanced — no muscle group is falling behind.", systemImage: "checkmark.seal")
                            .foregroundStyle(.green)
                    }
                    ForEach(suggestions) { suggestion in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(suggestion.exercise.name)
                                Text(suggestion.reason)
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                            Spacer()
                            if let session = activeSession {
                                Button {
                                    addToPlan(suggestion.exercise, session: session)
                                } label: {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.title3)
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                    }
                } header: {
                    Text("Suggestions")
                } footer: {
                    if activeSession == nil && !suggestions.isEmpty {
                        Text("Start a session in the Plan tab to add these directly to a plan.")
                    } else {
                        Text("Primary muscles earn a full set credit, secondary muscles half a credit. Targets are weekly hard-set recommendations, scaled to the selected window.")
                    }
                }
            }
            .navigationTitle("Balance")
        }
    }

    private func addToPlan(_ exercise: Exercise, session: WorkoutSession) {
        let alreadyPlanned = session.plannedExercises.contains { $0.exercise?.uuid == exercise.uuid }
        guard !alreadyPlanned else { return }
        let planned = PlannedExercise(order: session.plannedExercises.count, exercise: exercise)
        planned.session = session
        modelContext.insert(planned)
    }
}
