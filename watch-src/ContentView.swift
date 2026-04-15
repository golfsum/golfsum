import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: WatchSessionManager
  @State private var toast: String?
  @State private var toastTask: Task<Void, Never>?
  @State private var showClubPicker = false

  var body: some View {
    TabView {
      distancesPage
      shotTrackingPage
    }
    .tabViewStyle(.page)
    .sheet(isPresented: $showClubPicker) {
      clubPickerSheet
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
              .rotationEffect(.degrees(session.windDegrees))
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
      } else {
        Text("No active round")
          .font(.headline)
        Text("Start one on your iPhone")
          .font(.caption2)
          .foregroundStyle(.secondary)
        Button("Refresh") {
          session.refreshRound()
        }
        .buttonStyle(.borderedProminent)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
