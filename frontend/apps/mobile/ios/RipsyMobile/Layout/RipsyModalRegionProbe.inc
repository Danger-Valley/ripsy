#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTViewManager.h>
#import "RipsyModalRegionGeometry.h"

@interface RipsyModalRegionProbe : UIView
@property (nonatomic, copy) RCTDirectEventBlock onRegionChange;
- (void)sampleRegion;
@end

// CADisplayLink retains its target. The proxy must not retain the React view.
@interface RipsyModalRegionTick : NSObject
@property (nonatomic, weak) RipsyModalRegionProbe *probe;
- (void)tick:(CADisplayLink *)link;
@end

@implementation RipsyModalRegionTick
- (void)tick:(CADisplayLink *)link { [self.probe sampleRegion]; }
@end

@implementation RipsyModalRegionProbe {
  CADisplayLink *_regionDisplayLink;
  CGRect _lastSentRegion;
  BOOL _hasSentRegion;
}

- (instancetype)init
{
  if ((self = [super initWithFrame:CGRectZero])) {
    self.userInteractionEnabled = NO;
    self.accessibilityElementsHidden = YES;
  }
  return self;
}

- (void)setOnRegionChange:(RCTDirectEventBlock)onRegionChange
{
  _onRegionChange = [onRegionChange copy];
  _hasSentRegion = NO;
  [self setNeedsLayout];
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  _hasSentRegion = NO;
  [_regionDisplayLink invalidate];
  _regionDisplayLink = nil;
  if (self.window != nil) {
    RipsyModalRegionTick *target = [RipsyModalRegionTick new];
    target.probe = self;
    _regionDisplayLink = [CADisplayLink displayLinkWithTarget:target selector:@selector(tick:)];
    _regionDisplayLink.preferredFrameRateRange = CAFrameRateRangeMake(10, 30, 30);
    [_regionDisplayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    [self setNeedsLayout];
  }
}

- (void)safeAreaInsetsDidChange
{
  [super safeAreaInsetsDidChange];
  [self setNeedsLayout];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  [self sampleRegion];
}

- (void)sampleRegion
{
  if (self.window == nil || self.onRegionChange == nil || CGRectIsEmpty(self.bounds)) return;
  // Read fresh local geometry even when hinge changes don't resize the modal.
  CGRect region = self.bounds;
  if (@available(iOS 27.1, *)) {
    BOOL trailingIsLeft = self.effectiveUserInterfaceLayoutDirection == UIUserInterfaceLayoutDirectionRightToLeft;
    for (UIViewReservedRegion *division in [self reservedRegionsOfKind:UIViewReservedRegionKind.divisionRegionKind]) {
      if (division.isActive) region = RipsyModalRegionAfterDivision(region, division.frame, trailingIsLeft);
    }
  }
  if (_hasSentRegion && CGRectEqualToRect(region, _lastSentRegion)) return;
  _lastSentRegion = region;
  _hasSentRegion = YES;
  self.onRegionChange(@{ @"x": @(region.origin.x), @"y": @(region.origin.y),
                        @"width": @(region.size.width), @"height": @(region.size.height) });
}

- (void)dealloc { [_regionDisplayLink invalidate]; }
@end

@interface RipsyModalRegionProbeManager : RCTViewManager
@end

@implementation RipsyModalRegionProbeManager
RCT_EXPORT_MODULE(RipsyModalRegionProbe)
RCT_EXPORT_VIEW_PROPERTY(onRegionChange, RCTDirectEventBlock)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [RipsyModalRegionProbe new]; }
@end
