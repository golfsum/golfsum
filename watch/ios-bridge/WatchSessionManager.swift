import Foundation
import WatchConnectivity

/// Phone-side WCSession: pushes GPS round context to the watch and receives command messages.
final class WatchSessionManager: NSObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  private var messageHandler: (([String: Any]) -> Void)?

  func setMessageHandler(_ handler: @escaping ([String: Any]) -> Void) {
    messageHandler = handler
  }

  func start() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  /// Property-list friendly payload: hole, frt, ctr, bck, clubs, active (Bool).
  func updateApplicationContextPayload(_ payload: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    do {
      try session.updateApplicationContext(payload)
    } catch {
      // Best-effort; avoid crashing the app if the watch is unavailable.
    }
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {}

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    messageHandler?(message)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    messageHandler?(message)
    replyHandler(["ok": true])
  }
}
