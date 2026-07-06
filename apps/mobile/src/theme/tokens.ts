export type MobileTheme = {
  colors: {
    accent: string;
    accentMuted: string;
    background: string;
    border: string;
    card: string;
    cardElevated: string;
    cream: string;
    danger: string;
    dangerSoft: string;
    deepGold: string;
    disabled: string;
    disabledText: string;
    foreground: string;
    foregroundInverse: string;
    gold: string;
    goldSoft: string;
    hero: string;
    heroMuted: string;
    muted: string;
    mutedForeground: string;
    nav: string;
    overlay: string;
    shadow: string;
    success: string;
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
    card: 30,
    control: 20,
    pill: 999,
    xl: 36,
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
    accent: "#f5a623",
    accentMuted: "#35250c",
    background: "#05070a",
    border: "#2b261a",
    card: "#111820",
    cardElevated: "#151c24",
    cream: "#fff8ec",
    danger: "#fb7185",
    dangerSoft: "#35161c",
    deepGold: "#d89b16",
    disabled: "#242832",
    disabledText: "#7f8794",
    foreground: "#f9f3e7",
    foregroundInverse: "#1b1305",
    gold: "#f6c343",
    goldSoft: "#33250b",
    hero: "#0b1116",
    heroMuted: "#19212a",
    muted: "#1a2028",
    mutedForeground: "#b7ad9c",
    nav: "#080b10",
    overlay: "rgba(0, 0, 0, 0.36)",
    shadow: "#000000",
    success: "#34d399",
    successSoft: "#102a22",
    warning: "#f5a623",
    warningSoft: "#2f2109",
  },
  isDark: true,
};

export const lightMobileTheme: MobileTheme = {
  ...shared,
  colors: {
    accent: "#f5a623",
    accentMuted: "#fff2cf",
    background: "#f8f1e6",
    border: "#e4d2ad",
    card: "#fff8ec",
    cardElevated: "#fffdf7",
    cream: "#fff8ec",
    danger: "#dc2626",
    dangerSoft: "#fde8e8",
    deepGold: "#b8750b",
    disabled: "#e7dccb",
    disabledText: "#91826c",
    foreground: "#1f1a12",
    foregroundInverse: "#1b1305",
    gold: "#f6c343",
    goldSoft: "#fff1c6",
    hero: "#fff0cc",
    heroMuted: "#fff8ec",
    muted: "#f1e6d4",
    mutedForeground: "#75664f",
    nav: "#fff8ec",
    overlay: "rgba(80, 55, 9, 0.1)",
    shadow: "#5a3c09",
    success: "#059669",
    successSoft: "#e3f6ec",
    warning: "#b8750b",
    warningSoft: "#fff3d6",
  },
  isDark: false,
};
