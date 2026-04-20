import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: WatchSessionManager
  @State private var toast: String?
  @State private var toastTask: Task<Void, Never>?
  @State private var showClubPicker = false
  @State private var showEndRoundConfirm = false

  var body: some View {
    Group {
      if session.dismissed {
        dismissedPage
      } else {
        TabView {
          distancesPage
          shotTrackingPage
        }
        .tabViewStyle(.page)
      }
    }
    .sheet(isPresented: $showClubPicker) {
      clubPickerSheet
    }
    .alert("End round on iPhone?", isPresented: $showEndRoundConfirm) {
      Button("Cancel", role: .cancel) {}
      Button("End Round", role: .destructive) {
        session.sendEndRound { ok in
          flash(ok ? "Sent — confirm on iPhone" : "Keep iPhone unlocked nearby, then try again")
        }
      }
    } message: {
      Text("GolfSum on iPhone will offer to finish or delete this round. Stay in Bluetooth range.")
    }
    .overlay(alignment: .bottom) {
      if let toast {
        Text(toast)
          .font(.footnote)
          .padding(.horizontal, 10)
          .padding(.vertical, 6)
          .background(Color.black.opacity(0.55))
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .padding(.bottom, 4)
      }
    }
    .onAppear {
      if !session.roundActive {
        session.refreshRound()
      }
    }
  }

  @ViewBuilder
  private var distancesPage: some View {
    if session.roundActive {
      // Active round: use List so the digital crown scrolls cleanly without
      // fighting the TabView's horizontal paging gesture.
      List {
        Section {
          VStack(spacing: 4) {
            Text(session.courseName)
              .font(.headline)
              .lineLimit(1)
            Text("Hole \(session.hole) • Par \(session.par) • \(session.yardage) yds")
              .font(.caption2)
              .foregroundStyle(.secondary)
            if !session.teeName.isEmpty {
              Text(session.teeName)
                .font(.caption2)
                .foregroundStyle(.green)
            }
            HStack(spacing: 12) {
              yardColumn("FRT", session.frt)
              yardColumn("MID", session.ctr)
              yardColumn("BCK", session.bck)
            }
            if session.windMph > 0 {
              HStack(spacing: 6) {
                Image(systemName: "location.north.fill")
                  .rotationEffect(.degrees(session.windArrowDegrees))
                Text("\(session.windMph) mph").font(.caption)
              }
              .foregroundStyle(.green)
            }
            if !session.suggestedClub.isEmpty {
              Text(session.suggestedClub).font(.title3.weight(.semibold))
            }
          }
          .frame(maxWidth: .infinity)
        }
        Section {
          Button("Refresh") { session.refreshRound() }
          Button("Finish Round") { showEndRoundConfirm = true }
            .foregroundStyle(.red)
          Button("Close App") { session.dismissApp() }
            .foregroundStyle(.red)
        }
        Section("Debug") {
          debugRow("Reachable", session.phoneReachable ? "Yes" : "No")
          debugRow("Last Sync", session.lastSyncDescription)
          debugRow("Messages", "\(session.messagesReceivedCount)")
          debugRow("Yards", session.lastContextYardageLine)
        }
      }
      .listStyle(.carousel)
    } else {
      // Inactive state: compact layout that fits without scrolling. Re-renders
      // from Published var updates no longer bounce the view.
      VStack(spacing: 8) {
        Image(systemName: "iphone.gen3")
          .font(.title3)
          .foregroundStyle(.green)
        Text("Start on iPhone")
          .font(.headline)
        Text("Start a GPS round on your iPhone — yardages will appear here automatically.")
          .font(.system(size: 11))
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .lineLimit(3)
        HStack(spacing: 6) {
          Button("Refresh") { session.refreshRound() }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
          Button("Close") { session.dismissApp() }
            .buttonStyle(.bordered)
            .tint(.red)
            .controlSize(.small)
        }
        Text("\(session.phoneReachable ? "iPhone ready" : "iPhone asleep") · Msgs \(session.messagesReceivedCount)")
          .font(.system(size: 9))
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(.horizontal, 6)
    }
  }

  private func debugRow(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label).font(.system(size: 10)).foregroundStyle(.secondary)
      Spacer()
      Text(value).font(.system(size: 10, weight: .medium)).lineLimit(1)
    }
  }

  private func yardColumn(_ label: String, _ value: Int) -> some View {
    VStack(spacing: 4) {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text("\(value)")
        .font(.system(size: 28, weight: .semibold, design: .rounded))
        .minimumScaleFactor(0.5)
    }
  }

  private var shotTrackingPage: some View {
    List {
      Button("Add Shot") {
        if session.clubs.isEmpty {
          flash(session.roundActive ? "Waiting for phone data" : "No active round")
          return
        }
        showClubPicker = true
      }
      .disabled(!session.roundActive)

      Button("Add Putt") {
        session.sendAddPutt { ok in
          flash(ok ? "Putt logged" : "Phone not connected")
        }
      }
      .disabled(!session.roundActive)

      Button("Refresh Round") {
        session.refreshRound()
      }

      if session.roundActive {
        Button("Finish Round") {
          showEndRoundConfirm = true
        }
        .foregroundStyle(.red)
      }

      Button("Close App") {
        session.dismissApp()
      }
      .foregroundStyle(.red)
    }
    .listStyle(.carousel)
  }

  private var dismissedPage: some View {
    VStack(spacing: 10) {
      Image(systemName: "moon.zzz.fill")
        .font(.title2)
        .foregroundStyle(.secondary)
      Text("GolfSum paused")
        .font(.headline)
      Text("Press the Digital Crown or side button to return to the watch face.")
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Button("Reopen") {
        session.resetDismissed()
        session.refreshRound()
      }
      .buttonStyle(.borderedProminent)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.horizontal, 6)
  }

  private var debugPanel: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("Reachable: \(session.phoneReachable ? "Yes" : "No")")
      Text("Session: \(session.sessionStateLabel)")
      Text("Last Sync: \(session.lastSyncDescription)")
      Text("Messages: \(session.messagesReceivedCount)")
      Text("Round ID: \(session.lastReceivedRoundID)")
      Text("Last type: \(session.lastContextType)")
      Text("Yards: \(session.lastContextYardageLine)")
    }
    .font(.system(size: 10, weight: .medium, design: .rounded))
    .foregroundStyle(.secondary)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, 4)
  }

  private var clubPickerSheet: some View {
    List {
      Section {
        ForEach(session.clubs, id: \.self) { club in
          Button(club) {
            showClubPicker = false
            session.sendAddShot(club: club) { ok in
              if ok {
                flash("Shot logged")
              } else {
                flash("Phone not connected")
              }
            }
          }
        }
      }
      Section {
        Button("Cancel") {
          showClubPicker = false
        }
      }
    }
  }

  private func flash(_ message: String) {
    toastTask?.cancel()
    toast = message
    toastTask = Task {
      try? await Task.sleep(nanoseconds: 1_500_000_000)
      await MainActor.run {
        toast = nil
      }
    }
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView()
      .environmentObject(WatchSessionManager.shared)
  }
}
