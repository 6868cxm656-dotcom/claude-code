import SwiftUI
import SwiftData

/// The heart of the app: build today's plan by dragging exercises from the
/// library (or tapping +), reorder the plan by drag & drop, then tap an
/// exercise to log sets. Suggestions from the balance engine appear at the
/// top so undertrained muscle groups get covered.
struct SessionPlannerView: View {
    @Bindable var session: WorkoutSession
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Exercise.name) private var library: [Exercise]
    @Query private var allSessions: [WorkoutSession]
    @State private var searchText = ""

    private var suggestions: [ExerciseSuggestion] {
        let loads = BalanceEngine.muscleLoads(sessions: allSessions)
        let plannedIDs = Set(session.plannedExercises.compactMap { $0.exercise?.uuid })
        return BalanceEngine.suggestions(loads: loads, library: library, excluding: plannedIDs)
    }

    private var filteredLibrary: [Exercise] {
        guard !searchText.isEmpty else { return library }
        return library.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        List {
            if !suggestions.isEmpty {
                Section("Suggested for balance") {
                    ForEach(suggestions) { suggestion in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(suggestion.exercise.name)
                                Text(suggestion.reason)
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                            Spacer()
                            Button {
                                add(suggestion.exercise)
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title3)
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }
            }

            Section {
                if session.plannedExercises.isEmpty {
                    Label("Drag exercises here from the library below, or tap +", systemImage: "hand.draw")
                        .foregroundStyle(.secondary)
                }
                ForEach(session.orderedExercises) { planned in
                    NavigationLink {
                        ExerciseLogView(planned: planned)
                    } label: {
                        PlannedExerciseRow(planned: planned)
                    }
                }
                .onMove(perform: movePlanned)
                .onDelete(perform: deletePlanned)
            } header: {
                Text("Today's plan · \(session.plannedExercises.count) exercises")
            } footer: {
                if !session.plannedExercises.isEmpty {
                    Text("Long-press and drag to reorder. Tap an exercise to log sets. Total volume so far: \(Int(session.totalVolume.rounded())) kg.")
                }
            }

            Section("Exercise library — drag into your plan") {
                ForEach(filteredLibrary) { exercise in
                    LibraryExerciseRow(exercise: exercise) {
                        add(exercise)
                    }
                    .draggable(exercise.uuid.uuidString)
                }
            }
        }
        .dropDestination(for: String.self) { items, _ in
            handleDrop(items)
        }
        .searchable(text: $searchText, prompt: "Search exercises")
        .navigationTitle(session.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                EditButton()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        session.completedAt = .now
                    } label: {
                        Label("Finish Workout", systemImage: "checkmark.circle")
                    }
                    .disabled(session.totalSets == 0)

                    Button(role: .destructive) {
                        modelContext.delete(session)
                    } label: {
                        Label("Discard Session", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
    }

    // MARK: - Plan mutations

    private func add(_ exercise: Exercise) {
        let planned = PlannedExercise(order: session.plannedExercises.count, exercise: exercise)
        planned.session = session
        modelContext.insert(planned)
    }

    private func handleDrop(_ items: [String]) -> Bool {
        var added = false
        for item in items {
            if let uuid = UUID(uuidString: item),
               let exercise = library.first(where: { $0.uuid == uuid }) {
                add(exercise)
                added = true
            }
        }
        return added
    }

    private func movePlanned(from source: IndexSet, to destination: Int) {
        var items = session.orderedExercises
        items.move(fromOffsets: source, toOffset: destination)
        for (index, item) in items.enumerated() {
            item.order = index
        }
    }

    private func deletePlanned(at offsets: IndexSet) {
        let items = session.orderedExercises
        for offset in offsets {
            modelContext.delete(items[offset])
        }
        let remaining = session.orderedExercises
        for (index, item) in remaining.enumerated() {
            item.order = index
        }
    }
}

// MARK: - Rows

struct PlannedExerciseRow: View {
    let planned: PlannedExercise

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(planned.exercise?.name ?? "Unknown exercise")
                .font(.body)
            HStack(spacing: 8) {
                if let muscle = planned.exercise?.primaryMuscle {
                    MuscleTag(group: muscle)
                }
                if planned.sets.isEmpty {
                    Text("Target \(planned.targetSets) × \(planned.targetReps)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(planned.sets.count) sets · \(Int(planned.totalVolume.rounded())) kg")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }
        }
    }
}

struct LibraryExerciseRow: View {
    let exercise: Exercise
    let onAdd: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.name)
                HStack(spacing: 6) {
                    MuscleTag(group: exercise.primaryMuscle)
                    Text(exercise.equipment.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button(action: onAdd) {
                Image(systemName: "plus.circle")
                    .font(.title3)
            }
            .buttonStyle(.borderless)
        }
    }
}

struct MuscleTag: View {
    let group: MuscleGroup

    var body: some View {
        Text(group.displayName)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(.tint)
    }
}
