import SwiftUI

enum GolfSumWatchColors {
    static let bgPrimary = Color(hex: "#0f1419")
    static let bgSecondary = Color(hex: "#1a2028")
    static let bgTertiary = Color(hex: "#242d38")
    static let border = Color.white.opacity(0.2)
    static let brand = Color(hex: "#10B981")
    static let textPrimary = Color(hex: "#E5E7EB")
    static let textSecondary = Color(hex: "#9CA3AF")
    static let warning = Color(hex: "#F59E0B")
    static let error = Color(hex: "#EF4444")
}

extension Color {
    init(hex: String) {
        let cleaned = hex.replacingOccurrences(of: "#", with: "")
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

