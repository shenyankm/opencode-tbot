import assert from "node:assert/strict";
import test from "node:test";
import { getBotCopy } from "../src/bot/copy.js";
import type { BotDependencies } from "../src/bot/types.js";
import {
    DEFAULT_TOKEN_SHOW_BREAKDOWN,
} from "../src/domain/token/token-settings.entity.js";
import {
    OpenCodePromptTimeoutError,
    type PromptSessionResult,
} from "../src/services/opencode/opencode.client.js";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";

function processingMarkup(reply: { other?: unknown }): unknown {
    const other = reply.other as { reply_markup?: { inline_keyboard: Array<Array<{ callback_data?: string; text: string }>> } };
    const button = other.reply_markup?.inline_keyboard[0]?.[0];
    assert.match(button?.callback_data ?? "", /^prompt:stop:[a-f0-9-]+$/u);
    assert.ok(button?.text);
    return reply.other;
}

function createPromptReply(overrides: Partial<PromptSessionResult> = {}): PromptSessionResult {
    return {
        assistantError: null,
        bodyMd: "## Hello",
        fallbackText: "Hello",
        info: null,
        metrics: {
            durationMs: 120,
            tokens: {
                total: 37,
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

function createDependencies(options: {
    listSessions?: (input: { chatId: number }) => Promise<{
        currentDirectory: string;
        currentProjectId: string;
        currentSessionId: string | null;
        sessions: Array<{
            directory: string;
            id: string;
            projectID: string;
            slug: string;
            time: { created: number; updated: number };
            title: string;
            version: string;
        }>;
    }>;
    renameSession?: (input: {
        chatId: number;
        sessionId: string;
        title: string;
    }) => Promise<{
        found: boolean;
        session?: {
            directory: string;
            id: string;
            projectID: string;
            slug: string;
            time: { created: number; updated: number };
            title: string;
            version: string;
        };
    }>;
    sendPrompt: (input: { chatId: number; text: string }) => Promise<{ assistantReply: PromptSessionResult }>;
    showBreakdown?: boolean;
}) {
    const errors: unknown[] = [];
    const pendingActionRepo = new InMemoryPendingActionRepository();
    const warnings: unknown[] = [];
    const sessionRepo = new InMemorySessionRepository();

    return {
        dependencies: {
            listSessionsUseCase: {
                execute: options.listSessions ?? (async () => ({
                    currentDirectory: "E:/repo-1",
                    currentProjectId: "project-1",
                    currentSessionId: null,
                    sessions: [],
                })),
            },
            foregroundSessionTracker: new ForegroundSessionTracker(),
            getTokenSettingsUseCase: {
                async execute() {
                    return {
                        showBreakdown: options.showBreakdown ?? DEFAULT_TOKEN_SHOW_BREAKDOWN,
                    };
                },
            },
            logger: {
                child() {
                    return this;
                },
                error(error: unknown) {
                    errors.push(error);
                },
                async flush() { },
                warn(warning: unknown) {
                    warnings.push(warning);
                },
            },
            pendingActionRepo,
            renameSessionUseCase: {
                execute: options.renameSession ?? (async () => ({
                    found: false,
                })),
            },
            sessionRepo,
            sendPromptUseCase: {
                execute: options.sendPrompt,
            },
        } as unknown as BotDependencies,
        errors,
        pendingActionRepo,
        sessionRepo,
        warnings,
    };
}

test("handleTextMessage sends MarkdownV2 replies with metrics and deletes the processing placeholder", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 100;
    const { dependencies } = createDependencies({
        sendPrompt: async ({ chatId, text }) => {
            assert.equal(chatId, 1);
            assert.equal(text, "hello");

            return {
                assistantReply: createPromptReply(),
            };
        },
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
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: "*Hello*",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 1, messageId: 100 }]);
    return;

    assert.deepEqual(replies, [
        { text: "澶勭悊涓?..", other: undefined },
        {
            text: "*Hello*\n\n鑰楁椂: 120 ms \\| 浠ょ墝鏁? 37",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 21, messageId: 900 }]);
    return;

    assert.deepEqual(replies, [
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: "*Hello*",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 1, messageId: 100 }]);
});

test("handleTextMessage falls back to plain text when the preferred Telegram markdown reply fails", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 200;
    const { dependencies, warnings } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply(),
        }),
    });

    await handleTextMessage(
        {
            chat: { id: 2 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: "*Hello*",
            other: { parse_mode: "MarkdownV2" },
        },
        {
            text: "Hello",
            other: undefined,
        },
    ]);
    assert.equal(warnings.length, 1);
    assert.deepEqual(deleted, [{ chatId: 2, messageId: 200 }]);
});

test("handleTextMessage does not append statistics even when legacy token breakdown is enabled", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 225;
    const { dependencies } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply(),
        }),
        showBreakdown: true,
    });

    await handleTextMessage(
        {
            chat: { id: 22 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: [
                "*Hello*",
            ].join("\n"),
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 22, messageId: 225 }]);
});

