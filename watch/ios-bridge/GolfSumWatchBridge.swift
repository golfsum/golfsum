import Foundation
import React

@objc(GolfSumWatchBridge)
class GolfSumWatchBridge: RCTEventEmitter {

  private let sessionManager = WatchSessionManager.shared

  override init() {
    super.init()
    sessionManager.setMessageHandler { [weak self] msg in
      self?.dispatchIncomingMessage(msg)
    }
    sessionManager.start()
  }

  override init() {
    super.init()
    // Activate WCSession as soon as the native module loads (before JS calls `start()`).
    sessionManager.start()
  }

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["GolfSumWatchMessage", "GolfSumWatchGpsCommand"]
  }

  @objc func start() {
    sessionManager.setMessageHandler { [weak self] msg in
      self?.dispatchIncomingMessage(msg)
    }
    sessionManager.start()
  }

  @objc func stop() {
    // Session stays active; clearing the handler would drop GPS + legacy watch events.
  }

  /// Called from JS when GPS round yardages / hole / club list change.
  @objc func updateWatchGpsContext(_ payload: NSDictionary) {
    let dict = payload as? [String: Any] ?? [:]
    sessionManager.updateApplicationContextPayload(dict)
  }

  private func dispatchIncomingMessage(_ msg: [String: Any]) {
    if let action = msg["action"] as? String, action == "roundState" {
      return
    }
    // End-round is handled only on `GolfSumWatchMessage` so JS does not run `handleFinishRound`
    // twice (GPS command listener + AppRoot counter) which broke the flow when no shots exist.
    if let action = msg["action"] as? String, action == "endRound" {
      sendEvent(withName: "GolfSumWatchMessage", body: msg)
      return
    }
    if let action = msg["action"] as? String,
       ["addShot", "addPutt", "advanceHole"].contains(action) {
      sendEvent(withName: "GolfSumWatchGpsCommand", body: msg)
      return
    }
    if msg["type"] != nil {
      sendEvent(withName: "GolfSumWatchMessage", body: msg)
      return
    }
    sendEvent(withName: "GolfSumWatchGpsCommand", body: msg)
  }
}
