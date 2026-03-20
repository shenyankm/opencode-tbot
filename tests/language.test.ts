import assert from "node:assert/strict";
import test from "node:test";
import { handleLanguageCommand } from "../src/bot/commands/language.js";
import { handleLanguageCallback } from "../src/bot/handlers/callback.handler.js";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { getTelegramCommands } from "../src/bot/commands/command-list.js";

const logger = {
    error() { },
    info() { },
} as unknown as AppLogger;

function createDependencies() {
    const sessionRepo = new InMemorySessionRepository();

    return {
        dependencies: {
            logger,
            sessionRepo,
        } as never as BotDependencies,
        sessionRepo,
    };
}

test("/language shows the current language and syncs chat commands", async () => {
    const { dependencies } = createDependencies();
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const commandCalls: Array<{ commands: unknown; other?: unknown }> = [];

    await handleLanguageCommand(
        {
            chat: { id: 1 },
            api: {
                async setMyCommands(commands, other) {
                    commandCalls.push({ commands, other });
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(commandCalls, [
        {
            commands: getTelegramCommands("en"),
            other: {
                scope: {
                    type: "chat",
                    chat_id: 1,
                },
            },
        },
    ]);
    assert.equal(replies.length, 1);
    assert.equal(
        replies[0].text,
        [
            "Language",
            "Current language: English",
            "",
            "Choose the display language for bot menus and replies.",
        ].join("\n"),
    );
    const keyboard = replies[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(keyboard.inline_keyboard, [
        [{ text: "[English]", callback_data: "language:select:en" }],
        [{ text: "Simplified Chinese", callback_data: "language:select:zh-CN" }],
        [{ text: "Japanese", callback_data: "language:select:ja" }],
    ]);
});

test("language callbacks switch the stored language and localize the menu", async () => {
    const { dependencies, sessionRepo } = createDependencies();
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const commandCalls: Array<{ commands: unknown; other?: unknown }> = [];
    let answered = 0;

    await handleLanguageCallback(
        {
            chat: { id: 7 },
            api: {
                async setMyCommands(commands, other) {
                    commandCalls.push({ commands, other });
                    return true;
                },
            },
            callbackQuery: { data: "language:select:zh-CN" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    const binding = await sessionRepo.getByChatId(7);

    assert.equal(answered, 1);
    assert.deepEqual(commandCalls, [
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
    assert.equal(edits.length, 1);
    assert.equal(
        edits[0].text,
        [
            "语言已切换。",
            "当前语言: 简体中文",
        ].join("\n"),
    );
    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(keyboard.inline_keyboard, [
        [{ text: "English", callback_data: "language:select:en" }],
        [{ text: "[简体中文]", callback_data: "language:select:zh-CN" }],
        [{ text: "日语", callback_data: "language:select:ja" }],
    ]);
    assert.deepEqual(binding, {
        chatId: 7,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "zh-CN",
        updatedAt: binding?.updatedAt,
    });
});

test("language callbacks can switch the stored language to Japanese", async () => {
    const { dependencies, sessionRepo } = createDependencies();
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const commandCalls: Array<{ commands: unknown; other?: unknown }> = [];
    let answered = 0;

    await handleLanguageCallback(
        {
            chat: { id: 9 },
            api: {
                async setMyCommands(commands, other) {
                    commandCalls.push({ commands, other });
                    return true;
                },
            },
            callbackQuery: { data: "language:select:ja" },
            async answerCallbackQuery() {
                answered += 1;
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    const binding = await sessionRepo.getByChatId(9);

    assert.equal(answered, 1);
    assert.deepEqual(commandCalls, [
        {
            commands: getTelegramCommands("ja"),
            other: {
                scope: {
                    type: "chat",
                    chat_id: 9,
                },
            },
        },
    ]);
    assert.equal(edits.length, 1);
    assert.equal(
        edits[0].text,
        [
            "言語を切り替えました。",
            "現在の言語: 日本語",
        ].join("\n"),
    );
    const keyboard = edits[0].other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(keyboard.inline_keyboard, [
        [{ text: "English", callback_data: "language:select:en" }],
        [{ text: "简体中文", callback_data: "language:select:zh-CN" }],
        [{ text: "[日本語]", callback_data: "language:select:ja" }],
    ]);
    assert.deepEqual(binding, {
        chatId: 9,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "ja",
        updatedAt: binding?.updatedAt,
    });
});
