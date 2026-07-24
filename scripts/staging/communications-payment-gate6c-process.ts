import { spawn } from "node:child_process";

export function runComposedStagingScript(
  script:
    | "cleanup:staging:outbound-communications-stage4c"
    | "seed:staging:outbound-communications-stage4c",
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REZNO_OUTBOUND_SINK: "enabled",
        REZNO_OUTBOUND_SINK_CONFIRM: "rezno-stage4c-sink",
        REZNO_STAGE4C_QA_CONFIRM:
          "rezno-qa-outbound-communications-stage4c",
        REZNO_STAGE6_GATE6C_SUCCESSOR: "true",
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolve();
      else {
        reject(
          new Error(
            `Composed staging script failed safely (${code ?? signal ?? "unknown"}).`,
          ),
        );
      }
    });
  });
}
