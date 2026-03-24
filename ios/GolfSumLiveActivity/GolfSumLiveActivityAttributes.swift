import ActivityKit
import Foundation

struct GolfSumLiveActivityAttributes: ActivityAttributes {
    public typealias LiveDeliveryData = ContentState

    public struct ContentState: Codable, Hashable {
        var holeNumber: Int
        var centerYards: String
        var courseName: String
    }

    var teeLabel: String
}