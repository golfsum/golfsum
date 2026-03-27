import Foundation
import React

@objc(GolfSumWatchBridge)
class GolfSumWatchBridge: RCTEventEmitter {

  private let sessionManager = WatchSessionManager.shared

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
