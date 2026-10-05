// Compiled once through the existing native bridge translation unit. This
// legacy Xcode project does not synchronize folders. Do not add this .inc to
// Compile Sources; audio is independent of the wallet module and SDK.
@import AVFoundation;
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTInvalidating.h>

@interface RipsyAudio : NSObject <RCTBridgeModule, RCTInvalidating>
@property(nonatomic, strong) NSMutableDictionary<NSString *, AVAudioPlayer *> *players;
@property(nonatomic, strong) NSMutableArray<NSString *> *playingOrder;
@property(nonatomic, assign) BOOL active;
@property(nonatomic, assign) BOOL interrupted;
@end

@implementation RipsyAudio
RCT_EXPORT_MODULE(RipsyAudio)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (instancetype)init {
  if ((self = [super init])) {
    _players = [NSMutableDictionary new];
    _playingOrder = [NSMutableArray new];
    _active = UIApplication.sharedApplication.applicationState == UIApplicationStateActive;
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(suspend:) name:UIApplicationWillResignActiveNotification object:nil];
    [center addObserver:self selector:@selector(resume:) name:UIApplicationDidBecomeActiveNotification object:nil];
    [center addObserver:self selector:@selector(interruption:) name:AVAudioSessionInterruptionNotification object:nil];
  }
  return self;
}
- (void)stopPlayers {
  for (AVAudioPlayer *player in _players.allValues) { [player stop]; player.currentTime = 0; }
  [_playingOrder removeAllObjects];
}
- (void)suspend:(NSNotification *)notification {
  _active = NO;
  [self stopPlayers];
  [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
}
- (void)resume:(NSNotification *)notification { _active = YES; }
- (void)interruption:(NSNotification *)notification {
  // Audio-session notifications may arrive off the main queue.
  dispatch_async(dispatch_get_main_queue(), ^{
    self.interrupted = [notification.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan;
    if (self.interrupted) [self stopPlayers];
    // Never resume a previous effect after a call/interruption.
  });
}
// Keep the exported dictionary untyped. RN's legacy-module interop parses
// NSDictionary<NSString *, NSString *> as NSStringDictionary, for which it
// has no converter. Validate the untrusted bridge values below instead.
RCT_EXPORT_METHOD(prepare:(NSDictionary *)pack
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  [self stopPlayers]; [_players removeAllObjects];
  if (![pack isKindOfClass:NSDictionary.class] || pack.count != 13) { reject(@"AUDIO_LOAD", @"Sound pack unavailable", nil); return; }
  NSError *error = nil;
  // Ambient respects the hardware silent switch and does not interrupt music.
  if (![AVAudioSession.sharedInstance setCategory:AVAudioSessionCategoryAmbient
                                    withOptions:0 error:&error]) {
    reject(@"AUDIO_SESSION", @"Sound unavailable", nil); return;
  }
  for (NSString *name in pack) {
    id encoded = pack[name];
    if (![name isKindOfClass:NSString.class] || ![encoded isKindOfClass:NSString.class]) {
      [_players removeAllObjects]; reject(@"AUDIO_LOAD", @"Sound pack unavailable", nil); return;
    }
    NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded options:0];
    if (!data || data.length > 100000) { [_players removeAllObjects]; reject(@"AUDIO_LOAD", @"Sound pack unavailable", nil); return; }
    AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithData:data fileTypeHint:AVFileTypeWAVE error:&error];
    if (!player || ![player prepareToPlay]) { [_players removeAllObjects]; reject(@"AUDIO_LOAD", @"Sound pack unavailable", nil); return; }
    player.numberOfLoops = 0; _players[name] = player;
  }
  resolve(@YES);
}
RCT_EXPORT_METHOD(play:(NSString *)name volume:(double)volume) {
  if (!_active || _interrupted || !isfinite(volume)) return;
  AVAudioPlayer *player = _players[name];
  if (!player) return;
  NSError *error = nil;
  if (![AVAudioSession.sharedInstance setActive:YES error:&error]) return;
  [_playingOrder removeObject:name];
  NSIndexSet *finished = [_playingOrder indexesOfObjectsPassingTest:^BOOL(NSString *key, NSUInteger idx, BOOL *stop) { return !self.players[key].playing; }];
  [_playingOrder removeObjectsAtIndexes:finished];
  while (_playingOrder.count >= 4) {
    NSString *oldest = _playingOrder.firstObject; [_players[oldest] stop]; [_playingOrder removeObjectAtIndex:0];
  }
  [player stop]; player.currentTime = 0; player.volume = MAX(0, MIN(1, volume));
  if ([player play]) [_playingOrder addObject:name];
}
RCT_EXPORT_METHOD(stopAll) { [self stopPlayers]; }
RCT_EXPORT_METHOD(releaseSounds) { [self stopPlayers]; [_players removeAllObjects]; }
- (void)invalidate {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  dispatch_async(dispatch_get_main_queue(), ^{ [self stopPlayers]; [self.players removeAllObjects]; });
}
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }
@end
