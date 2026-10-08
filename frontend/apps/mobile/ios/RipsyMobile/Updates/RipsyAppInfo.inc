#import <Foundation/Foundation.h>

@interface RipsyAppInfo : NSObject <RCTBridgeModule>
@end
@implementation RipsyAppInfo
RCT_EXPORT_MODULE(RipsyAppInfo)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (NSDictionary *)constantsToExport {
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  return @{ @"buildNumber": info[@"CFBundleVersion"] ?: @"",
            @"version": info[@"CFBundleShortVersionString"] ?: @"",
            @"installer": @"" };
}
@end
