import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
// The host test's opt-in is set for this child only; runtime config remains file based.
const environment = { ...process.env, OPENCODE_HOST_E2E: "1" };
const result = spawnSync(process.execPath, [cli, "--test", "tests/opencode-host.integration.test.ts"], {
    stdio: "inherit", env: environment, timeout: 360_000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
