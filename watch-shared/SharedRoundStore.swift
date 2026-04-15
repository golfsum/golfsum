import Foundation

enum SharedRoundStore {
  static let appGroupID = "group.com.golfsum.app"
  static let activeRoundKey = "active_round"

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupID)
  }

  static func save(_ round: ActiveRound?) {
    guard let defaults else { return }
    if let round,
       let data = try? JSONEncoder().encode(round) {
      defaults.set(data, forKey: activeRoundKey)
    } else {
      defaults.removeObject(forKey: activeRoundKey)
    }
    defaults.synchronize()
  }

  static func load() -> ActiveRound? {
    guard
      let defaults,
      let data = defaults.data(forKey: activeRoundKey),
      let round = try? JSONDecoder().decode(ActiveRound.self, from: data)
    else {
      return nil
    }
    return round
  }
}
