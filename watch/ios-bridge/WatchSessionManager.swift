import Foundation
import WatchConnectivity

/// Phone-side WCSession: pushes GPS round context to the watch and receives command messages.
final class WatchSessionManager: NSObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  private var messageHandler: (([String: Any]) -> Void)?
  /// Latest payload from JS; replayed after activation / when the watch becomes reachable.
  private var lastPayload: [String: Any] = [:]

  func setMessageHandler(_ handler: @escaping ([String: Any]) -> Void) {
    messageHandler = handler
  }

  func start() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  /// Property-list friendly payload: active / roundActive, hole, frt, ctr, bck, clubs ([String]).
  func updateApplicationContextPayload(_ payload: [String: Any]) {
    lastPayload = payload
    flushContextToWatch()
  }

  private func flushContextToWatch() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      return
    }

    // Backup path — survives when watch wakes later.
    do {
      try session.updateApplicationContext(lastPayload)
    } catch {
      // Best-effort; avoid crashing the app if the watch is unavailable.
    }

    // Immediate path when the watch app is running in foreground.
    if session.isReachable {
      var msg = lastPayload
      msg["action"] = "roundState"
      session.sendMessage(
        msg,
        replyHandler: nil,
        errorHandler: { _ in
          // Context still updated above; message is best-effort.
        }
      )
    }
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if activationState == .activated {
      flushContextToWatch()
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    if session.isReachable {
      flushContextToWatch()
    }
  }

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
