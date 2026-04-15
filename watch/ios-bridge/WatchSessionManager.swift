import Foundation
import WatchConnectivity

/// Phone-side WCSession: pushes GPS round context to the watch and receives command messages.
final class WatchSessionManager: NSObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  private var messageHandler: (([String: Any]) -> Void)?
  /// Latest payload from JS; replayed after activation / when the watch becomes reachable.
  private var lastPayload: [String: Any] = [:]

  private func debugLog(_ message: String) {
    print("[GolfSumPhoneWC] \(message)")
  }

  func setMessageHandler(_ handler: @escaping ([String: Any]) -> Void) {
    messageHandler = handler
  }

  func start() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
    debugLog("activate() called")
    if let round = SharedRoundStore.load() {
      lastPayload = payload(for: round)
    }
  }

  /// Property-list friendly payload: active / roundActive, hole, frt, ctr, bck, clubs ([String]).
  func updateApplicationContextPayload(_ payload: [String: Any]) {
    lastPayload = payload
    SharedRoundStore.save(activeRound(from: payload))
    debugLog("Stored payload for round \(stringFrom(payload[\"roundID\"]) ?? stringFrom(payload[\"roundId\"]) ?? "unknown")")
    flushContextToWatch()
  }

  private func payload(for round: ActiveRound) -> [String: Any] {
    [
      "active": round.isActive,
      "roundActive": round.isActive,
      "roundID": round.roundID,
      "roundId": round.roundID,
      "courseName": round.courseName,
      "teeName": round.teeName ?? "",
      "currentHole": round.currentHole.number,
      "hole": round.currentHole.number,
      "par": round.currentHole.par,
      "yardage": round.currentHole.yardage,
      "frt": round.currentHole.front,
      "ctr": round.currentHole.middle,
      "bck": round.currentHole.back,
      "suggestedClub": round.currentHole.suggestedClub ?? "",
      "coachingFocus": round.currentHole.coachingFocus ?? "",
      "windMph": round.wind?.speedMph ?? 0,
      "windDegrees": round.wind?.directionDegrees ?? 0,
      "windLabel": round.wind?.directionLabel ?? "",
    ]
  }

  private func activeRound(from payload: [String: Any]) -> ActiveRound? {
    let active = boolFrom(payload["roundActive"]) || boolFrom(payload["active"])
    guard active else { return nil }

    let holeNumber = max(1, intFrom(payload["currentHole"]) > 0 ? intFrom(payload["currentHole"]) : intFrom(payload["hole"]))
    let par = max(3, intFrom(payload["par"]) == 0 ? 4 : intFrom(payload["par"]))
    let hole = HoleSnapshot(
      number: holeNumber,
      par: par,
      yardage: max(0, intFrom(payload["yardage"])),
      front: max(0, intFrom(payload["frt"])),
      middle: max(0, intFrom(payload["ctr"])),
      back: max(0, intFrom(payload["bck"])),
      suggestedClub: stringFrom(payload["suggestedClub"]),
      coachingFocus: stringFrom(payload["coachingFocus"])
    )

    let windMph = intFrom(payload["windMph"])
    let windDegrees = doubleFrom(payload["windDegrees"])
    let wind = (windMph > 0 || windDegrees != 0)
      ? WindSnapshot(speedMph: windMph, directionDegrees: windDegrees, directionLabel: stringFrom(payload["windLabel"]))
      : nil

    return ActiveRound(
      roundID: stringFrom(payload["roundID"]) ?? stringFrom(payload["roundId"]) ?? UUID().uuidString,
      courseName: stringFrom(payload["courseName"]) ?? "GolfSum",
      teeName: stringFrom(payload["teeName"]),
      startedAt: Date(),
      currentHole: hole,
      wind: wind,
      isActive: true
    )
  }

  private func boolFrom(_ value: Any?) -> Bool {
    if let b = value as? Bool { return b }
    if let n = value as? NSNumber { return n.boolValue }
    return false
  }

  private func intFrom(_ value: Any?) -> Int {
    if let i = value as? Int { return i }
    if let i = value as? Int32 { return Int(i) }
    if let d = value as? Double { return Int(d.rounded()) }
    if let n = value as? NSNumber { return n.intValue }
    return 0
  }

  private func doubleFrom(_ value: Any?) -> Double {
    if let d = value as? Double { return d }
    if let n = value as? NSNumber { return n.doubleValue }
    return 0
  }

  private func stringFrom(_ value: Any?) -> String? {
    if let text = value as? String, !text.isEmpty { return text }
    return nil
  }

  private func flushContextToWatch() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else {
      debugLog("flushContextToWatch skipped: activationState=\(session.activationState.rawValue)")
      return
    }

    let contextPayload = lastPayload.merging([
      "lastSyncAt": Date().timeIntervalSince1970,
    ]) { _, new in new }

    // Backup path — survives when watch wakes later.
    do {
      try session.updateApplicationContext(contextPayload)
      debugLog("updateApplicationContext sent. reachable=\(session.isReachable)")
    } catch {
      // Best-effort; avoid crashing the app if the watch is unavailable.
      debugLog("updateApplicationContext failed: \(error.localizedDescription)")
    }

    // Immediate path when the watch app is running in foreground.
    if session.isReachable {
      var msg = contextPayload
      let isActive = boolFrom(lastPayload["roundActive"]) || boolFrom(lastPayload["active"])
      msg["action"] = "roundState"
      msg["type"] = isActive ? "startRound" : "roundEnded"
      session.sendMessage(
        msg,
        replyHandler: { reply in
          self.debugLog("sendMessage ack: \(reply)")
        },
        errorHandler: { _ in
          // Context still updated above; message is best-effort.
          self.debugLog("sendMessage failed")
        }
      )
    } else {
      debugLog("Immediate message skipped: watch not reachable")
    }
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    debugLog("activationDidComplete state=\(activationState.rawValue) error=\(error?.localizedDescription ?? "nil")")
    if activationState == .activated {
      if let round = SharedRoundStore.load() {
        lastPayload = payload(for: round)
      }
      flushContextToWatch()
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    debugLog("reachability changed: \(session.isReachable)")
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
    let action = message["action"] as? String
    let type = message["type"] as? String
    if action == "requestRoundSync" || action == "requestActiveRound" || type == "requestActiveRound" {
      debugLog("Watch requested active round")
      replyHandler(lastPayload.merging([
        "action": "roundState",
        "type": "startRound",
        "lastSyncAt": Date().timeIntervalSince1970,
      ]) { _, new in new })
      flushContextToWatch()
      return
    }
    debugLog("Received watch message: \(message)")
    messageHandler?(message)
    replyHandler(["ok": true])
  }
}
