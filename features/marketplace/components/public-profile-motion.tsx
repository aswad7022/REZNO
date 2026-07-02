"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export function PublicProfilePageMotion({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
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
      initial={reducedMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
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
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
