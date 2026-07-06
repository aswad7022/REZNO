import type { ViewStyle } from "react-native";

import type { MobileTheme } from "../theme/tokens";

type MobileSurfaceTone = "card" | "elevated" | "hero";

export const mobileRadii = {
  compactCard: 18,
  listCard: 22,
  roundIcon: 999,
} as const;

export function createMobileSurface(
  theme: MobileTheme,
  {
    radius = theme.radii.card,
    tone = "card",
  }: {
    radius?: number;
    tone?: MobileSurfaceTone;
  } = {},
): ViewStyle {
  const backgroundByTone = {
    card: theme.colors.card,
    elevated: theme.colors.cardElevated,
    hero: theme.colors.hero,
  };
  const borderByTone = {
    card: theme.colors.border,
    elevated: theme.colors.border,
    hero: theme.colors.goldSoft,
  };

  return {
    backgroundColor: backgroundByTone[tone],
    borderColor: borderByTone[tone],
    borderRadius: radius,
    borderWidth: 1,
  };
}

export function createMobileShadow(
  theme: MobileTheme,
  {
    darkOpacity,
    height,
    lightOpacity,
    radius,
  }: {
    darkOpacity: number;
    height: number;
    lightOpacity: number;
    radius: number;
  },
): ViewStyle {
  return {
    elevation: Math.max(1, Math.round(radius / 7)),
    shadowColor: theme.colors.shadow,
    shadowOffset: { height, width: 0 },
    shadowOpacity: theme.isDark ? darkOpacity : lightOpacity,
    shadowRadius: radius,
  };
}
