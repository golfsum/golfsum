import Combine
import Foundation
import WatchConnectivity

final class WatchSyncManager: NSObject, ObservableObject {
    static let shared = WatchSyncManager()

    @Published var connectivityActive = false
    var onRoundSeedReceived: ((String, [WatchHole]) -> Void)?

    private override init() {
        super.init()
        activate()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func sendHoleSaved(roundId: String, hole: WatchHole, totals: WatchRoundTotals) {
        send(payload: makePayload(type: "hole_saved", roundId: roundId, hole: hole, totals: totals))
    }

    func sendRoundEnded(roundId: String, hole: WatchHole, totals: WatchRoundTotals) {
        send(payload: makePayload(type: "end_round", roundId: roundId, hole: hole, totals: totals))
    }

    private func makePayload(type: String, roundId: String, hole: WatchHole, totals: WatchRoundTotals) -> [String: Any] {
        [
            "type": type,
            "roundId": roundId,
            "holeNumber": hole.number,
            "par": hole.par,
            "score": hole.score,
            "putts": hole.putts,
            "fir": hole.fir as Any,
            "gir": hole.gir as Any,
            "scoreToPar": totals.scoreToPar,
            "totalPutts": totals.totalPutts,
            "holesCompleted": totals.holesCompleted,
            "savedAt": Date().timeIntervalSince1970,
        ]
    }

    private func send(payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }

        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        } else {
            session.transferUserInfo(payload)
        }
    }

    private func parseSeed(_ context: [String: Any]) {
        guard
            let roundId = context["roundId"] as? String,
            let rawHoles = context["holes"] as? [[String: Any]]
        else { return }

        let holes: [WatchHole] = rawHoles.compactMap { raw in
            guard let number = raw["number"] as? Int, let par = raw["par"] as? Int else { return nil }
            return WatchHole(number: number, par: par, score: par, putts: 2, fir: nil, gir: nil, isSaved: false)
        }.sorted(by: { $0.number < $1.number })

        guard !holes.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            self?.onRoundSeedReceived?(roundId, holes)
        }
    }
}

extension WatchSyncManager: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.connectivityActive = activationState == .activated
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        parseSeed(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        parseSeed(applicationContext)
    }
}

