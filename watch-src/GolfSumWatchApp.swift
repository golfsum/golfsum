import SwiftUI

@main
struct GolfSumWatchApp: App {
  @Environment(\.scenePhase) private var scenePhase
  init() {
    WatchSessionManager.shared.activate()
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(WatchSessionManager.shared)
        .onChange(of: scenePhase) { _, phase in
          if phase == .active {
            WatchSessionManager.shared.refreshRound()
          }
        }
    }
  }
}
