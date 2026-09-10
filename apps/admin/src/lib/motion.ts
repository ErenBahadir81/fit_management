import type { Transition, Variants } from "motion/react";

/**
 * Motion vocabulary. Fast and purposeful: 120–200 ms ease-out for UI reveals,
 * springs only for things that feel physical (drawers, dialogs, reordering).
 * `prefers-reduced-motion` is honoured by `motion`'s own `MotionConfig reducedMotion="user"`
 * (set in providers) plus the CSS override in globals.css.
 */

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const fast: Transition = { duration: 0.14, ease: EASE_OUT };
export const normal: Transition = { duration: 0.18, ease: EASE_OUT };
export const slow: Transition = { duration: 0.22, ease: EASE_OUT };

/** Physical surfaces: drawers, dialogs, reorder items. */
export const spring: Transition = { type: "spring", stiffness: 300, damping: 30, mass: 0.9 };
export const springSnappy: Transition = { type: "spring", stiffness: 460, damping: 34, mass: 0.7 };

/** Page enter: fade + 8 px rise, 160 ms. */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } },
};

/** Staggered children for lists/tiles that appear together. */
export const listEnter: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
};

export const itemEnter: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } },
};

export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.12, ease: "linear" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "linear" } },
};

export const dialogPop: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: fast },
};

export const drawerSlide: Variants = {
  hidden: { x: "100%" },
  show: { x: 0, transition: spring },
  exit: { x: "100%", transition: { duration: 0.16, ease: EASE_OUT } },
};

export const toastSlide: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSnappy },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: fast },
};
