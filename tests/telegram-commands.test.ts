import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { TELEGRAM_COMMANDS } from "../src/bot/commands/command-list.js";
import { syncTelegramCommands } from "../src/bot/commands/sync-commands.js";

const logger = {
    info() { },
} as unknown as Logger;

test("TELEGRAM_COMMANDS only advertises implemented commands", () => {
    assert.deepEqual(TELEGRAM_COMMANDS, [
        {
            command: "start",
            description: "查看机器人说明",
        },
        {
            command: "projects",
            description: "查看并切换项目",
        },
    ]);
});

test("syncTelegramCommands pushes the command list to Telegram", async () => {
    const calls: unknown[] = [];

    await syncTelegramCommands(
        {
            api: {
                async setMyCommands(commands: unknown) {
                    calls.push(commands);
                    return true;
                },
            },
        } as never,
        logger,
    );

    assert.deepEqual(calls, [TELEGRAM_COMMANDS]);
});