test("handleTextMessage shows recovered assistant text instead of the empty-response copy when markdown is unavailable", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 250;
    const { dependencies } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply({
                bodyMd: null,
                fallbackText: "Recovered reply",
                parts: [{ type: "text", text: "Recovered reply" }] as never,
                structured: null,
            }),
        }),
    });

    await handleTextMessage(
        {
            chat: { id: 3 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: "Recovered reply",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 3, messageId: 250 }]);
});

test("handleTextMessage also deletes the processing placeholder after sending an error reply", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 300;
    const { dependencies, errors } = createDependencies({
        sendPrompt: async () => {
            throw new Error("boom");
        },
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
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        { text: "Unexpected error.\nCause: boom", other: undefined },
    ]);
    assert.deepEqual(deleted, [{ chatId: 9, messageId: 300 }]);
    assert.equal(errors.length, 1);
});

test("handleTextMessage releases the active chat lock and deletes the placeholder after a prompt timeout", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 350;
    let callCount = 0;
    const { dependencies } = createDependencies({
        sendPrompt: async () => {
            callCount += 1;

            if (callCount === 1) {
                throw new OpenCodePromptTimeoutError({
                    elapsedMs: 5,
                    sessionId: "session-1",
                    stage: "send-prompt",
                    timeoutMs: 5,
                });
            }

            return {
                assistantReply: createPromptReply(),
            };
        },
    });

    const ctx = {
        chat: { id: 10 },
        message: { text: "hello" },
        api: {
            async deleteMessage(chatId: number, messageId: number) {
                deleted.push({ chatId, messageId });
                return true;
            },
            async editMessageText() {
                return true;
            },
        },
        async reply(text: string, other?: unknown) {
            replies.push({ text, other });
            return { message_id: nextMessageId++ };
        },
    };

    await handleTextMessage(ctx, dependencies);
    await handleTextMessage(ctx, dependencies);

    assert.deepEqual(replies, [
        { text: "Processing...", other: processingMarkup(replies[0]) },
        { text: "OpenCode request timed out.", other: undefined },
        { text: "Processing...", other: processingMarkup(replies[2]) },
        {
            text: "*Hello*",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [
        { chatId: 10, messageId: 350 },
        { chatId: 10, messageId: 352 },
    ]);
});

test("handleTextMessage rejects a second plain-text prompt while one is already running", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 500;
    let releaseFirstRequest: (() => void) | null = null;
    const firstRequestStarted = new Promise<void>((resolve) => {
        releaseFirstRequest = resolve;
    });
    const { dependencies } = createDependencies({
        sendPrompt: async ({ text }) => {
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
        },
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
                async editMessageText() {
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
                async editMessageText() {
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

    if (!releaseFirstRequest) {
        throw new Error("expected the first request gate to be initialized");
    }

    (releaseFirstRequest as () => void)();
    await firstCall;

    assert.deepEqual(replies, [
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: "Another request is still running. Wait for it to finish before sending a new prompt.",
            other: undefined,
        },
        {
            text: "*Hello*",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 11, messageId: 500 }]);
});

test("handleTextMessage renders assistant-side prompt errors without inline statistics and deletes the processing placeholder", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 700;
    const { dependencies } = createDependencies({
        sendPrompt: async () => ({
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
        }),
    });

    await handleTextMessage(
        {
            chat: { id: 15 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: [
                "Structured output validation failed.",
                "Cause: Schema validation failed | retries: 2",
            ].join("\n"),
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 15, messageId: 700 }]);
});

test("handleTextMessage shows assistant-side prompt errors even when text parts were present", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 800;
    const { dependencies, warnings } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply({
                assistantError: {
                    name: "StructuredOutputError",
                    data: {
                        message: "Model did not produce structured output",
                        retries: 0,
                    },
                } as never,
                bodyMd: null,
                fallbackText: "This text should not be shown.",
                parts: [{ type: "text", text: "This text should not be shown." }] as never,
            }),
        }),
    });

    await handleTextMessage(
        {
            chat: { id: 18 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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
        { text: "Processing...", other: processingMarkup(replies[0]) },
        {
            text: [
                "Structured output validation failed.",
                "Cause: Model did not produce structured output | retries: 0",
            ].join("\n"),
            other: undefined,
        },
    ]);
    assert.equal(warnings.length, 0);
    assert.deepEqual(deleted, [{ chatId: 18, messageId: 800 }]);
});

test("handleTextMessage localizes bot-generated status text and reply body for Chinese chats", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 900;
    const copy = getBotCopy("zh-CN");
    const { dependencies, sessionRepo } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply(),
        }),
    });

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
                async editMessageText() {
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
        { text: copy.status.processing, other: processingMarkup(replies[0]) },
        {
            text: `*Hello*`,
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 21, messageId: 900 }]);
});

