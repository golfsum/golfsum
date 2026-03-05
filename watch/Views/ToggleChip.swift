import SwiftUI

struct ToggleChip: View {
    let title: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundColor(active ? GolfSumWatchColors.bgPrimary : GolfSumWatchColors.textSecondary)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(active ? GolfSumWatchColors.brand : GolfSumWatchColors.bgTertiary)
                )
        }
        .buttonStyle(.plain)
    }
}

