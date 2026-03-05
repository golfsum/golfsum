import Foundation
import WatchConnectivity
import React

@objc(GolfSumWatchBridge)
final class GolfSumWatchBridge: RCTEventEmitter, WCSessionDelegate {
    private var hasListeners = false

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["GolfSumWatchMessage"]
    }

    @objc
    func start() {
        activateSession()
    }

    @objc
    func stop() {
        // Keep WCSession active; no explicit stop needed.
    }

    override func startObserving() {
        hasListeners = true
        activateSession()
    }

    override func stopObserving() {
        hasListeners = false
    }

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func emit(_ message: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: "GolfSumWatchMessage", body: message)
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        emit(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any] = [:]) {
        emit(userInfo)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        emit(applicationContext)
    }
}

