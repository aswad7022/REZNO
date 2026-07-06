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

  return {
    backgroundColor: backgroundByTone[tone],
    borderColor: theme.colors.border,
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
    shadowColor: theme.colors.shadow,
    shadowOffset: { height, width: 0 },
    shadowOpacity: theme.isDark ? darkOpacity : lightOpacity,
    shadowRadius: radius,
  };
}
