import assert from "node:assert/strict";
import test from "node:test";
import { getChatCopy } from "../src/bot/i18n.js";
import { handleHelpCommand } from "../src/bot/commands/help.js";
import { handleStartCommand } from "../src/bot/commands/start.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import {
    presentHelpMarkdownMessage,
    presentStartMarkdownMessage,
} from "../src/bot/presenters/static.presenter.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { buildTelegramStaticReply } from "../src/services/telegram/telegram-format.js";
import type { BotDependencies } from "../src/bot/types.js";

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

test("/start sends the new quick-start welcome message with MarkdownV2", async () => {
    const { dependencies, sessionRepo } = createDependencies();
    const replies: Array<{ other?: { parse_mode: "MarkdownV2" }; text: string }> = [];

    await handleStartCommand(
        {
            chat: { id: 1 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 1);
    const expected = buildTelegramStaticReply(presentStartMarkdownMessage(copy)).preferred;

    assert.deepEqual(replies, [{
        text: expected.text,
        other: expected.options,
    }]);
    assert.match(replies[0]?.text ?? "", /\*Welcome to opencode\\-tbot\*/);
    assert.match(replies[0]?.text ?? "", /`\/help`/);
});

test("/start falls back to plain text when the markdown reply cannot be sent", async () => {
    const { dependencies } = createDependencies();
    const replies: Array<{ other?: { parse_mode: "MarkdownV2" }; text: string }> = [];

    await handleStartCommand(
        {
            chat: { id: 2 },
            async reply(text, other) {
                if (other?.parse_mode === "MarkdownV2") {
                    throw new Error("markdown send failed");
                }

                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.other, undefined);
    assert.match(replies[0]?.text ?? "", /Use \/help to see the full command list and examples\./);
});

test("/help sends the localized command reference and examples with MarkdownV2", async () => {
    const { dependencies, sessionRepo } = createDependencies();
    const replies: Array<{ other?: { parse_mode: "MarkdownV2" }; text: string }> = [];

    await sessionRepo.setCurrent({
        chatId: 3,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "zh-CN",
        updatedAt: new Date(0).toISOString(),
    });

    await handleHelpCommand(
        {
            chat: { id: 3 },
            async reply(text, other) {
                replies.push({ text, other });
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 3);
    const expected = buildTelegramStaticReply(presentHelpMarkdownMessage(copy)).preferred;

    assert.deepEqual(replies, [{
        text: expected.text,
        other: expected.options,
    }]);
    assert.match(replies[0]?.text ?? "", /\*帮助\*/);
    assert.match(replies[0]?.text ?? "", /bug triage/);
    assert.match(replies[0]?.text ?? "", /`\/cancel`/);
});
