export const premiumMotion = {
  duration: {
    fast: 140,
    instant: 90,
    modalEnter: 320,
    normal: 220,
    pageEnter: 220,
    slow: 320,
  },
  easing: {
    enter: [0.16, 1, 0.3, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
    standard: [0.2, 0, 0, 1] as const,
  },
  pressScale: {
    card: 0.985,
    chip: 0.96,
    compact: 0.94,
    cta: 0.975,
    standard: 0.97,
  },
  spring: {
    damping: 18,
    mass: 0.8,
    stiffness: 220,
  },
} as const;

export type MobileMotionPreference = "full" | "reduced";

export function resolveMotionDuration(
  duration: number,
  preference: MobileMotionPreference,
) {
  return preference === "reduced" ? 0 : duration;
}

export function resolvePressScale(
  scale: number,
  preference: MobileMotionPreference,
) {
  return preference === "reduced" ? 1 : scale;
}

export function resolvePremiumMotion(preference: MobileMotionPreference) {
  return {
    duration: Object.fromEntries(
      Object.entries(premiumMotion.duration).map(([key, value]) => [
        key,
        resolveMotionDuration(value, preference),
      ]),
    ) as Record<keyof typeof premiumMotion.duration, number>,
    pressScale: Object.fromEntries(
      Object.entries(premiumMotion.pressScale).map(([key, value]) => [
        key,
        resolvePressScale(value, preference),
      ]),
    ) as Record<keyof typeof premiumMotion.pressScale, number>,
    easing: premiumMotion.easing,
    spring:
      preference === "reduced"
        ? {
            damping: premiumMotion.spring.damping,
            mass: premiumMotion.spring.mass,
            stiffness: 1_000,
          }
        : premiumMotion.spring,
  };
}
