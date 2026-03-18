import assert from "node:assert/strict";
import test from "node:test";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";

function createDependencies(sendPrompt: (input: { chatId: number; text: string }) => Promise<{ replyText: string }>) {
    const errors: unknown[] = [];

    return {
        dependencies: {
            logger: {
                error(error: unknown) {
                    errors.push(error);
                },
                warn() { },
            },
            sendPromptUseCase: {
                execute: sendPrompt,
            },
        } as never,
        errors,
    };
}

test("handleTextMessage deletes the processing placeholder after a successful reply", async () => {
    const replies: string[] = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 100;
    const { dependencies } = createDependencies(async ({ chatId, text }) => {
        assert.equal(chatId, 1);
        assert.equal(text, "hello");

        return { replyText: "final reply" };
    });

    await handleTextMessage(
        {
            chat: { id: 1 },
            message: { text: " hello " },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
            },
            async reply(text) {
                replies.push(text);
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, ["Processing...", "final reply"]);
    assert.deepEqual(deleted, [{ chatId: 1, messageId: 100 }]);
});

test("handleTextMessage also deletes the processing placeholder after sending an error reply", async () => {
    const replies: string[] = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 200;
    const { dependencies, errors } = createDependencies(async () => {
        throw new Error("boom");
    });

    await handleTextMessage(
        {
            chat: { id: 9 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
            },
            async reply(text) {
                replies.push(text);
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, ["Processing...", "Error: boom"]);
    assert.deepEqual(deleted, [{ chatId: 9, messageId: 200 }]);
    assert.equal(errors.length, 1);
});
