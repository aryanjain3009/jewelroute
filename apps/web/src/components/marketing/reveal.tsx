"use client";
/** One light entrance for product frames as they first scroll into view: opacity + 12 px rise,
 *  280 ms on a strong ease-out, once. Transform string (not `y`) so it stays compositor-friendly.
 *  Reduced motion: no movement and no fade (duration 0). */
import { MotionConfig, motion, useReducedMotion } from "motion/react";

export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, transform: "translateY(12px)" }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.23, 1, 0.32, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/** Page-level motion policy: honour the OS "reduce motion" setting for every motion component. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
