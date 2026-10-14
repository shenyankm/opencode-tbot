import assert from "node:assert/strict";
import test from "node:test";
import { handlePermissionApprovalCallback } from "../src/bot/handlers/callback.handler.js";
import type { AppContainer } from "../src/app/container.js";
import { handleTelegramBotPluginEvent } from "../src/app/plugin-events.js";
import { InMemoryPermissionApprovalRepository } from "../src/repositories/permission-approval.repo.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import type { TelegramBotRuntime } from "../src/app/runtime.js";
import type { AppLogger } from "../src/infra/logger/index.js";

const logger = {
    child() {
        return this;
    },
    debug() { },
    error() { },
    info() { },
    warn() { },
    async flush() { },
} as AppLogger;

function createRuntime() {
    const sessionRepo = new InMemorySessionRepository();
    const permissionApprovalRepo = new InMemoryPermissionApprovalRepository();
    const messages: Array<{ chatId: number; text: string; options?: unknown }> = [];
    const edits: Array<{ chatId: number; messageId: number; text: string }> = [];
    const replies: Array<{ sessionId: string; requestId: string; reply: string }> = [];
    const runtime = {
        bot: {
            api: {
                async editMessageText(chatId: number, messageId: number, text: string) {
                    edits.push({ chatId, messageId, text });
                    return true;
                },
                async sendMessage(chatId: number, text: string, options?: unknown) {
                    messages.push({ chatId, text, options });
                    return {
                        message_id: messages.length,
                    };
                },
            },
        },
        container: {
            logger,
            sessionRepo,
            permissionApprovalRepo,
            foregroundSessionTracker: new ForegroundSessionTracker(),
            opencodeClient: {
                async replyToPermission(sessionId: string, requestId: string, reply: string) {
                    replies.push({ sessionId, requestId, reply });
                    return true;
                },
            },
        },
        stop() { },
        async dispose() { },
    } as unknown as TelegramBotRuntime & {
        container: AppContainer;
    };

    return {
        edits,
        messages,
        permissionApprovalRepo,
        replies,
        runtime,
        sessionRepo,
    };
}

