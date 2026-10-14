import assert from "node:assert/strict";
import test from "node:test";
import { handleTokenCommand } from "../src/bot/commands/token.js";
import { handleTokenCallback } from "../src/bot/handlers/callback.handler.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type { TokenFeatureDependencies } from "../src/bot/types.js";

function dependencies(): TokenFeatureDependencies {
    return {
        sessionRepo: new InMemorySessionRepository(),
        logger: { error() {}, child() { return this; } },
        contextFooter: { async read() { return { capacity: 475000, used: 361761 }; } },
        getTokenSettingsUseCase: { async execute() { throw new Error("Legacy setting must not be read"); } },
        toggleTokenSettingUseCase: { async execute() { throw new Error("Legacy setting must not be changed"); } },
    } as unknown as TokenFeatureDependencies;
}

test("the token command shows only context capacity and remaining percentage without toggles", async () => {
    const replies: unknown[] = [];
    await handleTokenCommand({ chat: { id: 1 }, async reply(text, other) { replies.push({ text, other }); } }, dependencies());
    assert.deepEqual(replies, [{ text: "Context: 24% left | 475K", other: undefined }]);
});

test("legacy token toggle buttons show current context and remove their obsolete keyboard", async () => {
    const edits: Array<{ text: string; other?: unknown }> = [];
    let acknowledged = 0;
    await handleTokenCallback({
        chat: { id: 1 }, callbackQuery: { data: "token:breakdown:on" },
        async answerCallbackQuery() { acknowledged += 1; },
        async editMessageText(text, other) { edits.push({ text, other }); },
    }, dependencies());
    assert.equal(acknowledged, 1);
    assert.equal(edits[0].text, "Context: 24% left | 475K");
    assert.equal((edits[0].other as { reply_markup: { inline_keyboard: unknown[][] } }).reply_markup.inline_keyboard.flat().length, 0);
});
