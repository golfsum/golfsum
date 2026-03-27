import SwiftUI

@main
struct GolfSumWatchApp: App {
    @StateObject private var viewModel = RoundEntryViewModel()

    var body: some Scene {
        WindowGroup {
            TabView {
                HoleEntryView(viewModel: viewModel)
                RunningTotalsView(viewModel: viewModel)
            }
            .tabViewStyle(.verticalPage)
        }
    }
}

