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
    if let round = SharedRoundStore.load() {
      lastPayload = payload(for: round)
    }
  }

  /// Property-list friendly payload: active / roundActive, hole, frt, ctr, bck, clubs ([String]).
  func updateApplicationContextPayload(_ payload: [String: Any]) {
    lastPayload = payload
    SharedRoundStore.save(activeRound(from: payload))
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
    if let action = message["action"] as? String, action == "requestRoundSync" {
      replyHandler(lastPayload)
      return
    }
    messageHandler?(message)
    replyHandler(["ok": true])
  }
}
