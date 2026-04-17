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
  @Published var currentYardage: Int = 0
  @Published var frtYards: Int = 0
  @Published var midYards: Int = 0
  @Published var bckYards: Int = 0
  @Published var suggestedClub = ""
  @Published var coachingFocus = ""
  @Published var windMph: Int = 0
  @Published var windDegrees: Double = 0
  @Published var windArrowDegrees: Double = 0
  @Published var clubs: [String] = []
  @Published var phoneReachable = false
  @Published var sessionStateLabel = "inactive"
  @Published var lastSyncDescription = "Never"
  @Published var lastReceivedRoundID = "—"
  @Published var isRefreshing = false
  @Published var messagesReceivedCount = 0
  @Published var lastContextType: String = "—"
  @Published var lastContextYardageLine: String = "—"
  private var hasNotifiedRoundStart = false
  private var refreshRetryTask: Task<Void, Never>?
  private var pendingLifecycleMessages: [[String: Any]] = []

  private func debugLog(_ message: String) {
    print("[GolfSumWatchWC] \(message)")
  }

  func sendLogToPhone(level: String, message: String, extra: [String: Any]? = nil) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.activate()
    let logPayload: [String: Any] = [
      "type": "watchLog",
      "level": level,
      "message": message,
      "timestamp": Date().timeIntervalSince1970,
      "roundID": roundID.isEmpty ? "unknown" : roundID,
      "currentHole": hole,
      "source": "watch",
      "extra": extra ?? [:],
    ]

    debugLog("sendLogToPhone \(logPayload)")

    if session.activationState == .activated {
      session.transferUserInfo(logPayload)
      debugLog("Queued watch log via transferUserInfo")
    }

    if session.isReachable {
      session.sendMessage(logPayload, replyHandler: nil) { error in
        self.debugLog("watchLog sendMessage failed: \(error.localizedDescription)")
      }
    }
  }

  private func flushPendingLifecycleMessages() {
    guard WCSession.isSupported(), !pendingLifecycleMessages.isEmpty else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    let queued = pendingLifecycleMessages
    pendingLifecycleMessages.removeAll()
    queued.forEach { payload in
      debugLog("Flushing queued lifecycle payload: \(payload)")
      pushLifecyclePayload(payload, allowReply: false, reply: { _ in })
    }
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    let session = WCSession.default
    session.delegate = self
    session.activate()
    debugLog("activate() called")
    sendLogToPhone(level: "info", message: "Watch session activate() called", extra: [
      "reachable": session.isReachable,
      "state": label(for: session.activationState),
    ])
    DispatchQueue.main.async {
      self.applyPersistedState()
      self.applyIncomingState(session.applicationContext)
      self.phoneReachable = session.isReachable
      self.sessionStateLabel = self.label(for: session.activationState)
      if !self.roundActive {
        self.scheduleRetrySync()
      }
    }
  }

  func refreshRound() {
    refreshRetryTask?.cancel()
    applyPersistedState()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    isRefreshing = true
    session.activate()
    phoneReachable = session.isReachable
    sessionStateLabel = label(for: session.activationState)
    debugLog("refreshRound reachable=\(session.isReachable) state=\(session.activationState.rawValue)")
    sendLogToPhone(level: "debug", message: "Refresh requested from watch", extra: [
      "reachable": session.isReachable,
      "state": label(for: session.activationState),
    ])

    guard session.activationState == .activated, session.isReachable else {
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        self.isRefreshing = false
      }
      scheduleRetrySync()
      return
    }

    let message: [String: Any] = ["action": "requestActiveRound", "type": "requestActiveRound"]
    session.sendMessage(message, replyHandler: { payload in
      DispatchQueue.main.async {
        self.debugLog("refreshRound reply: \(payload)")
        self.applyIncomingState(payload)
        self.isRefreshing = false
      }
    }, errorHandler: { error in
      DispatchQueue.main.async {
        self.debugLog("refreshRound error: \(error.localizedDescription)")
        self.isRefreshing = false
        self.scheduleRetrySync()
      }
    })
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
    currentYardage = round.currentHole.yardage
    frtYards = round.currentHole.front
    midYards = round.currentHole.middle
    bckYards = round.currentHole.back
    suggestedClub = round.currentHole.suggestedClub ?? ""
    coachingFocus = round.currentHole.coachingFocus ?? ""
    windMph = round.wind?.speedMph ?? 0
    windDegrees = round.wind?.directionDegrees ?? 0
    // windArrowDegrees comes via application context; keep current value if round data lacks it
    lastReceivedRoundID = round.roundID
  }

  private func label(for state: WCSessionActivationState) -> String {
    switch state {
    case .activated:
      return "activated"
    case .inactive:
      return "inactive"
    case .notActivated:
      return "notActivated"
    @unknown default:
      return "unknown"
    }
  }

  private func updateLastSync(at unixTimestamp: TimeInterval?) {
    let date = unixTimestamp.map(Date.init(timeIntervalSince1970:)) ?? Date()
    let formatter = DateFormatter()
    formatter.dateFormat = "h:mm:ss a"
    lastSyncDescription = formatter.string(from: date)
  }

  private func scheduleRetrySync() {
    refreshRetryTask?.cancel()
    refreshRetryTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      if !self.roundActive {
        self.refreshRound()
      }
    }
  }

  /// Merge keys from phone: `active` and/or `roundActive`, hole, frt, ctr, bck, clubs.
  private func applyIncomingState(_ context: [String: Any]) {
    if context.isEmpty { return }
    debugLog("applyIncomingState \(context)")
    messagesReceivedCount += 1
    let msgType = (context["type"] as? String) ?? (context["action"] as? String) ?? "—"
    lastContextType = msgType

    if msgType == "roundEnded" {
      hasNotifiedRoundStart = false
      roundActive = false
      currentYardage = 0
      frtYards = 0
      midYards = 0
      bckYards = 0
      SharedRoundStore.save(nil)
      lastContextYardageLine = "round ended"
      debugLog("applyIncomingState: roundEnded — cleared shared round")
      sendLogToPhone(level: "info", message: "roundEnded received on watch", extra: [
        "roundID": roundID,
      ])
      return
    }

    let active = boolFrom(context["roundActive"]) || boolFrom(context["active"])
    if active && !roundActive {
      notifyRoundStartedIfNeeded()
    }
    if !active {
      hasNotifiedRoundStart = false
    }
    roundActive = active
    roundID = (context["roundID"] as? String) ?? (context["roundId"] as? String) ?? roundID
    lastReceivedRoundID = roundID.isEmpty ? lastReceivedRoundID : roundID
    courseName = (context["courseName"] as? String) ?? courseName
    teeName = (context["teeName"] as? String) ?? teeName
    let nextHole = max(intFrom(context["currentHole"]), intFrom(context["hole"]))
    if nextHole > 0 { hole = nextHole }
    let nextPar = intFrom(context["par"])
    if nextPar > 0 { par = max(3, nextPar) }
    let nextYardage = intFrom(context["yardage"])
    if nextYardage > 0 || !active { yardage = max(0, nextYardage) }
    let nextFrt = intFrom(context["frt"])
    if nextFrt > 0 || !active { frt = max(0, nextFrt) }
    let nextCtr = intFrom(context["ctr"])
    if nextCtr > 0 || !active { ctr = max(0, nextCtr) }
    let nextBck = intFrom(context["bck"])
    if nextBck > 0 || !active { bck = max(0, nextBck) }
    let nextCurrentYardage = max(intFrom(context["currentYardage"]), nextYardage)
    if nextCurrentYardage > 0 || !active { currentYardage = max(0, nextCurrentYardage) } else { currentYardage = yardage }
    let nextFrtYards = max(intFrom(context["frtYards"]), nextFrt)
    if nextFrtYards > 0 || !active { frtYards = max(0, nextFrtYards) } else { frtYards = frt }
    let nextMidYards = max(intFrom(context["midYards"]), nextCtr)
    if nextMidYards > 0 || !active { midYards = max(0, nextMidYards) } else { midYards = ctr }
    let nextBckYards = max(intFrom(context["bckYards"]), nextBck)
    if nextBckYards > 0 || !active { bckYards = max(0, nextBckYards) } else { bckYards = bck }
    suggestedClub = (context["suggestedClub"] as? String) ?? suggestedClub
    coachingFocus = (context["coachingFocus"] as? String) ?? coachingFocus
    windMph = intFrom(context["windMph"])
    windDegrees = doubleFrom(context["windDegrees"])
    windArrowDegrees = doubleFrom(context["windArrowDegrees"])
    if let list = context["clubs"] as? [String] {
      clubs = list
    } else {
      clubs = []
    }
    updateLastSync(at: doubleFrom(context["lastSyncAt"]) == 0 ? nil : doubleFrom(context["lastSyncAt"]))
    isRefreshing = false
    lastContextYardageLine = "y=\(currentYardage) f=\(frtYards) m=\(midYards) b=\(bckYards)"
    debugLog("Received context dictionary: \(context)")
    debugLog("Received full context with yardages: yardage=\(currentYardage) frt=\(frtYards) ctr=\(midYards) bck=\(bckYards)")
    sendLogToPhone(level: currentYardage > 0 ? "info" : "warn", message: "Received full context from phone", extra: [
      "yardage": currentYardage,
      "frt": frtYards,
      "mid": midYards,
      "bck": bckYards,
      "fullDataVersion": intFrom(context["fullDataVersion"]),
      "lastUpdated": doubleFrom(context["lastUpdated"]),
    ])
    objectWillChange.send()

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

  func sendEndRound(reply: @escaping (Bool) -> Void) {
    isRefreshing = true
    let payload: [String: Any] = [
      "action": "endRound",
      "type": "endRound",
      "roundID": roundID,
      "finalHole": hole,
      "lastHole": hole,
      "timestamp": Date().timeIntervalSince1970,
    ]
    sendLogToPhone(level: "info", message: "Finish Round tapped on watch", extra: [
      "roundID": roundID,
      "lastHole": hole,
    ])
    sendRoundLifecyclePayload(payload, reply: reply)
  }

  private func sendOrFail(_ message: [String: Any], reply: @escaping (Bool) -> Void) {
    guard WCSession.isSupported() else {
      isRefreshing = false
      reply(false)
      return
    }
    let session = WCSession.default
    guard session.activationState == .activated else {
      isRefreshing = false
      reply(false)
      return
    }
    guard session.isReachable else {
      // Phone may be locked or app backgrounded; queued delivery still reaches `didReceiveUserInfo` on iPhone.
      session.transferUserInfo(message)
      DispatchQueue.main.async {
        self.isRefreshing = false
        reply(true)
      }
      return
    }
    session.sendMessage(
      message,
      replyHandler: { _ in
        DispatchQueue.main.async {
          self.isRefreshing = false
          reply(true)
        }
      },
      errorHandler: { _ in
        DispatchQueue.main.async {
          session.transferUserInfo(message)
          self.isRefreshing = false
          reply(true)
        }
      }
    )
  }

  private func sendRoundLifecyclePayload(_ message: [String: Any], reply: @escaping (Bool) -> Void) {
    guard WCSession.isSupported() else {
      isRefreshing = false
      reply(false)
      return
    }
    let session = WCSession.default
    session.activate()
    guard session.activationState == .activated else {
      pendingLifecycleMessages.append(message)
      debugLog("Queued lifecycle payload until activation completes: \(message)")
      DispatchQueue.main.async {
        self.isRefreshing = false
        reply(true)
      }
      return
    }

    pushLifecyclePayload(message, allowReply: true, reply: reply)
  }

  private func pushLifecyclePayload(_ message: [String: Any], allowReply: Bool, reply: @escaping (Bool) -> Void) {
    let session = WCSession.default
    var lifecycleMessage = message
    lifecycleMessage["lastSyncAt"] = Date().timeIntervalSince1970

    do {
      try session.updateApplicationContext(lifecycleMessage)
      debugLog("Sent applicationContext lifecycle payload: \(lifecycleMessage)")
    } catch {
      debugLog("Failed to send applicationContext lifecycle payload: \(error.localizedDescription)")
    }
    session.transferUserInfo(lifecycleMessage)
    debugLog("Queued transferUserInfo lifecycle payload: \(lifecycleMessage)")

    if session.isReachable {
      session.sendMessage(
        lifecycleMessage,
        replyHandler: { payload in
          DispatchQueue.main.async {
            self.debugLog("Lifecycle message reply: \(payload)")
            self.isRefreshing = false
            reply(true)
          }
        },
        errorHandler: { error in
          DispatchQueue.main.async {
            self.debugLog("Lifecycle message send error: \(error.localizedDescription)")
            self.isRefreshing = false
            reply(false)
          }
        }
      )
    } else {
      debugLog("Lifecycle payload: watch not reachable — applicationContext + transferUserInfo only")
      DispatchQueue.main.async {
        self.isRefreshing = false
        if allowReply {
          // transferUserInfo queued; iPhone processes when app wakes (same path as sendMessage).
          reply(true)
        }
      }
    }
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    DispatchQueue.main.async {
      self.debugLog("activationDidComplete state=\(activationState.rawValue) error=\(error?.localizedDescription ?? "nil")")
      self.sendLogToPhone(level: error == nil ? "info" : "error", message: "watch activationDidComplete", extra: [
        "state": self.label(for: activationState),
        "error": error?.localizedDescription ?? "",
      ])
      self.phoneReachable = session.isReachable
      self.sessionStateLabel = self.label(for: activationState)
      if activationState == .activated {
        self.applyPersistedState()
        self.applyIncomingState(session.applicationContext)
        self.flushPendingLifecycleMessages()
        if !self.roundActive {
          self.scheduleRetrySync()
        }
      }
    }
  }

  func quickStartRound(courseName: String = "Haven", teeName: String = "Blue", startingHole: Int = 1) {
    let localRound = ActiveRound(
      roundID: "watch-\(UUID().uuidString)",
      courseName: courseName,
      teeName: teeName,
      startedAt: Date(),
      currentHole: HoleSnapshot(
        number: startingHole,
        par: 4,
        yardage: 382,
        front: 0,
        middle: 0,
        back: 0,
        suggestedClub: nil,
        coachingFocus: nil
      ),
      wind: nil,
      isActive: true
    )
    SharedRoundStore.save(localRound)
    applyPersistedState()

    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.activate()

    let message: [String: Any] = [
      "type": "startRoundFromWatch",
      "course": courseName,
      "courseName": courseName,
      "tee": teeName,
      "teeName": teeName,
      "currentHole": startingHole,
      "holeNumber": startingHole,
      "par": 4,
      "yardage": 382,
      "timestamp": Date().timeIntervalSince1970,
    ]
    debugLog("quickStartRound \(message)")
    sendLogToPhone(level: "info", message: "startRoundFromWatch requested", extra: [
      "course": courseName,
      "tee": teeName,
      "startingHole": startingHole,
    ])
    if session.activationState != .activated {
      pendingLifecycleMessages.append(message)
      debugLog("Queued quickStartRound until activation completes")
      return
    }
    pushLifecyclePayload(message, allowReply: false, reply: { _ in })
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async {
      self.debugLog("reachability changed: \(session.isReachable)")
      self.sendLogToPhone(level: "debug", message: "watch reachability changed", extra: [
        "reachable": session.isReachable,
        "state": self.label(for: session.activationState),
      ])
      self.phoneReachable = session.isReachable
      self.sessionStateLabel = self.label(for: session.activationState)
      self.flushPendingLifecycleMessages()
      if session.isReachable && !self.roundActive {
        self.refreshRound()
      }
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async {
      self.sendLogToPhone(level: "debug", message: "didReceiveApplicationContext on watch", extra: [
        "keys": Array(applicationContext.keys).sorted(),
        "yardage": self.intFrom(applicationContext["yardage"]),
        "frt": self.intFrom(applicationContext["frt"]),
        "mid": self.intFrom(applicationContext["ctr"]),
        "bck": self.intFrom(applicationContext["bck"]),
      ])
      self.applyIncomingState(applicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      let action = message["action"] as? String
      let type = message["type"] as? String
      self.debugLog("didReceiveMessage (no reply) action=\(action ?? "nil") type=\(type ?? "nil")")
      if action == "roundState" || type == "startRound" || type == "roundState" || type == "roundEnded" {
        self.applyIncomingState(message)
        return
      }
    }
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    DispatchQueue.main.async {
      let action = message["action"] as? String
      let type = message["type"] as? String
      self.debugLog("didReceiveMessage+reply action=\(action ?? "nil") type=\(type ?? "nil")")
      if action == "roundState" || type == "startRound" || type == "roundState" || type == "roundEnded" {
        self.applyIncomingState(message)
        replyHandler(["ok": true])
        return
      }
      replyHandler(["ok": false, "error": "unhandled"])
    }
  }
}
