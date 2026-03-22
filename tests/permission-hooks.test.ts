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
    const replies: Array<{ requestId: string; reply: string }> = [];
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
                async replyToPermission(requestId: string, reply: string) {
                    replies.push({ requestId, reply });
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
        properties: {
            id: "request-1",
            sessionID: "session-1",
            permission: "read",
            patterns: ["src/**"],
            metadata: {},
            always: [],
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

test("permission.updated from the root SDK event stream is normalized into Telegram approval messages", async () => {
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
        type: "permission.updated",
        properties: {
            id: "permission-1",
            sessionID: "session-root",
            type: "write",
            pattern: ["README.md"],
            metadata: {},
            time: {
                created: 1,
            },
            title: "Write README.md",
            messageID: "message-1",
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("permission-1");

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, 111);
    assert.match(messages[0]?.text ?? "", /Permission Request/);
    assert.match(messages[0]?.text ?? "", /README\.md/);
    assert.equal(approvals[0]?.requestId, "permission-1");
});

test("permission.asked also routes foreground child-session approvals back to the active Telegram chat", async () => {
    const { runtime, permissionApprovalRepo, messages } = createRuntime();

    const stopTracking = runtime.container.foregroundSessionTracker.begin(202, "session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "permission.asked",
        properties: {
            id: "request-child",
            sessionID: "session-child",
            permission: "write",
            patterns: ["README.md"],
            metadata: {},
            always: [],
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
        properties: {
            sessionID: "session-1",
            requestID: "request-1",
            reply: "always",
        },
    });

    const approvals = await permissionApprovalRepo.listByRequestId("request-1");

    assert.deepEqual(edits, [{
        chatId: 101,
        messageId: 55,
        text: "Permission request resolved.\n\nRequest: request-1\nReply: always",
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
            async replyToPermission(requestId: string, reply: string) {
                replies.push({ requestId, reply });
                return true;
            },
        },
        permissionApprovalRepo,
    } as never);

    const approvals = await permissionApprovalRepo.listByRequestId("request-1");

    assert.deepEqual(replies, [{
        requestId: "request-1",
        reply: "once",
    }]);
    assert.equal(editedText, "Permission request resolved.\n\nRequest: request-1\nReply: once");
    assert.equal(approvals[0]?.status, "once");
});

test("session.error suppresses foreground child-session notifications and clears tracking", async () => {
    const { runtime, messages } = createRuntime();

    const foregroundRequest = runtime.container.foregroundSessionTracker.acquire(303);
    foregroundRequest?.attachSession("session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.error",
        properties: {
            sessionID: "session-child",
            error: {
                name: "APIError",
                data: {
                    message: "boom",
                    statusCode: 400,
                },
            },
        },
    });

    assert.deepEqual(messages, []);
    assert.equal(runtime.container.foregroundSessionTracker.isForeground("session-child"), false);
    assert.equal(foregroundRequest?.signal.aborted, true);
    assert.equal((foregroundRequest?.signal.reason as { name?: string })?.name, "APIError");
    assert.equal((foregroundRequest?.signal.reason as { data?: { message?: string } })?.data?.message, "boom");
});

test("session.idle suppresses foreground child-session notifications and clears tracking", async () => {
    const { runtime, messages } = createRuntime();

    runtime.container.foregroundSessionTracker.begin(404, "session-child");

    await handleTelegramBotPluginEvent(runtime, {
        type: "session.idle",
        properties: {
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
        properties: {
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
        properties: {
            sessionID: "session-bound",
            status: {
                type: "idle",
            },
        },
    });

    assert.deepEqual(messages, []);
});

test("session.error still notifies bound chats when the session is not foreground", async () => {
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
        type: "session.error",
        properties: {
            sessionID: "session-bound",
            error: {
                name: "APIError",
                data: {
                    message: "boom",
                },
            },
        },
    });

    assert.deepEqual(messages, [{
        chatId: 707,
        text: "Session failed.\n\nSession: session-bound\nError: boom",
        options: undefined,
    }]);
});
