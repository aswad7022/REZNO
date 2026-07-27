import {
  gate8cCaptureSpecs,
  type Gate8cCaptureSpec,
} from "./gate8c-capture-contract";

export type Gate8dBrowser = "chromium" | "firefox" | "webkit";
export type Gate8dViewport =
  | "mobile-compact"
  | "mobile-large"
  | "tablet-portrait"
  | "tablet-landscape"
  | "desktop"
  | "wide-desktop"
  | "zoom-200";

export interface Gate8dCaptureSpec extends Gate8cCaptureSpec {
  browser: Gate8dBrowser;
  viewport: Gate8dViewport;
  zoom: 1 | 2;
  scrollOffsetY?: number;
}

const inherited = new Map(gate8cCaptureSpecs.map((spec) => [spec.file, spec]));

function capture(
  browser: Gate8dBrowser,
  viewport: Gate8dViewport,
  inheritedFile: string,
  width: number,
  height: number,
  zoom: 1 | 2 = 1,
): Gate8dCaptureSpec {
  const source = inherited.get(inheritedFile);
  if (!source) throw new Error(`Missing Gate 8C capture contract ${inheritedFile}`);
  const { scrollTo, ...sourceWithoutScroll } = source;
  const stickyHeaderSafe =
    inheritedFile ===
    "business-notification-preferences-table-desktop-en-light.png";
  return {
    ...sourceWithoutScroll,
    ...(scrollTo ? { scrollTo } : {}),
    ...(stickyHeaderSafe ? { scrollOffsetY: -96 } : {}),
    browser,
    viewport,
    width,
    height,
    zoom,
    file: `${browser}-${viewport}-${source.file}`,
    reviewPrompt: `${source.reviewPrompt} Confirm ${browser} at ${viewport}${
      zoom === 2 ? " with 200% reflow equivalence" : ""
    }.`,
  };
}

const browserMatrix = (browser: Gate8dBrowser): Gate8dCaptureSpec[] => [
  capture(
    browser,
    "mobile-compact",
    "admin-overview-compact-ar-dark.png",
    360,
    640,
  ),
  capture(
    browser,
    "mobile-large",
    "admin-navigation-dialog-compact-en-dark.png",
    430,
    932,
  ),
  capture(
    browser,
    "tablet-portrait",
    "business-dashboard-desktop-ckb-light.png",
    768,
    1024,
  ),
  capture(
    browser,
    "tablet-landscape",
    "admin-communications-empty-desktop-ar-light.png",
    1024,
    768,
  ),
  capture(
    browser,
    "desktop",
    "admin-platform-operations-desktop-ar-light.png",
    1440,
    900,
  ),
  capture(
    browser,
    "wide-desktop",
    "admin-overview-desktop-en-light.png",
    1920,
    1080,
  ),
  capture(
    browser,
    "zoom-200",
    "admin-access-form-desktop-ar-light.png",
    720,
    500,
    2,
  ),
  capture(
    browser,
    "desktop",
    "business-notification-preferences-table-desktop-en-light.png",
    1280,
    900,
  ),
];

export const gate8dCaptureSpecs = (
  ["chromium", "firefox", "webkit"] as const
).flatMap(browserMatrix);

export function assertGate8dCaptureContract() {
  if (gate8dCaptureSpecs.length !== 24) {
    throw new Error("Gate 8D must contain exactly 24 cross-browser captures.");
  }
  const files = new Set<string>();
  const browserCounts = new Map<Gate8dBrowser, number>();
  const viewports = new Set<Gate8dViewport>();
  for (const spec of gate8dCaptureSpecs) {
    if (files.has(spec.file)) throw new Error(`Duplicate capture ${spec.file}`);
    files.add(spec.file);
    browserCounts.set(spec.browser, (browserCounts.get(spec.browser) ?? 0) + 1);
    viewports.add(spec.viewport);
    if (spec.viewport === "zoom-200" && spec.zoom !== 2) {
      throw new Error(`${spec.file} does not enforce the 200% reflow contract.`);
    }
    if (spec.requiredVisibleText.length < 2 || !spec.stateContract.marker.selector) {
      throw new Error(`${spec.file} lacks semantic page evidence.`);
    }
  }
  for (const browser of ["chromium", "firefox", "webkit"] as const) {
    if (browserCounts.get(browser) !== 8) {
      throw new Error(`${browser} must own eight Gate 8D captures.`);
    }
  }
  for (const viewport of [
    "mobile-compact",
    "mobile-large",
    "tablet-portrait",
    "tablet-landscape",
    "desktop",
    "wide-desktop",
    "zoom-200",
  ] as const) {
    if (!viewports.has(viewport)) throw new Error(`Missing ${viewport}.`);
  }
}
