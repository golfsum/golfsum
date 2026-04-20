import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: WatchSessionManager
  @State private var toast: String?
  @State private var toastTask: Task<Void, Never>?
  @State private var showClubPicker = false
  @State private var showQuickStart = false
  @State private var showEndRoundConfirm = false
  @State private var quickStartTee = "Blue"
  private let quickStartTees = ["Blue", "White", "Gold", "Red"]

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
    .sheet(isPresented: $showQuickStart) {
      quickStartSheet
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

  private var distancesPage: some View {
    VStack(spacing: 8) {
      if session.roundActive {
        Text(session.courseName)
          .font(.headline)
          .lineLimit(1)
        Text("Hole \(session.hole) • Par \(session.par) • \(session.yardage) yds")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
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
            Text("\(session.windMph) mph")
              .font(.caption)
          }
          .foregroundStyle(.green)
        }
        if !session.suggestedClub.isEmpty {
          Text(session.suggestedClub)
            .font(.title3.weight(.semibold))
        }
        if !session.coachingFocus.isEmpty {
          Text(session.coachingFocus)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .lineLimit(2)
        }
        Button("Refresh") {
          session.refreshRound()
        }
        .buttonStyle(.bordered)
        Button("Send Test Log") {
          session.sendLogToPhone(level: "debug", message: "Manual test log from Watch", extra: [
            "testValue": 123
          ])
          flash("Test log sent")
        }
        .buttonStyle(.bordered)
        Button("Finish Round") {
          showEndRoundConfirm = true
        }
        .buttonStyle(.borderedProminent)
        Button("Close App") {
          session.dismissApp()
        }
        .buttonStyle(.bordered)
        .tint(.red)
        if session.isRefreshing {
          ProgressView()
            .progressViewStyle(.circular)
        }
        debugPanel
      } else {
        Text("No active round")
          .font(.headline)
        Text("No active round detected. Tap Refresh or start one on your iPhone.")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
        Button("Refresh") {
          session.refreshRound()
        }
        .buttonStyle(.borderedProminent)
        Button("Send Test Log") {
          session.sendLogToPhone(level: "debug", message: "Manual test log from Watch", extra: [
            "testValue": 123
          ])
          flash("Test log sent")
        }
        .buttonStyle(.bordered)
        Button("Start Round") {
          showQuickStart = true
        }
        .buttonStyle(.bordered)
        Button("Close App") {
          session.dismissApp()
        }
        .buttonStyle(.bordered)
        .tint(.red)
        if session.isRefreshing {
          ProgressView()
            .progressViewStyle(.circular)
        }
        debugPanel
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.horizontal, 4)
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
    ScrollView {
      VStack(spacing: 12) {
        Button("Add Shot") {
          if session.clubs.isEmpty {
            flash(session.roundActive ? "Waiting for phone data" : "No active round")
            return
          }
          showClubPicker = true
        }
        .buttonStyle(.borderedProminent)

        Button("Add Putt") {
          session.sendAddPutt { ok in
            if ok {
              flash("Putt logged")
            } else {
              flash("Phone not connected")
            }
          }
        }
        .buttonStyle(.bordered)

        Button("Refresh Round") {
          session.refreshRound()
        }
        .buttonStyle(.bordered)

        if session.roundActive {
          Button("Finish Round") {
            showEndRoundConfirm = true
          }
          .buttonStyle(.borderedProminent)
        }

        Button("Close App") {
          session.dismissApp()
        }
        .buttonStyle(.bordered)
        .tint(.red)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 4)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
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

  private var quickStartSheet: some View {
    List {
      Section("Quick Start Round") {
        HStack {
          Text("Course")
          Spacer()
          Text("Haven")
            .foregroundStyle(.secondary)
        }
        Picker("Tee", selection: $quickStartTee) {
          ForEach(quickStartTees, id: \.self) { tee in
            Text(tee).tag(tee)
          }
        }
        HStack {
          Text("Round")
          Spacer()
          Text("18 Holes")
            .foregroundStyle(.secondary)
        }
        HStack {
          Text("Starting Hole")
          Spacer()
          Text("1")
            .foregroundStyle(.secondary)
        }
      }
      Section {
        Button("Start on iPhone") {
          session.quickStartRound(courseName: "Haven", teeName: quickStartTee, startingHole: 1)
          showQuickStart = false
          flash("Requested on iPhone")
        }
      }
      Section {
        Button("Cancel") {
          showQuickStart = false
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
