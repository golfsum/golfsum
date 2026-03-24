import Foundation

struct WatchHole: Identifiable, Codable {
    var id: Int { number }
    let number: Int
    let par: Int
    var score: Int
    var putts: Int
    var fir: Bool?
    var gir: Bool?
    var isSaved: Bool
}

struct WatchRoundTotals {
    let scoreToPar: Int
    let totalPutts: Int
    let holesCompleted: Int
}

