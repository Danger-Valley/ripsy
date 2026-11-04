#include "../../ios/RipsyMobile/Layout/RipsyModalRegionGeometry.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>

static void check(CGRect actual, CGRect expected) {
  assert(fabs(actual.origin.x - expected.origin.x) < 0.001);
  assert(fabs(actual.origin.y - expected.origin.y) < 0.001);
  assert(fabs(actual.size.width - expected.size.width) < 0.001);
  assert(fabs(actual.size.height - expected.size.height) < 0.001);
}

int main(void) {
  CGRect b = CGRectMake(0, 0, 951, 669);
  check(RipsyModalRegionAfterDivision(b, CGRectMake(455, 0, 40, 669), false), CGRectMake(495, 0, 456, 669));
  check(RipsyModalRegionAfterDivision(b, CGRectMake(455, 0, 40, 669), true), CGRectMake(0, 0, 455, 669));
  check(RipsyModalRegionAfterDivision(b, CGRectMake(0, 310, 951, 40), false), CGRectMake(0, 350, 951, 319));
  check(RipsyModalRegionAfterDivision(b, CGRectMake(-50, 0, 40, 669), false), b);
  check(RipsyModalRegionAfterDivision(b, CGRectMake(980, 0, 40, 669), false), b);
  check(RipsyModalRegionAfterDivision(b, CGRectMake(951, 0, 40, 669), false), b);
  check(RipsyModalRegionAfterDivision(CGRectMake(0, 0, 951, 300), CGRectMake(455, 0, 40, 669), false), CGRectMake(495, 0, 456, 300));
  check(RipsyModalRegionAfterDivision(CGRectMake(100, 50, 600, 500), CGRectMake(390, 0, 40, 669), false), CGRectMake(430, 50, 270, 500));
  // Actual horizontal-fold + keyboard regression: the preferred bottom region
  // is gone, but the same form can still occupy the clear region above the fold.
  check(RipsyModalRegionAfterDivision(CGRectMake(0, 0, 669, 455.6667), CGRectMake(0, 455, 669, 40), false), CGRectMake(0, 0, 669, 455));
  check(RipsyModalRegionAfterDivision(CGRectMake(0, 0, 669, 475), CGRectMake(0, 455, 669, 40), false), CGRectMake(0, 0, 669, 455));
  check(RipsyModalRegionAfterDivision(CGRectMake(0, 0, 475, 669), CGRectMake(455, 0, 40, 669), false), CGRectMake(0, 0, 455, 669));
  check(RipsyModalRegionAfterDivision(CGRectMake(475, 0, 476, 669), CGRectMake(455, 0, 40, 669), true), CGRectMake(495, 0, 456, 669));
  // If no continuous area exists, do not expose controls inside the division.
  check(RipsyModalRegionAfterDivision(CGRectMake(0, 455, 669, 40), CGRectMake(0, 455, 669, 40), false), CGRectMake(0, 495, 669, 0));
  puts("13 modal-region geometry assertions PASS");
}
