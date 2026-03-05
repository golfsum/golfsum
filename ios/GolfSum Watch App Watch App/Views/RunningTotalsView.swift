import SwiftUI

struct RunningTotalsView: View {
    @ObservedObject var viewModel: RoundEntryViewModel

    var body: some View {
        let totals = viewModel.totals
        VStack(spacing: 10) {
            Text("Running Totals")
                .font(.headline)
                .foregroundStyle(GolfSumWatchColors.textPrimary)

            metric(
                title: "Score vs Par",
                value: totals.scoreToPar == 0 ? "E" : (totals.scoreToPar > 0 ? "+\(totals.scoreToPar)" : "\(totals.scoreToPar)")
            )
            metric(title: "Total Putts", value: "\(totals.totalPutts)")
            metric(title: "Holes Completed", value: "\(totals.holesCompleted)/\(viewModel.holes.count)")

            Spacer(minLength: 0)
        }
        .padding(10)
        .background(GolfSumWatchColors.bgPrimary)
    }

    private func metric(title: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(GolfSumWatchColors.textSecondary)
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(GolfSumWatchColors.brand)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(GolfSumWatchColors.bgSecondary)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(GolfSumWatchColors.border, lineWidth: 1))
        )
    }
}

