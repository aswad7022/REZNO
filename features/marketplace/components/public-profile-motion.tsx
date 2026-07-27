"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { reznoBrandFoundation } from "@/design-system/brand-foundation";

const motionDuration =
  reznoBrandFoundation.motion.duration.normal / 1_000;

export function PublicProfilePageMotion({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reducedMotion ? 0 : motionDuration,
        ease: reznoBrandFoundation.motion.easing.enter,
      }}
    >
      {children}
    </motion.div>
  );
}

export function PublicProfileSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      initial={
        reducedMotion
          ? false
          : { opacity: 0, y: reznoBrandFoundation.motion.offset.page }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: reducedMotion ? 0 : motionDuration,
        ease: reznoBrandFoundation.motion.easing.enter,
      }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export function PublicProfileCardMotion({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -4 }}
      transition={{
        duration: reducedMotion ? 0 : motionDuration,
        ease: reznoBrandFoundation.motion.easing.standard,
      }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
