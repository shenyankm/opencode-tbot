import assert from "node:assert/strict";
import test from "node:test";
import { getTelegramCommands, TELEGRAM_COMMANDS } from "../src/bot/commands/command-list.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import {
    syncTelegramCommands,
    syncTelegramCommandsForChat,
    TELEGRAM_COMMAND_SYNC_SCOPES,
} from "../src/bot/commands/sync-commands.js";

const logger = {
    info() { },
} as unknown as AppLogger;

test("TELEGRAM_COMMANDS only advertises implemented commands", () => {
    assert.deepEqual(TELEGRAM_COMMANDS, [
        {
            command: "start",
            description: "Welcome and quick start",
        },
        {
            command: "status",
            description: "Show system status",
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
            command: "cancel",
            description: "Cancel rename or abort running request",
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

test("getTelegramCommands returns Japanese descriptions when requested", () => {
    assert.deepEqual(getTelegramCommands("ja"), [
        {
            command: "start",
            description: "ようこそ / クイックスタート",
        },
        {
            command: "status",
            description: "システム状態を表示",
        },
        {
            command: "new",
            description: "新しいセッションを作成",
        },
        {
            command: "agents",
            description: "agent を表示して切り替え",
        },
        {
            command: "sessions",
            description: "セッションを表示して切り替え",
        },
        {
            command: "cancel",
            description: "名前変更を取り消すか実行中のリクエストを中止",
        },
        {
            command: "model",
            description: "モデルを表示して切り替え",
        },
        {
            command: "language",
            description: "言語を表示して切り替え",
        },
    ]);
});
