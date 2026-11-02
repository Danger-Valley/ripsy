#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>

// Bound downloads before a bad server response can fill application storage.
@interface RipsyFigureDownload : NSObject <NSURLSessionDownloadDelegate>
@property(nonatomic) NSUInteger expected;
@property(nonatomic, strong) NSURLSession *session;
@property(nonatomic, copy) void (^completion)(NSURL *, NSHTTPURLResponse *, NSError *);
@end
@implementation RipsyFigureDownload
- (void)finish:(NSURL *)location response:(NSHTTPURLResponse *)response error:(NSError *)error {
  void (^completion)(NSURL *, NSHTTPURLResponse *, NSError *) = self.completion;
  self.completion = nil;
  if (completion) completion(location, response, error);
  [self.session finishTasksAndInvalidate]; self.session = nil;
}
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task didWriteData:(int64_t)written totalBytesWritten:(int64_t)total totalBytesExpectedToWrite:(int64_t)expected {
  if (total > self.expected || expected > self.expected) [task cancel];
}
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task didFinishDownloadingToURL:(NSURL *)location {
  [self finish:location response:(NSHTTPURLResponse *)task.response error:nil];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  if (error) [self finish:nil response:nil error:error];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
  completionHandler(nil);
}
@end

@interface RipsyFigureCache : NSObject <RCTBridgeModule>
@end
@implementation RipsyFigureCache
RCT_EXPORT_MODULE(RipsyFigureCache)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (BOOL)validFile:(NSURL *)url hash:(NSString *)hash size:(NSUInteger)size extension:(NSString *)extension {
  if ([[NSFileManager.defaultManager attributesOfItemAtPath:url.path error:nil][NSFileSize] unsignedLongLongValue] != size) return NO;
  NSData *data = [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:nil];
  if (!data || data.length != size) return NO;
  if ([extension isEqualToString:@"png"]) {
    const unsigned char png[] = {137,80,78,71,13,10,26,10};
    if (data.length < 24 || ![[data subdataWithRange:NSMakeRange(0, 8)] isEqualToData:[NSData dataWithBytes:png length:8]]) return NO;
    const unsigned char *b = data.bytes;
    uint32_t width = ((uint32_t)b[16] << 24) | ((uint32_t)b[17] << 16) | ((uint32_t)b[18] << 8) | b[19];
    uint32_t height = ((uint32_t)b[20] << 24) | ((uint32_t)b[21] << 16) | ((uint32_t)b[22] << 8) | b[23];
    if (!width || !height || width > 2048 || height > 2048) return NO;
  }
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *actual = [NSMutableString string];
  for (NSUInteger i = 0; i < sizeof(digest); i++) [actual appendFormat:@"%02x", digest[i]];
  return [actual isEqualToString:hash];
}
RCT_EXPORT_METHOD(getAnimation:(NSString *)urlString sha256:(NSString *)hash bytes:(double)bytes
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self cacheResource:urlString hash:hash bytes:bytes extension:@"riv" resolver:resolve rejecter:reject];
}
RCT_EXPORT_METHOD(getPortrait:(NSString *)urlString sha256:(NSString *)hash bytes:(double)bytes
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self cacheResource:urlString hash:hash bytes:bytes extension:@"png" resolver:resolve rejecter:reject];
}
- (void)cacheResource:(NSString *)urlString hash:(NSString *)hash bytes:(double)bytes extension:(NSString *)extension
             resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject {
  NSURL *url = [NSURL URLWithString:urlString];
  NSRegularExpression *pattern = [NSRegularExpression regularExpressionWithPattern:@"^[a-f0-9]{64}$" options:0 error:nil];
  if (![url.scheme isEqualToString:@"https"] || !url.host.length || url.user || url.password
      || [pattern numberOfMatchesInString:hash options:0 range:NSMakeRange(0, hash.length)] != 1
      || !isfinite(bytes) || bytes < 8 || bytes > ([extension isEqualToString:@"png"] ? 4194304 : 8388608) || floor(bytes) != bytes) {
    reject(@"FIGURE_DOWNLOAD", @"Invalid fighter download.", nil); return;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSFileManager *fm = NSFileManager.defaultManager;
    NSURL *root = [[fm URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"figure-cache-v1" isDirectory:YES];
    [fm createDirectoryAtURL:root withIntermediateDirectories:YES attributes:nil error:nil];
    [root setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
    NSURL *target = [root URLByAppendingPathComponent:[hash stringByAppendingPathExtension:extension]];
    void (^finish)(void) = ^{
      [fm setAttributes:@{NSFileModificationDate:NSDate.date} ofItemAtPath:target.path error:nil];
      NSArray<NSURL *> *files = [fm contentsOfDirectoryAtURL:root includingPropertiesForKeys:@[NSURLFileSizeKey, NSURLContentModificationDateKey] options:0 error:nil];
      files = [files sortedArrayUsingComparator:^NSComparisonResult(NSURL *a, NSURL *b) {
        NSDate *da, *db; [a getResourceValue:&da forKey:NSURLContentModificationDateKey error:nil]; [b getResourceValue:&db forKey:NSURLContentModificationDateKey error:nil]; return [da compare:db];
      }];
      unsigned long long total = 0;
      for (NSURL *f in files) total += [[fm attributesOfItemAtPath:f.path error:nil][NSFileSize] unsignedLongLongValue];
      for (NSURL *f in files) {
        if (total <= 96 * 1024 * 1024) break;
        if ([f isEqual:target]) continue;
        unsigned long long size = [[fm attributesOfItemAtPath:f.path error:nil][NSFileSize] unsignedLongLongValue];
        if ([fm removeItemAtURL:f error:nil]) total -= size;
      }
      resolve(target.absoluteString);
    };
    if ([self validFile:target hash:hash size:(NSUInteger)bytes extension:extension]) { finish(); return; }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url]; request.timeoutInterval = 30;
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.timeoutIntervalForResource = 45;
    RipsyFigureDownload *download = [RipsyFigureDownload new]; download.expected = (NSUInteger)bytes;
    download.completion = ^(NSURL *location, NSHTTPURLResponse *http, NSError *error) {
      BOOL good = !error && http.statusCode == 200 && [http.URL.scheme isEqualToString:@"https"]
        && location && [self validFile:location hash:hash size:(NSUInteger)bytes extension:extension];
      if (good) {
        [fm removeItemAtURL:target error:nil];
        good = [fm moveItemAtURL:location toURL:target error:nil];
      }
      if (good) finish(); else reject(@"FIGURE_DOWNLOAD", @"Could not download this fighter. Check your connection and try again.", nil);
    };
    download.session = [NSURLSession sessionWithConfiguration:config delegate:download delegateQueue:nil];
    [[download.session downloadTaskWithRequest:request] resume];
  });
}
@end
