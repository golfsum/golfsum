import ActivityKit
import WidgetKit
import SwiftUI

@available(iOSApplicationExtension 16.2, *)
struct GolfSumLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GolfSumLiveActivityAttributes.self) { context in
            GolfSumLockScreenView(context: context)
                .activityBackgroundTint(Color(red: 0.10, green: 0.13, blue: 0.16))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "golfsum://gps-round"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.attributes.courseName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text("\(context.attributes.teeLabel) • Hole \(context.state.holeNumber)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.white.opacity(0.7))
                        HStack(spacing: 10) {
                            LiveMetric(label: "F", value: context.state.frontYards, emphasize: false)
                            LiveMetric(label: "C", value: context.state.centerYards, emphasize: true)
                            LiveMetric(label: "B", value: context.state.backYards, emphasize: false)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
            } compactLeading: {
                Text("H\(context.state.holeNumber)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.white)
            } compactTrailing: {
                Text(context.state.centerYards)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color(red: 0.06, green: 0.73, blue: 0.51))
            } minimal: {
                Text(context.state.centerYards)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color(red: 0.06, green: 0.73, blue: 0.51))
            }
            .widgetURL(URL(string: "golfsum://gps-round"))
            .keylineTint(Color(red: 0.06, green: 0.73, blue: 0.51))
        }
    }
}

@available(iOSApplicationExtension 16.2, *)
private struct GolfSumLockScreenView: View {
    let context: ActivityViewContext<GolfSumLiveActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(context.attributes.courseName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)

            Text("\(context.attributes.teeLabel) • Hole \(context.state.holeNumber)")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.72))

            HStack(spacing: 10) {
                LiveMetric(label: "F", value: context.state.frontYards, emphasize: false)
                LiveMetric(label: "C", value: context.state.centerYards, emphasize: true)
                LiveMetric(label: "B", value: context.state.backYards, emphasize: false)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

@available(iOSApplicationExtension 16.2, *)
private struct LiveMetric: View {
    let label: String
    let value: String
    let emphasize: Bool

    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(emphasize ? .white : .white.opacity(0.55))
            Text(value)
                .font(.system(size: emphasize ? 24 : 20, weight: .bold))
                .foregroundStyle(emphasize ? .white : .white.opacity(0.82))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(emphasize ? Color(red: 0.06, green: 0.73, blue: 0.51).opacity(0.18) : Color.white.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(emphasize ? Color(red: 0.06, green: 0.73, blue: 0.51).opacity(0.35) : Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}
