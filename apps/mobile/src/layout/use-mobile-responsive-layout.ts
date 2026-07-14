import { useMemo } from "react";
import { Platform, StatusBar, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  createMobileResponsiveLayout,
  type MobileLayoutPlatform,
} from "./responsive-metrics";

export function useMobileResponsiveLayout() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(
    () =>
      createMobileResponsiveLayout({
        bottomInset: insets.bottom,
        height,
        platform: Platform.OS as MobileLayoutPlatform,
        statusBarHeight:
          Platform.OS === "android" ? StatusBar.currentHeight : 0,
        topInset: insets.top,
        width,
      }),
    [height, insets.bottom, insets.top, width],
  );
}
