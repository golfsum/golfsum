#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GolfSumLiveActivityBridge, NSObject)

RCT_EXTERN_METHOD(isSupported:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(upsert:(NSString *)courseName
                  teeLabel:(NSString *)teeLabel
                  holeNumber:(nonnull NSNumber *)holeNumber
                  frontYards:(NSString *)frontYards
                  centerYards:(NSString *)centerYards
                  backYards:(NSString *)backYards
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(end:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

@end
