import Foundation
import UserNotifications
import WatchConnectivity

/// watchOS: receives application context + immediate messages from iPhone, sends shot / putt / hole commands.
final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchSessionManager()

  @Published var roundActive = false
  @Published var roundID = ""
  @Published var courseName = "GolfSum"
  @Published var teeName = ""
  @Published var hole: Int = 0
  @Published var par: Int = 4
  @Published var yardage: Int = 0
  @Published var frt: Int = 0
  @Published var ctr: Int = 0
  @Published var bck: Int = 0
  @Published var suggestedClub = ""
  @Published var coachingFocus = ""
  @Published var windMph: Int = 0
  @Published var windDegrees: Double = 0
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
      self.applyPersistedState()
      self.applyIncomingState(session.applicationContext)
      self.phoneReachable = session.isReachable
    }
  }

  func refreshRound() {
    applyPersistedState()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else { return }
    session.sendMessage(["action": "requestRoundSync"], replyHandler: { payload in
      DispatchQueue.main.async {
        self.applyIncomingState(payload)
      }
    }, errorHandler: { _ in })
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

  private func applyPersistedState() {
    guard let round = SharedRoundStore.load() else { return }
    roundActive = round.isActive
    roundID = round.roundID
    courseName = round.courseName
    teeName = round.teeName ?? ""
    hole = round.currentHole.number
    par = round.currentHole.par
    yardage = round.currentHole.yardage
    frt = round.currentHole.front
    ctr = round.currentHole.middle
    bck = round.currentHole.back
    suggestedClub = round.currentHole.suggestedClub ?? ""
    coachingFocus = round.currentHole.coachingFocus ?? ""
    windMph = round.wind?.speedMph ?? 0
    windDegrees = round.wind?.directionDegrees ?? 0
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
    roundID = (context["roundID"] as? String) ?? (context["roundId"] as? String) ?? roundID
    courseName = (context["courseName"] as? String) ?? courseName
    teeName = (context["teeName"] as? String) ?? teeName
    hole = intFrom(context["hole"])
    par = max(3, intFrom(context["par"]) == 0 ? par : intFrom(context["par"]))
    yardage = max(0, intFrom(context["yardage"]))
    frt = intFrom(context["frt"])
    ctr = intFrom(context["ctr"])
    bck = intFrom(context["bck"])
    suggestedClub = (context["suggestedClub"] as? String) ?? suggestedClub
    coachingFocus = (context["coachingFocus"] as? String) ?? coachingFocus
    windMph = intFrom(context["windMph"])
    windDegrees = doubleFrom(context["windDegrees"])
    if let list = context["clubs"] as? [String] {
      clubs = list
    } else {
      clubs = []
    }

    let round = active ? ActiveRound(
      roundID: roundID.isEmpty ? UUID().uuidString : roundID,
      courseName: courseName,
      teeName: teeName.isEmpty ? nil : teeName,
      startedAt: Date(),
      currentHole: HoleSnapshot(
        number: max(1, hole),
        par: max(3, par),
        yardage: max(0, yardage),
        front: max(0, frt),
        middle: max(0, ctr),
        back: max(0, bck),
        suggestedClub: suggestedClub.isEmpty ? nil : suggestedClub,
        coachingFocus: coachingFocus.isEmpty ? nil : coachingFocus
      ),
      wind: windMph > 0 || windDegrees != 0
        ? WindSnapshot(speedMph: windMph, directionDegrees: windDegrees, directionLabel: nil)
        : nil,
      isActive: true
    ) : nil
    SharedRoundStore.save(round)
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
        self.applyPersistedState()
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
