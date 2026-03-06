import Foundation
import WatchConnectivity

@objc(GolfSumWatchBridge)
class GolfSumWatchBridge: NSObject, WCSessionDelegate {

    @objc static let shared = GolfSumWatchBridge()
    private var messageHandler: (([String: Any]) -> Void)?

    @objc func setMessageHandler(_ handler: @escaping ([String: Any]) -> Void) {
        messageHandler = handler
    }

    @objc func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    @objc func sendMessage(_ message: [String: Any]) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    func session(_ session: WCSession,
                 didReceiveMessage message: [String: Any]) {
        messageHandler?(message)
    }
}
