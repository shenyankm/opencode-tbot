import assert from "node:assert/strict";
import test from "node:test";
import { handleTextMessage } from "../src/bot/handlers/message.handler.js";
import { handleVoiceMessage } from "../src/bot/handlers/voice.handler.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import {
    VoiceTranscriptionNotConfiguredError,
    VoiceTranscriptEmptyError,
} from "../src/services/voice-transcription/openrouter-voice.client.js";
import {
    VoiceTranscodingDependencyError,
    VoiceTranscodingFailedError,
} from "../src/services/voice-transcription/audio-transcoder.js";
import { TelegramFileDownloadError } from "../src/services/telegram/telegram.client.js";

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
    downloadFile?: (input: { filePath: string }) => Promise<{ data: Uint8Array; mimeType: string | null }>;
    sendPrompt?: (input: { chatId: number; text: string }) => Promise<{ assistantReply: PromptSessionResult }>;
    transcribeVoice?: (input: {
        data: Uint8Array | ArrayBuffer;
        filename: string;
        mimeType?: string | null;
    }) => Promise<{ text: string }>;
} = {}) {
    const errors: unknown[] = [];
    const pendingActionRepo = new InMemoryPendingActionRepository();
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
            pendingActionRepo,
            sessionRepo,
            sendPromptUseCase: {
                execute: options.sendPrompt ?? (async () => ({
                    assistantReply: createPromptReply(),
                })),
            },
            voiceTranscriptionService: {
                getStatus() {
                    return {
                        status: "configured" as const,
                        model: "openai/gpt-audio-mini",
                    };
                },
                transcribeVoice: options.transcribeVoice ?? (async () => ({
                    text: "voice prompt",
                })),
            },
            telegramFileClient: {
                downloadFile: options.downloadFile ?? (async () => ({
                    data: Uint8Array.from([1, 2, 3]),
                    mimeType: "audio/ogg",
                })),
            },
        } as never,
        errors,
        pendingActionRepo,
        sessionRepo,
        warnings,
    };
}

test("handleVoiceMessage downloads voice files, transcribes them, and reuses the normal prompt reply flow", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    const downloadCalls: Array<{ filePath: string }> = [];
    const transcriptionCalls: Array<{ filename: string; mimeType?: string | null; bytes: number[] }> = [];
    let nextMessageId = 1000;
    const { dependencies } = createDependencies({
        downloadFile: async (input) => {
            downloadCalls.push(input);
            return {
                data: Uint8Array.from([7, 8, 9]),
                mimeType: "audio/ogg",
            };
        },
        transcribeVoice: async (input) => {
            const bytes = input.data instanceof Uint8Array
                ? [...input.data]
                : [...new Uint8Array(input.data)];

            transcriptionCalls.push({
                filename: input.filename,
                mimeType: input.mimeType ?? null,
                bytes,
            });

            return {
                text: "voice prompt",
            };
        },
        sendPrompt: async ({ chatId, text }) => {
            assert.equal(chatId, 1);
            assert.equal(text, "voice prompt");

            return {
                assistantReply: createPromptReply(),
            };
        },
    });

    await handleVoiceMessage(
        {
            chat: { id: 1 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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

    assert.deepEqual(downloadCalls, [{ filePath: "voice/file_123.ogg" }]);
    assert.deepEqual(transcriptionCalls, [
        {
            filename: "file_123.ogg",
            mimeType: "audio/ogg",
            bytes: [7, 8, 9],
        },
    ]);
    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: "*Hello*\n\nDuration: 120 ms \\| Tokens: 42",
            other: { parse_mode: "MarkdownV2" },
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 1, messageId: 1000 }]);
});

