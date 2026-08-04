import SwiftUI
import SwiftData

/// Log sets (weight × reps) for one planned exercise, with last session's
/// performance shown for reference.
struct ExerciseLogView: View {
    @Bindable var planned: PlannedExercise
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \WorkoutSession.date, order: .reverse) private var sessions: [WorkoutSession]

    @State private var weight: Double = 20
    @State private var reps: Int = 10
    @State private var didPrefill = false

    /// The most recent completed session containing this exercise.
    private var lastPerformance: (date: Date, sets: [SetEntry])? {
        guard let exercise = planned.exercise else { return nil }
        for session in sessions where session.isCompleted {
            if let match = session.plannedExercises.first(where: { $0.exercise?.uuid == exercise.uuid }),
               !match.sets.isEmpty {
                return (session.date, match.orderedSets)
            }
        }
        return nil
    }

    var body: some View {
        List {
            Section("Log a set") {
                HStack {
                    Text("Weight")
                    Spacer()
                    Button("−2.5") { weight = max(0, weight - 2.5) }
                        .buttonStyle(.bordered)
                    TextField("kg", value: $weight, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 70)
                        .textFieldStyle(.roundedBorder)
                    Button("+2.5") { weight += 2.5 }
                        .buttonStyle(.bordered)
                    Text("kg")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)

                Stepper("Reps: \(reps)", value: $reps, in: 1...50)

                Button {
                    addSet()
                } label: {
                    Label("Add Set", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }

            Section {
                if planned.orderedSets.isEmpty {
                    Text("No sets logged yet")
                        .foregroundStyle(.secondary)
                }
                ForEach(planned.orderedSets) { set in
                    HStack {
                        Text("Set \(set.order + 1)")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(set.weight.formatted()) kg × \(set.reps)")
                        Text("= \(Int(set.volume.rounded())) kg")
                            .foregroundStyle(.secondary)
                            .font(.callout)
                    }
                }
                .onDelete(perform: deleteSets)
            } header: {
                Text("Sets today")
            } footer: {
                if !planned.sets.isEmpty {
                    Text("Total volume: \(Int(planned.totalVolume.rounded())) kg")
                }
            }

            if let last = lastPerformance {
                Section("Last time · \(last.date.formatted(date: .abbreviated, time: .omitted))") {
                    ForEach(last.sets) { set in
                        HStack {
                            Text("Set \(set.order + 1)")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(set.weight.formatted()) kg × \(set.reps)")
                        }
                    }
                }
            }

            Section("Target") {
                Stepper("Target sets: \(planned.targetSets)", value: $planned.targetSets, in: 1...10)
                Stepper("Target reps: \(planned.targetReps)", value: $planned.targetReps, in: 1...50)
            }
        }
        .navigationTitle(planned.exercise?.name ?? "Exercise")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: prefill)
    }

    private func prefill() {
        guard !didPrefill else { return }
        didPrefill = true
        if let lastToday = planned.orderedSets.last {
            weight = lastToday.weight
            reps = lastToday.reps
        } else if let lastSet = lastPerformance?.sets.last {
            weight = lastSet.weight
            reps = lastSet.reps
        } else {
            reps = planned.targetReps
        }
    }

    private func addSet() {
        let set = SetEntry(order: planned.sets.count, weight: weight, reps: reps)
        set.plannedExercise = planned
        modelContext.insert(set)
    }

    private func deleteSets(at offsets: IndexSet) {
        let sets = planned.orderedSets
        for offset in offsets {
            modelContext.delete(sets[offset])
        }
        let remaining = planned.orderedSets
        for (index, set) in remaining.enumerated() {
            set.order = index
        }
    }
}