test("permission.asked sends Telegram approval messages and persists them", async () => {
    const { runtime, sessionRepo, permissionApprovalRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 101,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: {
            id: "request-1",
            sessionID: "session-1",
            action: "read",
            resources: ["src/**"],
            metadata: {},
            save: [],
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-1");

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, 101);
    assert.match(messages[0]?.text ?? "", /Permission Request/);
    assert.deepEqual(approvals, [{
        requestId: "request-1",
        sessionId: "session-1",
        chatId: 101,
        messageId: 1,
        status: "pending",
        updatedAt: approvals[0]?.updatedAt,
    }]);
});

test("permission.asked deduplicates requests received more than once", async () => {
    const { runtime, sessionRepo, permissionApprovalRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 111,
        sessionId: "session-root",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: {
            id: "request-root",
            sessionID: "session-root",
            action: "write",
            resources: ["README.md"],
            metadata: {},
            save: [],
        },
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: {
            id: "request-root",
            sessionID: "session-root",
            action: "write",
            resources: ["README.md"],
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-root");

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, 111);
    assert.equal(approvals[0]?.sessionId, "session-root");
    assert.equal(approvals[0]?.requestId, "request-root");
});

test("permission.asked also routes foreground child-session approvals back to the active Telegram chat", async () => {
    const { runtime, permissionApprovalRepo, messages } = createRuntime();

    const stopTracking = runtime.container.foregroundSessionTracker.begin(202, "session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: {
            id: "request-child",
            sessionID: "session-child",
            action: "write",
            resources: ["README.md"],
            metadata: {},
            save: [],
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-child");

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, 202);
    assert.deepEqual(approvals, [{
        requestId: "request-child",
        sessionId: "session-child",
        chatId: 202,
        messageId: 1,
        status: "pending",
        updatedAt: approvals[0]?.updatedAt,
    }]);
    stopTracking();
});

test("permission.asked retries with plain text when Telegram rejects the MarkdownV2 payload", async () => {
    const { runtime, sessionRepo, permissionApprovalRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 212,
        sessionId: "session-special",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    const originalSendMessage = runtime.bot.api.sendMessage;

    runtime.bot.api.sendMessage = async (chatId, text, options) => {
        if ((options as { parse_mode?: string } | undefined)?.parse_mode === "MarkdownV2") {
            throw new Error("can't parse entities");
        }

        return originalSendMessage(chatId, text, options);
    };

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: {
            id: "request-special",
            sessionID: "session-special",
            action: "write",
            resources: ["README_[draft].md"],
            metadata: {},
            save: [],
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-special");

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, 212);
    assert.equal((messages[0]?.options as { parse_mode?: string } | undefined)?.parse_mode, undefined);
    assert.match(messages[0]?.text ?? "", /README_\[draft\]\.md/u);
    assert.equal(approvals[0]?.requestId, "request-special");
});

test("permission.replied updates existing Telegram approval messages", async () => {
    const { runtime, permissionApprovalRepo, edits } = createRuntime();

    await permissionApprovalRepo.set({
        requestId: "request-1",
        sessionId: "session-1",
        chatId: 101,
        messageId: 55,
        status: "pending",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.replied",
        data: {
            sessionID: "session-1",
            requestID: "request-1",
            reply: "always",
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-1");

    assert.deepEqual(edits, [{
        chatId: 101,
        messageId: 55,
        text: "Permission request resolved.\n\nRequest: request-1\nReply: always allow",
    }]);
    assert.equal(approvals[0]?.status, "always");
});

test("permission callback replies through the OpenCode client and updates local state", async () => {
    const { permissionApprovalRepo, replies } = createRuntime();

    await permissionApprovalRepo.set({
        requestId: "request-1",
        sessionId: "session-1",
        chatId: 101,
        messageId: 55,
        status: "pending",
        updatedAt: new Date(0).toISOString(),
    });

    let editedText = "";
    await handlePermissionApprovalCallback({
        chat: { id: 101 },
        callbackQuery: {
            data: "permission:once:request-1",
            message: { message_id: 55 },
        },
        async answerCallbackQuery() {
            return true;
        },
        async editMessageText(text: string) {
            editedText = text;
            return true;
        },
    }, {
        logger,
        opencodeClient: {
            async replyToPermission(sessionId: string, requestId: string, reply: string) {
                replies.push({ sessionId, requestId, reply });
                return true;
            },
        },
        permissionApprovalRepo,
        sessionRepo: {
            async getByChatId() {
                return {
                    chatId: 101,
                    sessionId: "session-1",
                    projectId: "project-1",
                    directory: "E:/repo",
                    agentName: null,
                    modelProviderId: null,
                    modelId: null,
                    modelVariant: null,
                    language: "en",
                    updatedAt: new Date(0).toISOString(),
                };
            },
        },
    } as never);

    const approvals = await permissionApprovalRepo.listByRequestId("request-1");

    assert.deepEqual(replies, [{
        sessionId: "session-1",
        requestId: "request-1",
        reply: "once",
    }]);
    assert.equal(editedText, "Permission request resolved.\n\nRequest: request-1\nReply: allow once");
    assert.equal(approvals[0]?.status, "once");
});

test("permission callback keeps local state pending when the OpenCode host rejects the reply", async () => {
    const { permissionApprovalRepo } = createRuntime();

    await permissionApprovalRepo.set({
        requestId: "request-2",
        sessionId: "session-2",
        chatId: 102,
        messageId: 56,
        status: "pending",
        updatedAt: new Date(0).toISOString(),
    });

    let editedText = "";
    await handlePermissionApprovalCallback({
        chat: { id: 102 },
        callbackQuery: {
            data: "permission:reject:request-2",
            message: { message_id: 56 },
        },
        async answerCallbackQuery() {
            return true;
        },
        async editMessageText(text: string) {
            editedText = text;
            return true;
        },
    }, {
        logger,
        opencodeClient: {
            async replyToPermission() {
                return false;
            },
        },
        permissionApprovalRepo,
        sessionRepo: {
            async getByChatId() {
                return {
                    chatId: 102,
                    sessionId: "session-2",
                    projectId: "project-1",
                    directory: "E:/repo",
                    agentName: null,
                    modelProviderId: null,
                    modelId: null,
                    modelVariant: null,
                    language: "en",
                    updatedAt: new Date(0).toISOString(),
                };
            },
        },
    } as never);

    const approvals = await permissionApprovalRepo.listByRequestId("request-2");

    assert.equal(editedText, "Failed to reply to the permission request.");
    assert.equal(approvals[0]?.status, "pending");
});

test("session.execution.failed suppresses foreground child-session notifications and clears tracking", async () => {
    const { runtime, messages } = createRuntime();

    const foregroundRequest = runtime.container.foregroundSessionTracker.acquire(303);
    foregroundRequest?.attachSession("session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.execution.failed",
        data: {
            sessionID: "session-child",
            error: {
                type: "provider.invalid-request",
                message: "boom",
                status: 400,
            },
        },
    });

    assert.deepEqual(messages, []);
    assert.equal(runtime.container.foregroundSessionTracker.isForeground("session-child"), false);
    assert.equal(foregroundRequest?.signal.aborted, true);
    assert.equal((foregroundRequest?.signal.reason as Error)?.name, "provider.invalid-request");
    assert.equal((foregroundRequest?.signal.reason as Error)?.message, "boom");
    assert.equal((foregroundRequest?.signal.reason as { status?: number })?.status, 400);
});

test("session.execution.failed preserves a plain-object message for foreground child sessions without a named error", async () => {
    const { runtime, messages } = createRuntime();

    const foregroundRequest = runtime.container.foregroundSessionTracker.acquire(313);
    foregroundRequest?.attachSession("session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.execution.failed",
        data: {
            sessionID: "session-child",
            error: {
                message: "provider exploded",
            },
        },
    });

    assert.deepEqual(messages, []);
    assert.equal(runtime.container.foregroundSessionTracker.isForeground("session-child"), false);
    assert.equal(foregroundRequest?.signal.aborted, true);
    assert.equal((foregroundRequest?.signal.reason as Error)?.message, "provider exploded");
});

test("session.idle suppresses foreground child-session notifications and clears tracking", async () => {
    const { runtime, messages } = createRuntime();

    runtime.container.foregroundSessionTracker.begin(404, "session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.idle",
        data: {
            sessionID: "session-child",
        },
    });

    assert.deepEqual(messages, []);
    assert.equal(runtime.container.foregroundSessionTracker.isForeground("session-child"), false);
});

test("session.idle does not send a completion message to bound chats", async () => {
    const { runtime, sessionRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 505,
        sessionId: "session-bound",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.idle",
        data: {
            sessionID: "session-bound",
        },
    });

    assert.deepEqual(messages, []);
});

test("session.status idle does not send a completion message to bound chats", async () => {
    const { runtime, sessionRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 606,
        sessionId: "session-bound",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.status",
        data: {
            sessionID: "session-bound",
            status: {
                type: "idle",
            },
        },
    });

    assert.deepEqual(messages, []);
});

test("session.execution.failed still notifies bound chats when the session is not foreground", async () => {
    const { runtime, sessionRepo, messages } = createRuntime();

    await sessionRepo.setCurrent({
        chatId: 707,
        sessionId: "session-bound",
        projectId: "project-1",
        directory: "E:/repo",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    });

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.execution.failed",
        data: {
            sessionID: "session-bound",
            error: {
                type: "provider.invalid-request",
                message: "boom",
            },
        },
    });

    assert.deepEqual(messages, [{
        chatId: 707,
        text: "Session failed.\n\nSession: session-bound\nError: boom",
        options: undefined,
    }]);
});

test("V2 event handlers ignore malformed permission requests and replies", async () => {
    const { runtime, messages, edits, permissionApprovalRepo } = createRuntime();
    runtime.container.foregroundSessionTracker.begin(888, "session-foreground");

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        data: { id: "request-invalid", sessionID: "session-foreground", resources: [] },
    });
    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.replied",
        data: { requestID: "request-invalid", sessionID: "session-foreground", reply: "allow" },
    });

    assert.deepEqual(messages, []);
    assert.deepEqual(edits, []);
    assert.deepEqual(await permissionApprovalRepo.listByRequestId("request-invalid"), []);
});
