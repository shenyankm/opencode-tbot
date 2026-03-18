import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { TELEGRAM_COMMANDS } from "../src/bot/commands/command-list.js";
import {
    syncTelegramCommands,
    TELEGRAM_COMMAND_SYNC_SCOPES,
} from "../src/bot/commands/sync-commands.js";

const logger = {
    info() { },
} as unknown as Logger;

test("TELEGRAM_COMMANDS only advertises implemented commands", () => {
    assert.deepEqual(TELEGRAM_COMMANDS, [
        {
            command: "start",
            description: "Show bot overview",
        },
        {
            command: "health",
            description: "Check server health",
        },
        {
            command: "path",
            description: "Show current paths",
        },
        {
            command: "config",
            description: "Show configuration",
        },
        {
            command: "agents",
            description: "View and switch agents",
        },
        {
            command: "projects",
            description: "View and switch projects",
        },
        {
            command: "sessions",
            description: "View and switch sessions",
        },
        {
            command: "model",
            description: "View and switch models",
        },
    ]);
});

test("syncTelegramCommands pushes the command list to Telegram", async () => {
    const calls: Array<{ commands: unknown; other?: unknown }> = [];

    await syncTelegramCommands(
        {
            api: {
                async setMyCommands(commands: unknown, other?: unknown) {
                    calls.push({ commands, other });
                    return true;
                },
            },
        } as never,
        logger,
    );

    assert.deepEqual(
        calls,
        TELEGRAM_COMMAND_SYNC_SCOPES.map((scope) => ({
            commands: TELEGRAM_COMMANDS,
            other: { scope },
        })),
    );
});
