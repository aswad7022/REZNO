"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { reznoBrandFoundation } from "@/design-system/brand-foundation";

export function PublicProfileImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute inset-0"
      initial={false}
      animate={{ opacity: loaded || reducedMotion ? 1 : 0 }}
      transition={{
        duration: reducedMotion
          ? 0
          : reznoBrandFoundation.motion.duration.normal / 1_000,
        ease: reznoBrandFoundation.motion.easing.enter,
      }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", className)}
        onLoad={() => setLoaded(true)}
      />
    </motion.div>
  );
}
