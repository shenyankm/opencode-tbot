import assert from "node:assert/strict";
import test from "node:test";
import { createOpenCodeAppLogger } from "../src/infra/logger/index.js";

test("createOpenCodeAppLogger sends structured log entries through client.app.log", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const logger = createOpenCodeAppLogger({
        app: {
            async log(input) {
                calls.push(input);
                return true;
            },
        },
    });

    logger.info({ token: "sk-secret-token" }, "hello");
    logger.warn("plain warning");
    await logger.flush();

    assert.deepEqual(calls, [
        {
            service: "opencode-tbot",
            level: "info",
            message: "hello",
            extra: {
                token: "[REDACTED]",
            },
        },
        {
            service: "opencode-tbot",
            level: "warn",
            message: "plain warning",
        },
    ]);
});
