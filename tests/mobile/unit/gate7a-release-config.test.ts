import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RELEASE_CONFIG_CONTRACT,
  validateReleaseConfiguration,
} from "../../../apps/mobile/scripts/validate-release-config.mjs";

type BuildProfile = {
  developmentClient?: boolean;
  distribution?: string;
  environment?: string;
  env?: Record<string, string>;
};

type EasConfig = {
  build: Record<string, BuildProfile>;
};

type ExpoConfig = {
  expo: {
    android: { package: string };
    extra: { eas: { projectId: string } };
    ios: {
      bundleIdentifier: string;
      infoPlist: { ITSAppUsesNonExemptEncryption: boolean };
    };
    name: string;
    owner: string;
    plugins: unknown[];
    scheme: string;
    slug: string;
  };
};

type MobilePackage = {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

type NextBuildTsConfig = {
  exclude: string[];
  include: string[];
};

async function repositoryConfiguration() {
  const [appConfig, easConfig, mobilePackage] = await Promise.all([
    readJson<ExpoConfig>("apps/mobile/app.json"),
    readJson<EasConfig>("apps/mobile/eas.json"),
    readJson<MobilePackage>("apps/mobile/package.json"),
  ]);
  return { appConfig, easConfig, mobilePackage };
}

test("Gate 7A locks the EAS project, native identifiers, scheme, and profiles", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  assert.deepEqual(
    validateReleaseConfiguration(appConfig, easConfig, mobilePackage),
    {
      androidPackage: "com.rezno.mobile",
      appName: "REZNO",
      buildProfiles: {
        development: "internal/development",
        preview: "internal/preview",
        production: "store/production",
      },
      easProjectId: "ef209c9c-0d04-4731-a998-6241fef1b29d",
      iosBundleIdentifier: "com.rezno.mobile",
      scheme: "rezno",
      stagingApiBaseUrl: "https://rezno-staging.vercel.app",
      status: "valid",
      webRuntime: "react-native-web",
    },
  );
});

test("Gate 7A rejects a changed scheme, package identity, or EAS project", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  for (const changed of [
    { path: "scheme", value: "rezno-preview" },
    { path: "android", value: "com.example.rezno" },
    { path: "ios", value: "com.example.rezno" },
    { path: "project", value: "00000000-0000-4000-8000-000000000000" },
  ] as const) {
    const invalid = structuredClone(appConfig);
    if (changed.path === "scheme") invalid.expo.scheme = changed.value;
    if (changed.path === "android") invalid.expo.android.package = changed.value;
    if (changed.path === "ios") {
      invalid.expo.ios.bundleIdentifier = changed.value;
    }
    if (changed.path === "project") {
      invalid.expo.extra.eas.projectId = changed.value;
    }
    assert.throws(
      () => validateReleaseConfiguration(invalid, easConfig, mobilePackage),
      /Expected values to be strictly equal/,
    );
  }
});

test("Gate 7A pins the iOS export-compliance declaration", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  assert.equal(
    appConfig.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption,
    false,
  );

  const missingDeclaration = structuredClone(appConfig);
  delete (
    missingDeclaration.expo.ios.infoPlist as {
      ITSAppUsesNonExemptEncryption?: boolean;
    }
  ).ITSAppUsesNonExemptEncryption;
  assert.throws(
    () =>
      validateReleaseConfiguration(
        missingDeclaration,
        easConfig,
        mobilePackage,
      ),
    /non-exempt encryption/,
  );
});

test("The Next production type graph excludes native-only Mobile sources", async () => {
  const [nextConfigSource, nextBuildTsConfig] = await Promise.all([
    readFile("next.config.ts", "utf8"),
    readJson<NextBuildTsConfig>("tsconfig.next.json"),
  ]);
  assert.match(
    nextConfigSource,
    /tsconfigPath:\s*"tsconfig\.next\.json"/,
  );
  assert.equal(nextBuildTsConfig.include.includes("app/**/*.ts"), true);
  assert.equal(nextBuildTsConfig.include.includes("features/**/*.ts"), true);
  assert.equal(nextBuildTsConfig.include.includes("**/*.ts"), false);
  assert.equal(nextBuildTsConfig.exclude.includes("apps/mobile/**"), true);
  assert.equal(nextBuildTsConfig.exclude.includes("tests/**"), true);
});

test("Gate 7A rejects unsafe or cross-environment device profiles", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  const unsafePreview = structuredClone(easConfig);
  unsafePreview.build.preview.env = {
    EXPO_PUBLIC_REZNO_API_BASE_URL: "http://localhost:3000",
  };
  assert.throws(
    () => validateReleaseConfiguration(
      appConfig,
      unsafePreview,
      mobilePackage,
    ),
    /canonical public staging API origin/,
  );

  const crossEnvironment = structuredClone(easConfig);
  crossEnvironment.build.preview.environment = "production";
  assert.throws(
    () => validateReleaseConfiguration(
      appConfig,
      crossEnvironment,
      mobilePackage,
    ),
    /Expected values to be strictly equal/,
  );
});

test("Gate 7A keeps the production API origin outside tracked build profiles", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  assert.equal(
    easConfig.build.production.env?.EXPO_PUBLIC_REZNO_API_BASE_URL,
    undefined,
  );
  assert.equal(
    RELEASE_CONFIG_CONTRACT.stagingApiBaseUrl,
    easConfig.build.preview.env?.EXPO_PUBLIC_REZNO_API_BASE_URL,
  );

  const leakedStaging = structuredClone(easConfig);
  leakedStaging.build.production.env = {
    EXPO_PUBLIC_REZNO_API_BASE_URL: RELEASE_CONFIG_CONTRACT.stagingApiBaseUrl,
  };
  assert.throws(
    () => validateReleaseConfiguration(
      appConfig,
      leakedStaging,
      mobilePackage,
    ),
    /separately approved EAS production environment/,
  );
});

test("Gate 7A keeps Expo Web dependencies version-compatible", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  assert.equal(
    validateReleaseConfiguration(appConfig, easConfig, mobilePackage)
      .webRuntime,
    "react-native-web",
  );

  const mismatched = structuredClone(mobilePackage);
  mismatched.dependencies["react-dom"] = "18.3.1";
  assert.throws(
    () => validateReleaseConfiguration(appConfig, easConfig, mismatched),
    /React DOM must exactly match React/,
  );
});

test("Gate 7C pins the native browser handoff dependency and plugin", async () => {
  const { appConfig, easConfig, mobilePackage } =
    await repositoryConfiguration();
  assert.equal(
    validateReleaseConfiguration(appConfig, easConfig, mobilePackage).status,
    "valid",
  );

  const missingPlugin = structuredClone(appConfig);
  missingPlugin.expo.plugins = missingPlugin.expo.plugins.filter(
    (plugin) => plugin !== "expo-web-browser",
  );
  assert.throws(
    () =>
      validateReleaseConfiguration(missingPlugin, easConfig, mobilePackage),
    /hosted payment handoff/,
  );

  const mismatchedDependency = structuredClone(mobilePackage);
  mismatchedDependency.dependencies["expo-web-browser"] = "^1.0.0";
  assert.throws(
    () =>
      validateReleaseConfiguration(
        appConfig,
        easConfig,
        mismatchedDependency,
      ),
    /Expected values to be strictly equal/,
  );
});

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}
