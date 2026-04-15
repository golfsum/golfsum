import Foundation

struct WindSnapshot: Codable, Equatable {
  let speedMph: Int
  let directionDegrees: Double
  let directionLabel: String?
}

struct HoleSnapshot: Codable, Equatable, Identifiable {
  var id: Int { number }

  let number: Int
  let par: Int
  let yardage: Int
  let front: Int
  let middle: Int
  let back: Int
  let suggestedClub: String?
  let coachingFocus: String?
}

struct ActiveRound: Codable, Equatable {
  let roundID: String
  let courseName: String
  let teeName: String?
  let startedAt: Date
  var currentHole: HoleSnapshot
  var wind: WindSnapshot?
  var isActive: Bool
}
