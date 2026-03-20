import assert from "node:assert/strict";
import test from "node:test";
import { handleVoiceMessage } from "../src/bot/handlers/voice.handler.js";
import { InMemoryPendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";

function createDependencies() {
    const pendingActionRepo = new InMemoryPendingActionRepository();
    const sessionRepo = new InMemorySessionRepository();

    return {
        dependencies: {
            logger: {
                error() { },
                warn() { },
            },
            pendingActionRepo,
            sessionRepo,
            sendPromptUseCase: {
                async execute() {
                    throw new Error("should not run");
                },
            },
        } as never,
        pendingActionRepo,
        sessionRepo,
    };
}

test("handleVoiceMessage rejects voice messages without entering the prompt flow", async () => {
    const replies: string[] = [];
    const { dependencies } = createDependencies();

    await handleVoiceMessage(
        {
            chat: { id: 1 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                },
            },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        "Voice messages are not supported. Send text or an image instead.",
    ]);
});

test("handleVoiceMessage localizes the unsupported reply for Chinese chats", async () => {
    const replies: string[] = [];
    const { dependencies, sessionRepo } = createDependencies();

    await sessionRepo.setCurrent({
        chatId: 2,
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
            chat: { id: 2 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                },
            },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        "暂不支持语音消息，请改发文本或图片。",
    ]);
});

test("handleVoiceMessage keeps the rename-pending guard ahead of the unsupported reply", async () => {
    const replies: string[] = [];
    const { dependencies, pendingActionRepo } = createDependencies();

    await pendingActionRepo.set({
        chatId: 3,
        kind: "session_rename",
        sessionId: "session-1",
        menuMessageId: 222,
        returnPage: 0,
        updatedAt: new Date(0).toISOString(),
    });

    await handleVoiceMessage(
        {
            chat: { id: 3 },
            message: {
                voice: {
                    duration: 3,
                    file_id: "voice-file-id",
                },
            },
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.deepEqual(replies, [
        "Waiting for the new session name. Send plain text or /cancel.",
    ]);
});