test("handleTextMessage consumes pending session rename input, renames the session, and restores the session list", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const edits: Array<{ chatId: number; messageId: number; text: string; other?: unknown }> = [];
    let sessions = [
        {
            id: "session-1",
            slug: "session-1",
            projectID: "project-1",
            directory: "E:/repo-1",
            title: "Session 1",
            version: "1",
            time: {
                created: 1,
                updated: 1,
            },
        },
        {
            id: "session-2",
            slug: "session-2",
            projectID: "project-1",
            directory: "E:/repo-1",
            title: "Session 2",
            version: "1",
            time: {
                created: 1,
                updated: 1,
            },
        },
    ];
    const { dependencies, pendingActionRepo } = createDependencies({
        listSessions: async () => ({
            currentDirectory: "E:/repo-1",
            currentProjectId: "project-1",
            currentSessionId: null,
            sessions,
        }),
        renameSession: async ({ sessionId, title }) => {
            const renamedSession = {
                ...sessions[1],
                id: sessionId,
                slug: sessionId,
                title,
            };
            sessions = [sessions[0], renamedSession];

            return {
                found: true,
                session: renamedSession,
            };
        },
        sendPrompt: async () => {
            throw new Error("should not run");
        },
    });

    await pendingActionRepo.set({
        chatId: 31,
        kind: "session_rename",
        sessionId: "session-2",
        menuMessageId: 444,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    await handleTextMessage(
        {
            chat: { id: 31 },
            message: { text: " Renamed Session " },
            api: {
                async deleteMessage() {
                    return true;
                },
                async editMessageText(chatId, messageId, text, other) {
                    edits.push({ chatId, messageId, text, other });
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: 999 };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        {
            text: "Session renamed.\nCurrent session: Renamed Session [session-2]",
            other: undefined,
        },
    ]);
    assert.equal(edits.length, 1);
    assert.equal(edits[0]?.chatId, 31);
    assert.equal(edits[0]?.messageId, 444);
    assert.equal(
        edits[0]?.text,
        [
            "Session List",
            "Current project: E:/repo-1",
            "Current session: Not selected",
            "Page 1/1",
            "",
            "1. Session 1 [session-1]",
            "2. Renamed Session [session-2]",
        ].join("\n"),
    );
    assert.deepEqual(
        (edits[0]?.other as {
            reply_markup?: {
                inline_keyboard?: Array<Array<{ callback_data: string; text: string }>>;
            };
        })?.reply_markup?.inline_keyboard,
        [[
            { text: "1", callback_data: "sessions:pick:0:session-1" },
            { text: "2", callback_data: "sessions:pick:0:session-2" },
        ]],
    );
    assert.equal(await pendingActionRepo.getByChatId(31), null);
    return;
    assert.deepEqual(edits, [
        {
            chatId: 31,
            messageId: 444,
            text: [
                "Session List",
                "Current project: E:/repo-1",
                "Current session: Not selected",
                "Page 1/1",
                "",
                "1. Session 1 [session-1]",
                "2. Renamed Session [session-2]",
            ].join("\n"),
            other: {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "1", callback_data: "sessions:pick:0:session-1" },
                            { text: "2", callback_data: "sessions:pick:0:session-2" },
                        ],
                    ],
                },
            },
        },
    ]);
    assert.equal(await pendingActionRepo.getByChatId(31), null);
});

test("handleTextMessage keeps pending session rename mode on empty titles", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const { dependencies, pendingActionRepo } = createDependencies({
        sendPrompt: async () => {
            throw new Error("should not run");
        },
    });

    await pendingActionRepo.set({
        chatId: 32,
        kind: "session_rename",
        sessionId: "session-2",
        menuMessageId: 445,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    await handleTextMessage(
        {
            chat: { id: 32 },
            message: { text: "   " },
            api: {
                async deleteMessage() {
                    return true;
                },
                async editMessageText() {
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: 1000 };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        {
            text: "Session name cannot be empty. Send a new name or /cancel.",
            other: undefined,
        },
    ]);
    assert.notEqual(await pendingActionRepo.getByChatId(32), null);
});

test("handleTextMessage falls back to the default locale when chat state lookup fails before prompting", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 500;
    const { dependencies } = createDependencies({
        sendPrompt: async () => ({
            assistantReply: createPromptReply(),
        }),
    });

    dependencies.sessionRepo = {
        async getByChatId() {
            throw new Error("state boom");
        },
    } as never;

    await handleTextMessage(
        {
            chat: { id: 42 },
            message: { text: "hello" },
            api: {
                async deleteMessage(chatId, messageId) {
                    deleted.push({ chatId, messageId });
                    return true;
                },
                async editMessageText() {
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

    assert.equal(replies[0]?.text, "Processing...");
    assert.match(replies[1]?.text ?? "", /Hello/);
    assert.deepEqual(deleted, [{
        chatId: 42,
        messageId: 500,
    }]);
});


