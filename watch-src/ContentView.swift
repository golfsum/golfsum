import SwiftUI
import WatchKit

struct ContentView: View {
  @EnvironmentObject private var session: WatchSessionManager
  @State private var toast: String?
  @State private var toastTask: Task<Void, Never>?
  @State private var showClubPicker = false
  @State private var showEndRoundConfirm = false

  private func haptic(_ type: WKHapticType) {
    WKInterfaceDevice.current().play(type)
  }

  var body: some View {
    Group {
      if session.dismissed {
        dismissedPage
      } else if session.roundActive {
        TabView {
          distancesPage
          shotTrackingPage
          holeOverviewPage
        }
        .tabViewStyle(.page)
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
        haptic(.notification)
        session.sendEndRound { ok in
          haptic(ok ? .success : .failure)
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
              teeBadge(session.teeName)
            }
            // Equal-width columns so a 3-digit MID can't overflow a column
            // sized to its own intrinsic width and wrap onto a second line.
            HStack(spacing: 4) {
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
        Text(session.phoneReachable
             ? "Open GolfSum on your iPhone and start a GPS round."
             : "Open GolfSum on your iPhone to connect.")
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
        Text(session.phoneReachable ? "iPhone connected" : "Waiting for iPhone…")
          .font(.system(size: 9))
          .foregroundStyle(session.phoneReachable ? .green : .secondary)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .padding(.horizontal, 6)
    }
  }

  /// Map a tee label to a foreground color. Unknown names fall back to green
  /// so unusual tee names (e.g. "Mercedes") are still readable without picking
  /// an arbitrary wrong color.
  private func teeColor(_ name: String) -> Color {
    switch name.lowercased() {
    case "black", "tips": return .white
    case "blue", "championship": return .blue
    case "white": return .white
    case "gold", "yellow", "senior": return .yellow
    case "green": return .green
    case "red", "forward", "ladies": return .red
    case "silver", "grey", "gray": return .gray
    case "orange": return .orange
    case "purple": return .purple
    default: return .green
    }
  }

  private func teeBadge(_ name: String) -> some View {
    let color = teeColor(name)
    return Text(name)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(color == .white ? Color.black : Color.white)
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .background(
        RoundedRectangle(cornerRadius: 4, style: .continuous)
          .fill(color.opacity(0.9))
      )
  }

  private func yardColumn(_ label: String, _ value: Int) -> some View {
    VStack(spacing: 4) {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text("\(value)")
        .font(.system(size: 24, weight: .semibold, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
    .frame(maxWidth: .infinity) // equal column widths so 3-digit MID can't wrap
  }

  private var shotTrackingPage: some View {
    List {
      Button("Add Shot") {
        if session.clubs.isEmpty {
          haptic(.failure)
          flash(session.roundActive ? "Waiting for phone data" : "No active round")
          return
        }
        haptic(.click)
        showClubPicker = true
      }
      .disabled(!session.roundActive)

      Button("Add Putt") {
        haptic(.click)
        session.sendAddPutt { ok in
          haptic(ok ? .success : .failure)
          flash(ok ? "Putt logged" : "Phone not connected")
        }
      }
      .disabled(!session.roundActive)

      Button("Refresh Round") {
        haptic(.click)
        session.refreshRound()
      }

      if session.roundActive {
        Button("Finish Round") {
          haptic(.click)
          showEndRoundConfirm = true
        }
        .foregroundStyle(.red)
      }

      Button("Close App") {
        haptic(.click)
        session.dismissApp()
      }
      .foregroundStyle(.red)
    }
    .listStyle(.carousel)
  }

  /// Third page: at-a-glance hole summary — course / hole / par / scorecard yards,
  /// tee, suggested club, coaching focus, wind. Swiped to from the shot-tracking page.
  private var holeOverviewPage: some View {
    List {
      Section("Hole") {
        overviewRow("Course", session.courseName)
        overviewRow("Hole", "\(session.hole)  •  Par \(session.par)")
        overviewRow("Yardage", "\(session.yardage) yds")
        if !session.teeName.isEmpty {
          HStack {
            Text("Tee").font(.caption2).foregroundStyle(.secondary)
            Spacer()
            teeBadge(session.teeName)
          }
        }
      }
      Section("To Green") {
        overviewRow("Front", "\(session.frt) yds")
        overviewRow("Middle", "\(session.ctr) yds")
        overviewRow("Back", "\(session.bck) yds")
      }
      if session.windMph > 0 || !session.suggestedClub.isEmpty || !session.coachingFocus.isEmpty {
        Section("Play") {
          if !session.suggestedClub.isEmpty {
            overviewRow("Suggested", session.suggestedClub)
          }
          if session.windMph > 0 {
            HStack {
              Text("Wind").font(.caption2).foregroundStyle(.secondary)
              Spacer()
              Image(systemName: "location.north.fill")
                .rotationEffect(.degrees(session.windArrowDegrees))
                .foregroundStyle(.green)
              Text("\(session.windMph) mph").font(.caption).foregroundStyle(.green)
            }
          }
          if !session.coachingFocus.isEmpty {
            Text(session.coachingFocus)
              .font(.caption2)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.leading)
          }
        }
      }
    }
    .listStyle(.carousel)
  }

  private func overviewRow(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label).font(.caption2).foregroundStyle(.secondary)
      Spacer()
      Text(value).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.7)
    }
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


  private var clubPickerSheet: some View {
    List {
      Section {
        ForEach(session.clubs, id: \.self) { club in
          Button(club) {
            haptic(.click)
            showClubPicker = false
            session.sendAddShot(club: club) { ok in
              haptic(ok ? .success : .failure)
              flash(ok ? "Shot logged" : "Phone not connected")
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
