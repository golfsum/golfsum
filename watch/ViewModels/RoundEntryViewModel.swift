import Foundation

final class RoundEntryViewModel: ObservableObject {
    @Published var roundId: String = "watch_round_local"
    @Published var holes: [WatchHole] = Self.defaultHoles()
    @Published var currentIndex: Int = 0
    @Published var syncStatusText: String = "Ready"

    let sync = WatchSyncManager.shared

    init() {
        sync.onRoundSeedReceived = { [weak self] roundId, holes in
            self?.roundId = roundId
            self?.holes = holes
            self?.currentIndex = 0
            self?.syncStatusText = "Round synced from iPhone"
        }
    }

    var currentHole: WatchHole {
        get { holes[currentIndex] }
        set { holes[currentIndex] = newValue }
    }

    var isLastHole: Bool { currentIndex == holes.count - 1 }

    var totals: WatchRoundTotals {
        let saved = holes.filter(\.isSaved)
        let scoreToPar = saved.reduce(0) { $0 + ($1.score - $1.par) }
        let totalPutts = saved.reduce(0) { $0 + $1.putts }
        return WatchRoundTotals(scoreToPar: scoreToPar, totalPutts: totalPutts, holesCompleted: saved.count)
    }

    func updateScore(_ score: Int) {
        currentHole.score = max(1, min(15, score))
    }

    func updatePutts(_ putts: Int) {
        currentHole.putts = max(0, min(8, putts))
    }

    func updateFIR(_ fir: Bool?) {
        currentHole.fir = fir
    }

    func updateGIR(_ gir: Bool?) {
        currentHole.gir = gir
    }

    func saveCurrentHole() {
        currentHole.isSaved = true
        sync.sendHoleSaved(roundId: roundId, hole: currentHole, totals: totals)
        syncStatusText = "Hole \(currentHole.number) saved"

        if !isLastHole {
            currentIndex += 1
        }
    }

    func endRound() {
        currentHole.isSaved = true
        sync.sendRoundEnded(roundId: roundId, hole: currentHole, totals: totals)
        syncStatusText = "Round sent to iPhone"
    }

    private static func defaultHoles() -> [WatchHole] {
        let pars = [4,4,3,5,4,4,3,5,4,4,5,3,4,4,3,5,4,4]
        return pars.enumerated().map { idx, par in
            WatchHole(number: idx + 1, par: par, score: par, putts: 2, fir: nil, gir: nil, isSaved: false)
        }
    }
}

