import SwiftUI
import SwiftData

/// Browse the exercise library grouped by muscle, and add custom exercises.
struct LibraryView: View {
    @Query(sort: \Exercise.name) private var exercises: [Exercise]
    @Environment(\.modelContext) private var modelContext
    @State private var showNewExercise = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(MuscleGroup.allCases) { group in
                    let groupExercises = exercises.filter { $0.primaryMuscle == group }
                    if !groupExercises.isEmpty {
                        Section(group.displayName) {
                            ForEach(groupExercises) { exercise in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(exercise.name)
                                        HStack(spacing: 6) {
                                            Text(exercise.equipment.displayName)
                                            if !exercise.secondaryMuscles.isEmpty {
                                                Text("· also \(exercise.secondaryMuscles.map(\.displayName).joined(separator: ", "))")
                                            }
                                        }
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if exercise.isCustom {
                                        Text("Custom")
                                            .font(.caption2)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(.quaternary, in: Capsule())
                                    }
                                }
                                .swipeActions {
                                    if exercise.isCustom {
                                        Button(role: .destructive) {
                                            modelContext.delete(exercise)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Library")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showNewExercise = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showNewExercise) {
                NewExerciseSheet()
            }
        }
    }
}

/// Form for creating a custom exercise.
struct NewExerciseSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var primaryMuscle: MuscleGroup = .chest
    @State private var secondaryMuscles: Set<MuscleGroup> = []
    @State private var equipment: Equipment = .dumbbell

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Landmine Press", text: $name)
                }

                Section("Primary muscle") {
                    Picker("Primary muscle", selection: $primaryMuscle) {
                        ForEach(MuscleGroup.allCases) { group in
                            Text(group.displayName).tag(group)
                        }
                    }
                }

                Section("Secondary muscles") {
                    ForEach(MuscleGroup.allCases.filter { $0 != primaryMuscle }) { group in
                        Toggle(group.displayName, isOn: Binding(
                            get: { secondaryMuscles.contains(group) },
                            set: { isOn in
                                if isOn {
                                    secondaryMuscles.insert(group)
                                } else {
                                    secondaryMuscles.remove(group)
                                }
                            }
                        ))
                    }
                }

                Section("Equipment") {
                    Picker("Equipment", selection: $equipment) {
                        ForEach(Equipment.allCases) { item in
                            Text(item.displayName).tag(item)
                        }
                    }
                }
            }
            .navigationTitle("New Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        let exercise = Exercise(
            name: name.trimmingCharacters(in: .whitespaces),
            primaryMuscle: primaryMuscle,
            secondaryMuscles: Array(secondaryMuscles.subtracting([primaryMuscle])),
            equipment: equipment,
            isCustom: true
        )
        modelContext.insert(exercise)
        dismiss()
    }
}
