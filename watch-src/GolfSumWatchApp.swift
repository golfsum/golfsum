import SwiftUI

@main
struct GolfSumWatchApp: App {
  init() {
    WatchSessionManager.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(WatchSessionManager.shared)
    }
  }
}
