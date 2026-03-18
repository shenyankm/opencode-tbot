import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";

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
    const sessionRepo = new InMemorySessionRepository();

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
            sessionRepo,
            sendPromptUseCase: {
                execute: sendPrompt,
            },
        } as never,
        errors,
        sessionRepo,
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
            bodyMd: null,
            fallbackText: "OpenCode returned empty response.",
            parts: [],
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

test("handleTextMessage falls back to assistant text when structured output validation fails but text was produced", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 800;
    const { dependencies, warnings } = createDependencies(async () => ({
        assistantReply: createPromptReply({
            assistantError: {
                name: "StructuredOutputError",
                data: {
                    message: "Model did not produce structured output",
                    retries: 0,
                },
            } as never,
            bodyMd: null,
            fallbackText: "这是项目简介",
            parts: [{ type: "text", text: "这是项目简介" }] as never,
        }),
    }));

    await handleTextMessage(
        {
            chat: { id: 18 },
            message: { text: "介绍这个项目" },
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
            text: "这是项目简介\n\nDuration: 120 ms | Tokens: 42",
            other: undefined,
        },
    ]);
    assert.equal(warnings.length, 1);
    assert.deepEqual(deleted, [{ chatId: 18, messageId: 800 }]);
});

test("handleTextMessage localizes bot-generated status text and metrics footer for Chinese chats", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 900;
    const { dependencies, sessionRepo } = createDependencies(async () => ({
        assistantReply: createPromptReply(),
    }));

    await sessionRepo.setCurrent({
        chatId: 21,
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

    await handleTextMessage(
        {
            chat: { id: 21 },
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
        { text: "处理中...", other: undefined },
        {
            text: "*Hello*\n\n耗时: 120 ms \\| 令牌数: 42",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 21, messageId: 900 }]);
});
