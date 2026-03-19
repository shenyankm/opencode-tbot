import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
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
            logger: {
                error(error: unknown) {
                    errors.push(error);
                },
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
        } as never,
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
                fallbackText: "杩欐槸椤圭洰绠€浠?",
                parts: [{ type: "text", text: "杩欐槸椤圭洰绠€浠?" }] as never,
            }),
        }),
    });

    await handleTextMessage(
        {
            chat: { id: 18 },
            message: { text: "浠嬬粛杩欎釜椤圭洰" },
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
        { text: "Processing...", other: undefined },
        {
            text: "杩欐槸椤圭洰绠€浠?\n\nDuration: 120 ms | Tokens: 42",
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
        { text: "澶勭悊涓?..", other: undefined },
        {
            text: "*Hello*\n\n鑰楁椂: 120 ms \\| 浠ょ墝鏁? 42",
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
