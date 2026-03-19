import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionFilePartInput, PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { handleImageMessage } from "../src/bot/handlers/file.handler.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ImageMessageUnsupportedError } from "../src/use-cases/upload-file.usecase.js";

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
    sendPrompt?: (input: {
        chatId: number;
        text?: string | null;
        files?: PromptSessionFilePartInput[];
    }) => Promise<{ assistantReply: PromptSessionResult }>;
    uploadFile?: (input: {
        expectedType: "image";
        filePath: string;
        filename?: string | null;
        mimeType?: string | null;
    }) => Promise<PromptSessionFilePartInput>;
} = {}) {
    const errors: unknown[] = [];
    const pendingActionRepo = new InMemoryPendingActionRepository();
    const sessionRepo = new InMemorySessionRepository();

    return {
        dependencies: {
            logger: {
                error(error: unknown) {
                    errors.push(error);
                },
                warn() { },
            },
            pendingActionRepo,
            sessionRepo,
            sendPromptUseCase: {
                execute: options.sendPrompt ?? (async () => ({
                    assistantReply: createPromptReply(),
                })),
            },
            uploadFileUseCase: {
                execute: options.uploadFile ?? (async () => ({
                    filename: "telegram.jpg",
                    mime: "image/jpeg",
                    url: "data:image/jpeg;base64,/9j/",
                })),
            },
        } as never,
        errors,
        pendingActionRepo,
        sessionRepo,
    };
}

test("handleImageMessage forwards image captions and file parts to OpenCode", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1500;
    const { dependencies } = createDependencies({
        uploadFile: async (input) => {
            assert.deepEqual(input, {
                expectedType: "image",
                filePath: "photos/file_42.jpg",
                filename: null,
                mimeType: "image/jpeg",
            });

            return {
                filename: "telegram.jpg",
                mime: "image/jpeg",
                url: "data:image/jpeg;base64,/9j/",
            };
        },
        sendPrompt: async ({ chatId, text, files }) => {
            assert.equal(chatId, 20);
            assert.equal(text, "analyze this");
            assert.deepEqual(files, [{
                filename: "telegram.jpg",
                mime: "image/jpeg",
                url: "data:image/jpeg;base64,/9j/",
            }]);

            return {
                assistantReply: createPromptReply(),
            };
        },
    });

    await handleImageMessage(
        {
            chat: { id: 20 },
            message: {
                caption: " analyze this ",
                photo: [
                    { file_id: "small", file_size: 100 },
                    { file_id: "large", file_size: 200 },
                ],
            },
            async getFile() {
                return {
                    file_path: "photos/file_42.jpg",
                };
            },
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
    assert.deepEqual(deleted, [{ chatId: 20, messageId: 1500 }]);
});

test("handleImageMessage ignores non-image Telegram documents", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const { dependencies } = createDependencies({
        sendPrompt: async () => {
            throw new Error("should not run");
        },
    });

    await handleImageMessage(
        {
            chat: { id: 21 },
            message: {
                document: {
                    file_id: "doc",
                    file_name: "report.pdf",
                    mime_type: "application/pdf",
                },
            },
            async getFile() {
                throw new Error("should not run");
            },
            api: {
                async deleteMessage() {
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: 1 };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, []);
});

test("handleImageMessage presents localized image errors", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1600;
    const { dependencies, sessionRepo } = createDependencies({
        uploadFile: async () => {
            throw new ImageMessageUnsupportedError("Unsupported image MIME type: application/pdf");
        },
    });

    await sessionRepo.setCurrent({
        chatId: 22,
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

    await handleImageMessage(
        {
            chat: { id: 22 },
            message: {
                document: {
                    file_id: "image-doc",
                    file_name: "screenshot.png",
                    mime_type: "image/png",
                    file_size: 10,
                },
            },
            async getFile() {
                return {
                    file_path: "photos/file_99.png",
                };
            },
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
            text: "图片文件过大或不受支持。\n原因: Unsupported image MIME type: application/pdf",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 22, messageId: 1600 }]);
});

test("handleImageMessage blocks image prompts while waiting for a session rename", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const { dependencies, pendingActionRepo } = createDependencies({
        sendPrompt: async () => {
            throw new Error("should not run");
        },
    });

    await pendingActionRepo.set({
        chatId: 23,
        kind: "session_rename",
        sessionId: "session-2",
        menuMessageId: 999,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    await handleImageMessage(
        {
            chat: { id: 23 },
            message: {
                photo: [
                    { file_id: "small", file_size: 100 },
                    { file_id: "large", file_size: 200 },
                ],
            },
            async getFile() {
                return {
                    file_path: "photos/file_42.jpg",
                };
            },
            api: {
                async deleteMessage() {
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: 1 };
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        {
            text: "Waiting for the new session name. Send plain text or /cancel.",
            other: undefined,
        },
    ]);
});
