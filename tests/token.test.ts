import assert from "node:assert/strict";
import test from "node:test";
import type { BotDependencies } from "../src/bot/types.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { InMemoryTokenSettingsRepository } from "../src/repositories/token-settings.repo.js";
import { handleTokenCommand } from "../src/bot/commands/token.js";
import { handleTokenCallback } from "../src/bot/handlers/callback.handler.js";
import { GetTokenSettingsUseCase } from "../src/use-cases/get-token-settings.usecase.js";
import { ToggleTokenSettingUseCase } from "../src/use-cases/toggle-token-setting.usecase.js";
import { DEFAULT_TOKEN_SHOW_BREAKDOWN } from "../src/domain/token/token-settings.entity.js";

const logger = {
    child() {
        return this;
    },
    error() { },
    async flush() { },
    info() { },
    warn() { },
} as unknown as AppLogger;

function createDependencies(showBreakdown = DEFAULT_TOKEN_SHOW_BREAKDOWN) {
    const sessionRepo = new InMemorySessionRepository();
    const tokenSettingsRepo = new InMemoryTokenSettingsRepository({
        showBreakdown,
    });

    return {
        dependencies: {
            getTokenSettingsUseCase: new GetTokenSettingsUseCase(tokenSettingsRepo),
            logger,
            sessionRepo,
            toggleTokenSettingUseCase: new ToggleTokenSettingUseCase(tokenSettingsRepo),
        } as unknown as BotDependencies,
        sessionRepo,
        tokenSettingsRepo,
    };
}

test("/token shows the current global token breakdown setting", async () => {
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const { dependencies } = createDependencies();

    await handleTokenCommand(
        {
            chat: { id: 1 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.text, [
        "Token Breakdown",
        "Control whether replies show a second footer line with the full token breakdown.",
        "This is a global plugin setting and affects future reply footers shown in every chat.",
        "",
        "Current status: Disabled",
        "Replies always show Duration | Displayed Tokens.",
        "When enabled, a second line shows input, output, reasoning, cache.read, and cache.write.",
    ].join("\n"));
    const keyboard = replies[0]?.other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(keyboard.inline_keyboard, [[
        { text: "Enabled", callback_data: "token:breakdown:on" },
        { text: "✓ Disabled", callback_data: "token:breakdown:off" },
    ]]);
});

test("token callbacks persist the global breakdown setting and reuse it in another chat", async () => {
    const answers: Array<{ show_alert?: boolean; text?: string } | undefined> = [];
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const replies: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const { dependencies } = createDependencies();

    await handleTokenCallback(
        {
            chat: { id: 1 },
            callbackQuery: { data: "token:breakdown:on" },
            async answerCallbackQuery(other) {
                answers.push(other);
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    await handleTokenCommand(
        {
            chat: { id: 2 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(answers, [undefined]);
    assert.match(edits[0]?.text ?? "", /Current status: Enabled/u);
    const editedKeyboard = edits[0]?.other?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string; text: string }>>;
    };
    assert.deepEqual(editedKeyboard.inline_keyboard, [[
        { text: "✓ Enabled", callback_data: "token:breakdown:on" },
        { text: "Disabled", callback_data: "token:breakdown:off" },
    ]]);

    assert.match(replies[0]?.text ?? "", /Current status: Enabled/u);
});

test("token callbacks remain idempotent when the selected breakdown setting is already active", async () => {
    const answers: Array<{ show_alert?: boolean; text?: string } | undefined> = [];
    const edits: Array<{ text: string; other?: { reply_markup?: unknown } }> = [];
    const { dependencies, tokenSettingsRepo } = createDependencies(true);

    await handleTokenCallback(
        {
            chat: { id: 3 },
            callbackQuery: { data: "token:breakdown:on" },
            async answerCallbackQuery(other) {
                answers.push(other);
                return {};
            },
            async editMessageText(text, other) {
                edits.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(answers, [undefined]);
    assert.match(edits[0]?.text ?? "", /Current status: Enabled/u);
    assert.deepEqual(
        await tokenSettingsRepo.get(),
        {
            showBreakdown: true,
        },
    );
});
