import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_CONFIG_CONTRACT = Object.freeze({
  androidPackage: "com.rezno.mobile",
  appName: "REZNO",
  easProjectId: "ef209c9c-0d04-4731-a998-6241fef1b29d",
  iosBundleIdentifier: "com.rezno.mobile",
  owner: "alhakeem7",
  scheme: "rezno",
  slug: "rezno-mobile",
  stagingApiBaseUrl: "https://rezno-staging.vercel.app",
});

/**
 * @param {unknown} appConfig
 * @param {unknown} easConfig
 * @param {unknown} mobilePackage
 */
export function validateReleaseConfiguration(
  appConfig,
  easConfig,
  mobilePackage,
) {
  const app = record(appConfig, "app.json");
  const expo = record(app.expo, "app.json expo");
  const ios = record(expo.ios, "app.json expo.ios");
  const android = record(expo.android, "app.json expo.android");
  const extra = record(expo.extra, "app.json expo.extra");
  const easExtra = record(extra.eas, "app.json expo.extra.eas");
  const plugins = array(expo.plugins, "app.json expo.plugins");

  assert.equal(expo.name, RELEASE_CONFIG_CONTRACT.appName);
  assert.equal(expo.owner, RELEASE_CONFIG_CONTRACT.owner);
  assert.equal(expo.slug, RELEASE_CONFIG_CONTRACT.slug);
  assert.equal(expo.scheme, RELEASE_CONFIG_CONTRACT.scheme);
  assert.equal(ios.bundleIdentifier, RELEASE_CONFIG_CONTRACT.iosBundleIdentifier);
  assert.equal(android.package, RELEASE_CONFIG_CONTRACT.androidPackage);
  assert.equal(easExtra.projectId, RELEASE_CONFIG_CONTRACT.easProjectId);
  assert.equal(
    plugins.includes("expo-secure-store"),
    true,
    "expo-secure-store must remain registered for session recovery.",
  );

  const eas = record(easConfig, "eas.json");
  const builds = record(eas.build, "eas.json build");
  const development = profile(builds.development, "development");
  const preview = profile(builds.preview, "preview");
  const production = profile(builds.production, "production");

  assert.equal(development.developmentClient, true);
  assert.equal(development.distribution, "internal");
  assert.equal(development.environment, "development");
  assertStagingApiOrigin(development, "development");

  assert.notEqual(
    preview.developmentClient,
    true,
    "Preview must remain a standalone production-like client.",
  );
  assert.equal(preview.distribution, "internal");
  assert.equal(preview.environment, "preview");
  assertStagingApiOrigin(preview, "preview");

  assert.notEqual(
    production.developmentClient,
    true,
    "Production must not include the development client.",
  );
  assert.equal(production.distribution, "store");
  assert.equal(production.environment, "production");
  const productionEnvironment = optionalRecord(
    production.env,
    "production env",
  );
  assert.equal(
    productionEnvironment.EXPO_PUBLIC_REZNO_API_BASE_URL,
    undefined,
    "Production API origin must come from the separately approved EAS production environment.",
  );

  const packageConfiguration = record(mobilePackage, "package.json");
  const dependencies = record(
    packageConfiguration.dependencies,
    "package.json dependencies",
  );
  const scripts = record(packageConfiguration.scripts, "package.json scripts");
  assert.equal(dependencies.react, "19.2.3");
  assert.equal(
    dependencies["react-dom"],
    dependencies.react,
    "React DOM must exactly match React for Expo Web.",
  );
  assert.equal(dependencies["react-native-web"], "^0.21.2");
  assert.equal(scripts.web, "expo start --web");

  return {
    androidPackage: RELEASE_CONFIG_CONTRACT.androidPackage,
    appName: RELEASE_CONFIG_CONTRACT.appName,
    buildProfiles: {
      development: "internal/development",
      preview: "internal/preview",
      production: "store/production",
    },
    easProjectId: RELEASE_CONFIG_CONTRACT.easProjectId,
    iosBundleIdentifier: RELEASE_CONFIG_CONTRACT.iosBundleIdentifier,
    scheme: RELEASE_CONFIG_CONTRACT.scheme,
    stagingApiBaseUrl: RELEASE_CONFIG_CONTRACT.stagingApiBaseUrl,
    status: "valid",
    webRuntime: "react-native-web",
  };
}

/**
 * @param {Record<string, unknown>} buildProfile
 * @param {string} name
 */
function assertStagingApiOrigin(buildProfile, name) {
  const environment = record(buildProfile.env, `${name} env`);
  assert.equal(
    environment.EXPO_PUBLIC_REZNO_API_BASE_URL,
    RELEASE_CONFIG_CONTRACT.stagingApiBaseUrl,
    `${name} must use the canonical public staging API origin.`,
  );
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function profile(value, name) {
  return record(value, `eas.json build.${name}`);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {Record<string, unknown>}
 */
function record(value, name) {
  assert.equal(
    typeof value === "object" && value !== null && !Array.isArray(value),
    true,
    `${name} must be an object.`,
  );
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {Record<string, unknown>}
 */
function optionalRecord(value, name) {
  return value === undefined ? {} : record(value, name);
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {unknown[]}
 */
function array(value, name) {
  assert.equal(Array.isArray(value), true, `${name} must be an array.`);
  return /** @type {unknown[]} */ (value);
}

async function main() {
  const mobileDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const [appConfig, easConfig, mobilePackage] = await Promise.all([
    readJson(path.join(mobileDirectory, "app.json")),
    readJson(path.join(mobileDirectory, "eas.json")),
    readJson(path.join(mobileDirectory, "package.json")),
  ]);
  const result = validateReleaseConfiguration(
    appConfig,
    easConfig,
    mobilePackage,
  );
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(
    `Gate 7A release configuration is valid: ${result.scheme}:// · ${result.iosBundleIdentifier} · ${result.androidPackage} · ${result.stagingApiBaseUrl}`,
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const invokedPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : null;
if (
  invokedPath
  && fileURLToPath(import.meta.url) === invokedPath
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? `Gate 7A release configuration is invalid: ${error.message}`
        : "Gate 7A release configuration is invalid.",
    );
    process.exitCode = 1;
  });
}
