#pragma once

#include <CoreGraphics/CoreGraphics.h>
#include <stdbool.h>

// The supplied division already includes UIKit's interactive-content margins.
// Prefer the root arrangement's bottom/trailing region. Keyboard avoidance can
// remove it entirely; use the other continuous region instead of hiding the form.
static inline CGRect RipsyModalRegionAfterDivision(CGRect bounds, CGRect division, bool trailingIsLeft)
{
  CGRect cut = CGRectIntersection(bounds, division);
  if (CGRectIsNull(cut) || CGRectIsEmpty(cut)) return bounds;

  CGRect preferred;
  CGRect alternative;
  if (division.size.height > division.size.width) {
    CGRect left = CGRectMake(CGRectGetMinX(bounds), CGRectGetMinY(bounds),
                             CGRectGetMinX(cut) - CGRectGetMinX(bounds), bounds.size.height);
    CGRect right = CGRectMake(CGRectGetMaxX(cut), CGRectGetMinY(bounds),
                              CGRectGetMaxX(bounds) - CGRectGetMaxX(cut), bounds.size.height);
    preferred = trailingIsLeft ? left : right;
    alternative = trailingIsLeft ? right : left;
  } else {
    preferred = CGRectMake(CGRectGetMinX(bounds), CGRectGetMaxY(cut), bounds.size.width,
                           CGRectGetMaxY(bounds) - CGRectGetMaxY(cut));
    alternative = CGRectMake(CGRectGetMinX(bounds), CGRectGetMinY(bounds), bounds.size.width,
                             CGRectGetMinY(cut) - CGRectGetMinY(bounds));
  }
  return CGRectIsEmpty(preferred) && !CGRectIsEmpty(alternative) ? alternative : preferred;
}
