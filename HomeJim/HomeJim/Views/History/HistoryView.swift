import SwiftUI
import SwiftData
import Charts

/// Completed sessions with a volume-over-time chart.
struct HistoryView: View {
    @Query(sort: \WorkoutSession.date, order: .reverse) private var sessions: [WorkoutSession]

    private var completed: [WorkoutSession] {
        sessions.filter(\.isCompleted)
    }

    private struct DayVolume: Identifiable {
        let day: Date
        let volume: Double
        var id: Date { day }
    }

    private var recentDailyVolume: [DayVolume] {
        let calendar = Calendar.current
        let cutoff = calendar.date(byAdding: .day, value: -30, to: .now) ?? .now
        var byDay: [Date: Double] = [:]
        for session in completed where session.date >= cutoff {
            let day = calendar.startOfDay(for: session.date)
            byDay[day, default: 0] += session.totalVolume
        }
        return byDay
            .map { DayVolume(day: $0.key, volume: $0.value) }
            .sorted { $0.day < $1.day }
    }

    var body: some View {
        NavigationStack {
            List {
                if recentDailyVolume.count > 1 {
                    Section("Volume · last 30 days") {
                        Chart(recentDailyVolume) { entry in
                            BarMark(
                                x: .value("Day", entry.day, unit: .day),
                                y: .value("Volume (kg)", entry.volume)
                            )
                            .foregroundStyle(.tint)
                        }
                        .frame(height: 180)
                        .padding(.vertical, 4)
                    }
                }

                Section("Sessions") {
                    if completed.isEmpty {
                        Text("Finished workouts will appear here.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(completed) { session in
                        NavigationLink {
                            SessionDetailView(session: session)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(session.name)
                                Text("\(session.date.formatted(date: .abbreviated, time: .shortened)) · \(session.totalSets) sets · \(Int(session.totalVolume.rounded())) kg")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("History")
        }
    }
}

/// Read-only breakdown of a finished session.
struct SessionDetailView: View {
    let session: WorkoutSession

    var body: some View {
        List {
            ForEach(session.orderedExercises) { planned in
                Section(planned.exercise?.name ?? "Unknown exercise") {
                    if planned.orderedSets.isEmpty {
                        Text("No sets logged")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(planned.orderedSets) { set in
                        HStack {
                            Text("Set \(set.order + 1)")
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(set.weight.formatted()) kg × \(set.reps)")
                        }
                    }
                }
            }

            Section {
                HStack {
                    Text("Total volume")
                    Spacer()
                    Text("\(Int(session.totalVolume.rounded())) kg")
                        .bold()
                }
            }
        }
        .navigationTitle(session.date.formatted(date: .abbreviated, time: .omitted))
        .navigationBarTitleDisplayMode(.inline)
    }
}
