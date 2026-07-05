export type MobileTheme = {
  colors: {
    accent: string;
    accentMuted: string;
    background: string;
    border: string;
    card: string;
    cardElevated: string;
    disabled: string;
    disabledText: string;
    foreground: string;
    foregroundInverse: string;
    gold: string;
    goldSoft: string;
    muted: string;
    mutedForeground: string;
    nav: string;
    shadow: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
  };
  isDark: boolean;
  radii: {
    card: number;
    control: number;
    pill: number;
    xl: number;
  };
  spacing: {
    lg: number;
    md: number;
    sm: number;
    xl: number;
    xs: number;
  };
};

const shared = {
  radii: {
    card: 28,
    control: 18,
    pill: 999,
    xl: 34,
  },
  spacing: {
    lg: 18,
    md: 14,
    sm: 10,
    xl: 24,
    xs: 6,
  },
};

export const darkMobileTheme: MobileTheme = {
  ...shared,
  colors: {
    accent: "#f5c76b",
    accentMuted: "#3a2f19",
    background: "#090b10",
    border: "#242936",
    card: "#11151f",
    cardElevated: "#171c28",
    disabled: "#252b38",
    disabledText: "#7d8798",
    foreground: "#f8fafc",
    foregroundInverse: "#111827",
    gold: "#f5c76b",
    goldSoft: "#2a2112",
    muted: "#1f2532",
    mutedForeground: "#a7b0c0",
    nav: "#10141d",
    shadow: "#000000",
    successSoft: "#10251f",
    warning: "#f59e0b",
    warningSoft: "#281a07",
  },
  isDark: true,
};

export const lightMobileTheme: MobileTheme = {
  ...shared,
  colors: {
    accent: "#b98219",
    accentMuted: "#fff3d8",
    background: "#f8f5ee",
    border: "#eadfc8",
    card: "#fffdf8",
    cardElevated: "#ffffff",
    disabled: "#e6e0d4",
    disabledText: "#8b8171",
    foreground: "#15130f",
    foregroundInverse: "#ffffff",
    gold: "#c9922f",
    goldSoft: "#fff4d8",
    muted: "#f1eadf",
    mutedForeground: "#6f6658",
    nav: "#ffffff",
    shadow: "#34250b",
    successSoft: "#e9f8ef",
    warning: "#9a5f00",
    warningSoft: "#fff6df",
  },
  isDark: false,
};
