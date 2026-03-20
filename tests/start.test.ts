import assert from "node:assert/strict";
import test from "node:test";
import { getChatCopy } from "../src/bot/i18n.js";
import { handleStartCommand } from "../src/bot/commands/start.js";
import type { BotDependencies } from "../src/bot/types.js";
import { presentStartMarkdownMessage } from "../src/bot/presenters/static.presenter.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { buildTelegramStaticReply } from "../src/services/telegram/telegram-format.js";

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

test("/start sends the simplified quick-start welcome message with MarkdownV2", async () => {
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
    assert.match(replies[0]?.text ?? "", /`\/status`/);
    assert.match(replies[0]?.text ?? "", /Send a text or image message directly\\\./);
    assert.doesNotMatch(replies[0]?.text ?? "", /`\/help`/);
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
    assert.match(replies[0]?.text ?? "", /Run \/new \[title\] to create a fresh session\./);
    assert.match(replies[0]?.text ?? "", /Send a text or image message directly\./);
    assert.doesNotMatch(replies[0]?.text ?? "", /Use \/help/);
});
