import SwiftUI

private enum CrownField {
    case score
    case putts
}

struct HoleEntryView: View {
    @ObservedObject var viewModel: RoundEntryViewModel

    @State private var scoreCrown: Double = 4
    @State private var puttsCrown: Double = 2
    @State private var activeField: CrownField = .score

    var body: some View {
        let hole = viewModel.currentHole
        ScrollView {
            VStack(spacing: 8) {
                header(hole: hole)

                crownRow(
                    title: "Score",
                    value: Int(scoreCrown),
                    isActive: activeField == .score,
                    tint: GolfSumWatchColors.brand
                ) {
                    activeField = .score
                }
                .focusable(activeField == .score)
                .digitalCrownRotation(
                    $scoreCrown,
                    from: 1,
                    through: 15,
                    by: 1,
                    sensitivity: .medium,
                    isContinuous: false,
                    isHapticFeedbackEnabled: true
                )
                .onChange(of: scoreCrown) { newValue in
                    viewModel.updateScore(Int(newValue.rounded()))
                }

                crownRow(
                    title: "Putts",
                    value: Int(puttsCrown),
                    isActive: activeField == .putts,
                    tint: GolfSumWatchColors.warning
                ) {
                    activeField = .putts
                }
                .focusable(activeField == .putts)
                .digitalCrownRotation(
                    $puttsCrown,
                    from: 0,
                    through: 8,
                    by: 1,
                    sensitivity: .medium,
                    isContinuous: false,
                    isHapticFeedbackEnabled: true
                )
                .onChange(of: puttsCrown) { newValue in
                    viewModel.updatePutts(Int(newValue.rounded()))
                }

                statToggle(title: "FIR", value: hole.fir, onChange: viewModel.updateFIR)
                statToggle(title: "GIR", value: hole.gir, onChange: viewModel.updateGIR)

                Button("Save Hole") {
                    viewModel.saveCurrentHole()
                    syncCrownValues()
                }
                .buttonStyle(.borderedProminent)
                .tint(GolfSumWatchColors.brand)

                if viewModel.isLastHole {
                    Button("End Round") {
                        viewModel.endRound()
                    }
                    .buttonStyle(.bordered)
                    .tint(GolfSumWatchColors.error)
                }

                Text(viewModel.syncStatusText)
                    .font(.caption2)
                    .foregroundStyle(GolfSumWatchColors.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .background(GolfSumWatchColors.bgPrimary)
        .onAppear { syncCrownValues() }
        .onChange(of: viewModel.currentIndex) { _ in syncCrownValues() }
    }

    private func header(hole: WatchHole) -> some View {
        VStack(spacing: 2) {
            Text("Hole \(hole.number)")
                .font(.headline)
                .foregroundStyle(GolfSumWatchColors.textPrimary)
            Text("Par \(hole.par)")
                .font(.caption)
                .foregroundStyle(GolfSumWatchColors.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(GolfSumWatchColors.bgSecondary)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(GolfSumWatchColors.border, lineWidth: 1))
        )
    }

    private func crownRow(title: String, value: Int, isActive: Bool, tint: Color, onTap: @escaping () -> Void) -> some View {
        Button(action: onTap) {
            HStack {
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(GolfSumWatchColors.textSecondary)
                Spacer()
                Text("\(value)")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(isActive ? tint : GolfSumWatchColors.textPrimary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(GolfSumWatchColors.bgSecondary)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(isActive ? tint : GolfSumWatchColors.border, lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    private func statToggle(title: String, value: Bool?, onChange: @escaping (Bool?) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(GolfSumWatchColors.textSecondary)
            HStack(spacing: 6) {
                ToggleChip(title: "Yes", active: value == true) { onChange(true) }
                ToggleChip(title: "No", active: value == false) { onChange(false) }
            }
        }
    }

    private func syncCrownValues() {
        let hole = viewModel.currentHole
        scoreCrown = Double(hole.score)
        puttsCrown = Double(hole.putts)
    }
}

