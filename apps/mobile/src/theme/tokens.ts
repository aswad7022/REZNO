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
    card: 32,
    control: 22,
    pill: 999,
    xl: 40,
  },
  spacing: {
    lg: 20,
    md: 16,
    sm: 10,
    xl: 26,
    xs: 6,
  },
};

export const darkMobileTheme: MobileTheme = {
  ...shared,
  colors: {
    accent: "#ffcf55",
    accentMuted: "#3a2a0d",
    background: "#02060a",
    border: "#25303c",
    card: "#101720",
    cardElevated: "#151e28",
    cream: "#fff8ec",
    danger: "#fb7185",
    dangerSoft: "#35161c",
    deepGold: "#c98a12",
    disabled: "#202832",
    disabledText: "#7f8a97",
    foreground: "#ffffff",
    foregroundInverse: "#160d02",
    gold: "#ffc13a",
    goldSoft: "#2b210f",
    hero: "#03070c",
    heroMuted: "#101821",
    muted: "#121a23",
    mutedForeground: "#b2bbc7",
    nav: "rgba(2, 6, 10, 0.98)",
    overlay: "rgba(0, 0, 0, 0.44)",
    shadow: "#000000",
    success: "#34d399",
    successSoft: "#0d2b24",
    warning: "#ffcf55",
    warningSoft: "#2f230d",
  },
  isDark: true,
};

export const lightMobileTheme: MobileTheme = {
  ...shared,
  colors: {
    accent: "#f5a623",
    accentMuted: "#fff2cf",
    background: "#f7efe2",
    border: "#e2cfa6",
    card: "#fff8ed",
    cardElevated: "#fffdf8",
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
    hero: "#fff0cb",
    heroMuted: "#fff8ee",
    muted: "#f0e4d0",
    mutedForeground: "#75664f",
    nav: "rgba(255, 248, 236, 0.96)",
    overlay: "rgba(80, 55, 9, 0.1)",
    shadow: "#5a3c09",
    success: "#059669",
    successSoft: "#e3f6ec",
    warning: "#b8750b",
    warningSoft: "#fff3d6",
  },
  isDark: false,
};
