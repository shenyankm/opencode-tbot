import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { getTelegramCommands, TELEGRAM_COMMANDS } from "../src/bot/commands/command-list.js";
import {
    syncTelegramCommands,
    syncTelegramCommandsForChat,
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
            command: "lsp",
            description: "Show LSP servers",
        },
        {
            command: "mcp",
            description: "Show MCP servers",
        },
        {
            command: "new",
            description: "Create a new session",
        },
        {
            command: "agents",
            description: "View and switch agents",
        },
        {
            command: "sessions",
            description: "View and switch sessions",
        },
        {
            command: "abort",
            description: "Abort running request",
        },
        {
            command: "model",
            description: "View and switch models",
        },
        {
            command: "language",
            description: "View and switch language",
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

test("syncTelegramCommandsForChat applies localized command descriptions to one chat", async () => {
    const calls: Array<{ commands: unknown; other?: unknown }> = [];

    await syncTelegramCommandsForChat(
        {
            async setMyCommands(commands: unknown, other?: unknown) {
                calls.push({ commands, other });
                return true;
            },
        } as never,
        7,
        "zh-CN",
    );

    assert.deepEqual(calls, [
        {
            commands: getTelegramCommands("zh-CN"),
            other: {
                scope: {
                    type: "chat",
                    chat_id: 7,
                },
            },
        },
    ]);
});
