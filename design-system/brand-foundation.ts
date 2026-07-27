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
    easing: {
      enter: [0.16, 1, 0.3, 1],
      exit: [0.4, 0, 1, 1],
      standard: [0.2, 0, 0, 1],
    },
    offset: {
      page: 8,
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
      accent: "#8a5a10",
      background: "#f8efe0",
      danger: "#b91c1c",
      focus: "#8f5f13",
      foreground: "#17140f",
      info: "#1d4ed8",
      primary: "#8a5a10",
      success: "#047857",
      warning: "#a35d00",
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
