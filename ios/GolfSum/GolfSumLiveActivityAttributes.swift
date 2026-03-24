import Foundation
import ActivityKit

@available(iOS 16.2, *)
struct GolfSumLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var holeNumber: Int
        var frontYards: String
        var centerYards: String
        var backYards: String
    }

    var courseName: String
    var teeLabel: String
}
