export const reznoBrandFoundation = {
  direction: {
    ar: "rtl",
    ckb: "rtl",
    en: "ltr",
  },
  iconography: {
    minimumTouchTarget: 44,
    stroke: 1.75,
    supportedDirections: ["ltr", "rtl"],
  },
  motion: {
    duration: {
      fast: 140,
      instant: 90,
      normal: 220,
      slow: 320,
    },
    reduced: {
      duration: 0,
      pressScale: 1,
    },
  },
  palette: {
    dark: {
      accent: "#ffcf55",
      background: "#02060a",
      danger: "#fb7185",
      focus: "#ffe097",
      foreground: "#ffffff",
      info: "#60a5fa",
      primary: "#ffc13a",
      success: "#34d399",
      warning: "#ffcf55",
    },
    light: {
      accent: "#c98616",
      background: "#f8efe0",
      danger: "#dc2626",
      focus: "#8f5f13",
      foreground: "#17140f",
      info: "#2563eb",
      primary: "#c98a12",
      success: "#059669",
      warning: "#b8750b",
    },
  },
  radii: {
    card: 32,
    control: 22,
    pill: 999,
  },
  responsive: {
    compactMax: 639,
    contentMaxRem: 80,
    wideMin: 1024,
  },
  spacing: {
    lg: 20,
    md: 16,
    sm: 10,
    xl: 26,
    xs: 6,
    xxl: 32,
  },
} as const;

export type ReznoLocale = keyof typeof reznoBrandFoundation.direction;