test("handleVoiceMessage shares the active prompt lock with plain text messages", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1100;
    let releaseTranscription: (() => void) | null = null;
    const transcriptionGate = new Promise<void>((resolve) => {
        releaseTranscription = resolve;
    });
    const { dependencies } = createDependencies({
        transcribeVoice: async () => {
            await transcriptionGate;
            return {
                text: "voice prompt",
            };
        },
        sendPrompt: async ({ text }) => {
            assert.equal(text, "voice prompt");
            return {
                assistantReply: createPromptReply(),
            };
        },
    });

    const firstCall = handleVoiceMessage(
        {
            chat: { id: 11 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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

    await new Promise((resolve) => setImmediate(resolve));

    await handleTextMessage(
        {
            chat: { id: 11 },
            message: { text: "interrupt" },
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

    releaseTranscription?.();
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
    assert.deepEqual(deleted, [{ chatId: 11, messageId: 1100 }]);
});

test("handleVoiceMessage surfaces Telegram download failures and still deletes the processing placeholder", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1200;
    const { dependencies, errors } = createDependencies({
        downloadFile: async () => {
            throw new TelegramFileDownloadError("network failed");
        },
    });

    await handleVoiceMessage(
        {
            chat: { id: 12 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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
            text: "Failed to download the Telegram voice file.\nCause: network failed",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 12, messageId: 1200 }]);
    assert.equal(errors.length, 1);
    return;

    assert.deepEqual(replies, [
        { text: "处理中...", other: undefined },
        {
            text: "未配置语音转写服务。\n原因: Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 13, messageId: 1300 }]);
    return;

    assert.deepEqual(replies, [
        { text: "Processing...", other: undefined },
        {
            text: "Failed to download the Telegram voice file.\nCause: network failed",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 12, messageId: 1200 }]);
    assert.equal(errors.length, 1);
});

test("handleVoiceMessage reports OpenRouter configuration errors with Chinese copy", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1300;
    const { dependencies, sessionRepo } = createDependencies({
        transcribeVoice: async () => {
            throw new VoiceTranscriptionNotConfiguredError(
                "Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
            );
        },
    });

    await sessionRepo.setCurrent({
        chatId: 13,
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

    await handleVoiceMessage(
        {
            chat: { id: 13 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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
            text: "未配置语音转写服务。\n原因: Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 13, messageId: 1300 }]);
    return;

    assert.deepEqual(replies, [
        { text: "处理中...", other: undefined },
        {
            text: "未配置语音转写服务。\n原因: Set openrouter.apiKey in the global config (~/.config/opencode/opencode-tbot/config.json) to enable Telegram voice transcription.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 13, messageId: 1300 }]);
});

test("handleVoiceMessage reports missing ffmpeg dependencies with Chinese copy", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1310;
    const { dependencies, sessionRepo } = createDependencies({
        transcribeVoice: async () => {
            throw new VoiceTranscodingDependencyError(
                "ffmpeg_missing",
                "System ffmpeg is not available in PATH.",
            );
        },
    });

    await sessionRepo.setCurrent({
        chatId: 131,
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

    await handleVoiceMessage(
        {
            chat: { id: 131 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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
            text: "语音转码依赖不可用。\n原因: System ffmpeg is not available in PATH.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 131, messageId: 1310 }]);
});

test("handleVoiceMessage reports transcoding failures with Chinese copy", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1320;
    const { dependencies, sessionRepo } = createDependencies({
        transcribeVoice: async () => {
            throw new VoiceTranscodingFailedError("Voice transcoding timed out.");
        },
    });

    await sessionRepo.setCurrent({
        chatId: 132,
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

    await handleVoiceMessage(
        {
            chat: { id: 132 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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
            text: "语音转码失败。\n原因: Voice transcoding timed out.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 132, messageId: 1320 }]);
});

test("handleVoiceMessage surfaces empty transcriptions", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const deleted: Array<{ chatId: number; messageId: number }> = [];
    let nextMessageId = 1400;
    const { dependencies } = createDependencies({
        transcribeVoice: async () => {
            throw new VoiceTranscriptEmptyError("Voice transcription returned empty text.");
        },
    });

    await handleVoiceMessage(
        {
            chat: { id: 14 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
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
            text: "Voice transcription returned empty text.\nCause: Voice transcription returned empty text.",
            other: undefined,
        },
    ]);
    assert.deepEqual(deleted, [{ chatId: 14, messageId: 1400 }]);
});

test("handleVoiceMessage blocks voice prompts while waiting for a session rename", async () => {
    const replies: Array<{ text: string; other?: unknown }> = [];
    const { dependencies, pendingActionRepo } = createDependencies({
        sendPrompt: async () => {
            throw new Error("should not run");
        },
    });

    await pendingActionRepo.set({
        chatId: 15,
        kind: "session_rename",
        sessionId: "session-1",
        menuMessageId: 222,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    await handleVoiceMessage(
        {
            chat: { id: 15 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                    file_size: 3,
                    mime_type: "audio/ogg",
                },
            },
            async getFile() {
                return {
                    file_path: "voice/file_123.ogg",
                };
            },
            api: {
                async deleteMessage() {
                    return true;
                },
            },
            async reply(text, other) {
                replies.push({ text, other });
                return { message_id: 1500 };
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

