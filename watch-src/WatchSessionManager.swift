import Foundation
import UserNotifications
import WatchConnectivity

/// watchOS: receives application context + immediate messages from iPhone, sends shot / putt / hole commands.
final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  @Published var roundActive = false
  @Published var hole: Int = 0
  @Published var frt: Int = 0
  @Published var ctr: Int = 0
  @Published var bck: Int = 0
  @Published var clubs: [String] = []
  @Published var phoneReachable = false
  private var hasNotifiedRoundStart = false

  func activate() {
    guard WCSession.isSupported() else { return }
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    let session = WCSession.default
    session.delegate = self
    session.activate()
    DispatchQueue.main.async {
      self.applyIncomingState(session.applicationContext)
      self.phoneReachable = session.isReachable
    }
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

  /// Merge keys from phone: `active` and/or `roundActive`, hole, frt, ctr, bck, clubs.
  private func applyIncomingState(_ context: [String: Any]) {
    let active = boolFrom(context["roundActive"]) || boolFrom(context["active"])
    if active && !roundActive {
      notifyRoundStartedIfNeeded()
    }
    if !active {
      hasNotifiedRoundStart = false
    }
    roundActive = active
    hole = intFrom(context["hole"])
    frt = intFrom(context["frt"])
    ctr = intFrom(context["ctr"])
    bck = intFrom(context["bck"])
    if let list = context["clubs"] as? [String] {
      clubs = list
    } else {
      clubs = []
    }
  }

  private func notifyRoundStartedIfNeeded() {
    guard !hasNotifiedRoundStart else { return }
    hasNotifiedRoundStart = true
    let content = UNMutableNotificationContent()
    content.title = "Round started"
    content.body = "GolfSum is tracking your round. Open the app to log shots."
    content.sound = .default
    let request = UNNotificationRequest(identifier: "golfsum.round.started", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  func sendAddShot(club: String, reply: @escaping (Bool) -> Void) {
    sendOrFail(["action": "addShot", "club": club], reply: reply)
  }

  func sendAddPutt(reply: @escaping (Bool) -> Void) {
    sendOrFail(["action": "addPutt"], reply: reply)
  }

  func sendAdvanceHole(_ holeNumber: Int, reply: @escaping (Bool) -> Void) {
    sendOrFail(["action": "advanceHole", "hole": holeNumber], reply: reply)
  }

  private func sendOrFail(_ message: [String: Any], reply: @escaping (Bool) -> Void) {
    guard WCSession.isSupported() else {
      reply(false)
      return
    }
    let session = WCSession.default
    guard session.activationState == .activated else {
      reply(false)
      return
    }
    guard session.isReachable else {
      reply(false)
      return
    }
    session.sendMessage(
      message,
      replyHandler: { _ in reply(true) },
      errorHandler: { _ in reply(false) }
    )
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    DispatchQueue.main.async {
      self.phoneReachable = session.isReachable
      if activationState == .activated {
        self.applyIncomingState(session.applicationContext)
      }
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async {
      self.phoneReachable = session.isReachable
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async {
      self.applyIncomingState(applicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      if let action = message["action"] as? String, action == "roundState" {
        self.applyIncomingState(message)
        return
      }
    }
  }
}
