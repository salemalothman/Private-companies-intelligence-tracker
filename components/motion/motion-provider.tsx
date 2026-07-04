"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * Single motion runtime for the whole app, mounted once in the (app) layout
 * (layouts persist across navigations, so the feature bundle loads exactly once).
 *
 * - `LazyMotion strict`: only the ~18kb domAnimation feature set ships; any
 *   accidental `motion.*` import (which would pull the full bundle) becomes a
 *   runtime error in development instead of a silent bundle regression —
 *   always use `m.*` components inside this tree.
 * - `MotionConfig reducedMotion="user"`: the global CSS collapse block in
 *   globals.css only covers CSS animations/transitions; motion animates via
 *   WAAPI/inline styles, so it needs its own reduced-motion wiring. With this,
 *   transform/layout animations are skipped for motion-sensitive users while
 *   opacity fades remain (motion's documented accessible default).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
