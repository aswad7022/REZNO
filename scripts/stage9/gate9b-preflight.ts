import {
  GATE9B_STAGING_ORIGIN,
  parseGate9BStagingDatabaseIdentity,
  validateGate9BEnvironment,
} from "../../features/stage9/gate9b";

const env = process.env;

const output: Record<string, unknown> = {
  databaseIdentity: null,
  preflight: validateGate9BEnvironment(env),
  stagingOrigin: GATE9B_STAGING_ORIGIN,
};

try {
  if (env.DATABASE_URL) {
    output.databaseIdentity = parseGate9BStagingDatabaseIdentity(env.DATABASE_URL, {
      expectedHost: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_HOST,
      expectedRole: env.REZNO_STAGE9_GATE9B_EXPECTED_DATABASE_ROLE,
    });
  }
} catch (error) {
  output.databaseIdentity = {
    code: error instanceof Error && "code" in error ? (error as { code: string }).code : "INVALID_DATABASE_IDENTITY",
    status: "failed-closed",
  };
}

console.log(JSON.stringify(output, null, 2));

if (!(output.preflight as { ok: boolean }).ok) {
  process.exitCode = 2;
}
