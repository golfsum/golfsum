import Foundation
import React
import ActivityKit

@objc(GolfSumLiveActivityBridge)
final class GolfSumLiveActivityBridge: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool { true }

    @objc
    func isSupported(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        if #available(iOS 16.2, *) {
            resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
        } else {
            resolve(false)
        }
    }

    @objc
    func upsert(
        _ courseName: String,
        teeLabel: String,
        holeNumber: NSNumber,
        frontYards: String,
        centerYards: String,
        backYards: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            resolve(false)
            return
        }

        let state = GolfSumLiveActivityAttributes.ContentState(
            holeNumber: holeNumber.intValue,
            frontYards: frontYards,
            centerYards: centerYards,
            backYards: backYards
        )

        Task {
            do {
                if let activity = Activity<GolfSumLiveActivityAttributes>.activities.first {
                    let updated = ActivityContent(state: state, staleDate: nil)
                    await activity.update(updated)
                    resolve(true)
                    return
                }

                let attributes = GolfSumLiveActivityAttributes(
                    courseName: courseName,
                    teeLabel: teeLabel
                )
                let content = ActivityContent(state: state, staleDate: nil)
                _ = try Activity<GolfSumLiveActivityAttributes>.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                resolve(true)
            } catch {
                reject("live_activity_upsert_failed", error.localizedDescription, error)
            }
        }
    }

    @objc
    func end(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            resolve(false)
            return
        }

        Task {
            for activity in Activity<GolfSumLiveActivityAttributes>.activities {
                let state = activity.content.state
                let content = ActivityContent(state: state, staleDate: nil)
                await activity.end(content, dismissalPolicy: .immediate)
            }
            resolve(true)
        }
    }
}
