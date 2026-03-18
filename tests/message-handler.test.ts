import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";

function createPromptReply(overrides: Partial<PromptSessionResult> = {}): PromptSessionResult {
    return {
        assistantError: null,
        bodyMd: "## Hello",
        fallbackText: "Hello",
        info: null,
        metrics: {
            durationMs: 120,
            tokens: {
                total: 42,
                input: 10,
                output: 12,
                reasoning: 5,
                cacheRead: 15,
                cacheWrite: 0,
            },
        },
        parts: [],
        structured: {
            body_md: "## Hello",
        },
        ...overrides,
    };
}

function createDependencies(
    sendPrompt: (input: { chatId: number; text: string }) => Promise<{ assistantReply: PromptSessionResult }>,
) {
    const errors: unknown[] = [];
    const warnings: unknown[] = [];

    return {
        dependencies: {
            logger: {
                error(error: unknown) {
                    errors.push(error);
                },
                warn(warning: unknown) {
                    warnings.push(warning);
                },
            },
            sendPromptUseCase: {
                execute: sendPrompt,
            },
        } as never,
        errors,
        warnings,
    };
}

test("handleTextMessage sends MarkdownV2 replies with metrics and deletes the processing placeholder", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 100;
    const { dependencies } = createDependencies(async ({ chatId, text }) => {
        assert.equal(chatId, 1);
        assert.equal(text, "hello");

        return {
            assistantReply: createPromptReply(),
        };
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
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: "*Hello*\n\nDuration: 120 ms \\| Tokens: 42",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 1, messageId: 100 }]);
});

test("handleTextMessage falls back to plain text when the preferred Telegram markdown reply fails", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 200;
    const { dependencies, warnings } = createDependencies(async () => ({
        assistantReply: createPromptReply(),
    }));

    await handleTextMessage(
        {
            chat: { id: 2 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });

                if (other && "parse_mode" in (other as Record<string, unknown>)) {
                    throw new Error("parse failed");
                }

                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: "*Hello*\n\nDuration: 120 ms \\| Tokens: 42",
            other: { parse_mode: "MarkdownV2" },
        },
        {
            text: "Hello\n\nDuration: 120 ms | Tokens: 42",
            other: undefined,
        },
    ]);
    assert.equal(warnings.length, 1);
    assert.deepEqual(deleted, [{ chatId: 2, messageId: 200 }]);
});

test("handleTextMessage also deletes the processing placeholder after sending an error reply", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 300;
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
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        { text: "Unexpected error.\nCause: boom", other: undefined },
    ]);
    assert.deepEqual(deleted, [{ chatId: 9, messageId: 300 }]);
    assert.equal(errors.length, 1);
});

test("handleTextMessage rejects a second plain-text prompt while one is already running", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 500;
    let releaseFirstRequest: (() => void) | null = null;
    const firstRequestStarted = new Promise<void>((resolve) => {
        releaseFirstRequest = resolve;
    });
    const { dependencies } = createDependencies(async ({ text }) => {
        if (text === "first") {
            await firstRequestStarted;
            return {
                assistantReply: createPromptReply(),
            };
        }

        return {
            assistantReply: createPromptReply({
                fallbackText: "unexpected",
            }),
        };
    });

    const firstCall = handleTextMessage(
        {
            chat: { id: 11 },
            message: { text: "first" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    await new Promise((resolve) => setImmediate(resolve));

    await handleTextMessage(
        {
            chat: { id: 11 },
            message: { text: "second" },
            api: {
                async deleteMessage() {
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    releaseFirstRequest?.();
    await firstCall;

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: "Another request is still running. Wait for it to finish before sending a new prompt.",
            other: undefined,
        },
        {
            text: "*Hello*\n\nDuration: 120 ms \\| Tokens: 42",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 11, messageId: 500 }]);
});

test("handleTextMessage renders assistant-side prompt errors with metrics and deletes the processing placeholder", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 700;
    const { dependencies } = createDependencies(async () => ({
        assistantReply: createPromptReply({
            assistantError: {
                name: "StructuredOutputError",
                data: {
                    message: "Schema validation failed",
                    retries: 2,
                },
            } as never,
            bodyMd: "## Ignored",
            fallbackText: "ignored",
        }),
    }));

    await handleTextMessage(
        {
            chat: { id: 15 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: nextMessageId++ };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: [
                "Structured output validation failed.",
                "Cause: Schema validation failed | retries: 2",
                "",
                "Duration: 120 ms | Tokens: 42",
            ].join("\n"),
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 15, messageId: 700 }]);
});
