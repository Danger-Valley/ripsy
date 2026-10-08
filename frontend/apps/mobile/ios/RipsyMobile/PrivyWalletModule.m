#import <React/RCTBridgeModule.h>

// Standalone audio bridge: reuse this compiled translation unit without
// modifying legacy Xcode target membership or adding a CocoaPods dependency.
#include "Audio/RipsyAudioModule.inc"
#include "Figures/RipsyFigureCache.inc"
#include "Updates/RipsyAppInfo.inc"

@interface RCT_EXTERN_MODULE(PrivyWallet, NSObject)

RCT_EXTERN_METHOD(getState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(sendEmailCode:(NSString *)email
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(loginWithEmailCode:(NSString *)email
                  code:(NSString *)code
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createWallet:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(logout:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signTransaction:(NSString *)transactionBase64
                  buyer:(NSString *)buyer
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signMessage:(NSString *)message
                  buyer:(NSString *)buyer
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
