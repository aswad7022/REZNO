import assert from "node:assert/strict";
import test from "node:test";

import {
  OUTBOUND_STAGE4C_FIXTURE,
  validateOutboundStage4cEnvironment,
} from "../../../scripts/staging/outbound-communications-stage4c-seed-safety";

test("Gate 4C fixture accepts only the exact staging database and confirmation", () => {
  const allowed = {
    DATABASE_URL: "postgresql://operator:secret@stage.example/rezno_staging",
    NODE_ENV: "test",
    REZNO_ENV: "staging",
    REZNO_STAGE4C_QA_CONFIRM: OUTBOUND_STAGE4C_FIXTURE,
  } as NodeJS.ProcessEnv;
  assert.deepEqual(validateOutboundStage4cEnvironment(allowed), { database: "rezno_staging" });
  for (const environment of [
    { ...allowed, REZNO_STAGE4C_QA_CONFIRM: "wrong" },
    { ...allowed, DATABASE_URL: "mysql://stage.example/rezno_staging" },
    { ...allowed, DATABASE_URL: "postgresql://stage.example/rezno" },
    { ...allowed, DATABASE_URL: "postgresql://stage.example/rezno_production" },
    { ...allowed, REZNO_ENV: "live" },
    { ...allowed, NODE_ENV: "production" },
  ]) {
    assert.throws(() => validateOutboundStage4cEnvironment(environment as NodeJS.ProcessEnv));
  }
});
